package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kyklos/kyklos/internal/models"
	"github.com/kyklos/kyklos/internal/store"
)

// RunHandler handles run detail and log streaming endpoints.
type RunHandler struct {
	store        store.Store
	artifactRoot string
	// trigger dispatches a manual pipeline run (nil if scheduler not wired).
	trigger func(context.Context, string, models.TriggerRequest) (string, error)
}

func NewRunHandler(st store.Store, artifactRoot string, trigger func(context.Context, string, models.TriggerRequest) (string, error)) *RunHandler {
	return &RunHandler{store: st, artifactRoot: filepath.Clean(artifactRoot), trigger: trigger}
}

// Mount registers all run routes.
func (h *RunHandler) Mount(r chi.Router) {
	r.Get("/", h.ListAll)
	r.Get("/compare", h.CompareRuns)
	r.Post("/{runID}/rerun", h.Rerun)
	r.Get("/{runID}/artifacts/{artifactID}/file", h.DownloadArtifact)
	r.Get("/{runID}/logs", h.StreamLogs)
	r.Post("/{runID}/cancel", h.Cancel)
	r.Get("/{runID}", h.Get)
}

// ListAll handles GET /api/v1/runs?status=&repo=&branch=&limit=
func (h *RunHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 200
	if v := strings.TrimSpace(q.Get("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	f := store.ListRunsFilter{
		Status:         strings.TrimSpace(q.Get("status")),
		RepoContains:   strings.TrimSpace(q.Get("repo")),
		BranchContains: strings.TrimSpace(q.Get("branch")),
		Limit:          limit,
	}
	runs, err := h.store.ListRunsAll(r.Context(), f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "list runs: "+err.Error())
		return
	}
	if runs == nil {
		runs = []*models.RunSummary{}
	}
	respondJSON(w, http.StatusOK, runs)
}

// Rerun handles POST /api/v1/runs/{runID}/rerun — same pipeline, same git ref as the source run.
func (h *RunHandler) Rerun(w http.ResponseWriter, r *http.Request) {
	if h.trigger == nil {
		respondError(w, http.StatusServiceUnavailable, "scheduler not available")
		return
	}
	id := chi.URLParam(r, "runID")
	run, err := h.store.GetRun(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "run not found")
		return
	}
	req := models.TriggerRequest{
		Trigger:   models.TriggerManual,
		GitSHA:    run.GitSHA,
		GitBranch: run.GitBranch,
	}
	runID, err := h.trigger(r.Context(), run.PipelineID, req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "rerun: "+err.Error())
		return
	}
	respondJSON(w, http.StatusAccepted, map[string]string{
		"status":       "triggered",
		"pipeline_id": run.PipelineID,
		"run_id":       runID,
	})
}

// Get handles GET /api/v1/runs/{runID}
// Returns full run detail including stage results.
func (h *RunHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runID")

	run, err := h.store.GetRun(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "run not found")
		return
	}

	stages, err := h.store.GetStageResults(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "get stage results: "+err.Error())
		return
	}
	if stages == nil {
		stages = []*models.StageResult{}
	}

	arts, err := h.store.ListRunArtifacts(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "list artifacts: "+err.Error())
		return
	}
	apiArts := make([]map[string]any, 0, len(arts))
	for _, a := range arts {
		apiArts = append(apiArts, map[string]any{
			"id":           a.ID,
			"run_id":       a.RunID,
			"stage_name":   a.StageName,
			"step_name":    a.StepName,
			"logical_name": a.LogicalName,
			"size_bytes":   a.SizeBytes,
			"created_at":   a.CreatedAt.UTC().Format(time.RFC3339),
		})
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"run":       run,
		"stages":    stages,
		"artifacts": apiArts,
	})
}

// DownloadArtifact serves GET /api/v1/runs/{runID}/artifacts/{artifactID}/file
func (h *RunHandler) DownloadArtifact(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	artifactID := chi.URLParam(r, "artifactID")
	a, err := h.store.GetRunArtifact(r.Context(), runID, artifactID)
	if err != nil {
		respondError(w, http.StatusNotFound, "artifact not found")
		return
	}
	if h.artifactRoot != "" {
		root := filepath.Clean(h.artifactRoot)
		stPath := filepath.Clean(a.StoragePath)
		rel, err := filepath.Rel(root, stPath)
		if err != nil || strings.HasPrefix(rel, "..") {
			respondError(w, http.StatusForbidden, "invalid artifact path")
			return
		}
	}
	data, err := os.ReadFile(a.StoragePath)
	if err != nil {
		respondError(w, http.StatusNotFound, "artifact file missing")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+strings.ReplaceAll(a.LogicalName, `"`, `'`) + "\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// CompareRuns handles GET /api/v1/runs/compare?a=&b=
func (h *RunHandler) CompareRuns(w http.ResponseWriter, r *http.Request) {
	a := strings.TrimSpace(r.URL.Query().Get("a"))
	b := strings.TrimSpace(r.URL.Query().Get("b"))
	if a == "" || b == "" {
		respondError(w, http.StatusBadRequest, "query params a and b are required (run ids)")
		return
	}
	ra, errA := h.store.GetRun(r.Context(), a)
	rb, errB := h.store.GetRun(r.Context(), b)
	if errA != nil || errB != nil {
		respondError(w, http.StatusNotFound, "run not found")
		return
	}
	if ra.PipelineID != rb.PipelineID {
		respondError(w, http.StatusBadRequest, "runs must belong to the same pipeline")
		return
	}
	sa, _ := h.store.GetStageResults(r.Context(), a)
	sb, _ := h.store.GetStageResults(r.Context(), b)
	diff := scoreDiffFlattened(sa, sb)
	respondJSON(w, http.StatusOK, map[string]any{
		"run_a": ra,
		"run_b": rb,
		"score_diff": diff,
		"meta": map[string]any{
			"git_sha": map[string]string{"a": ra.GitSHA, "b": rb.GitSHA},
			"eval_bundle_fingerprint": map[string]string{
				"a": ra.EvalBundleFingerprint,
				"b": rb.EvalBundleFingerprint,
			},
			"eval_bundle_id": map[string]string{"a": ra.EvalBundleID, "b": rb.EvalBundleID},
		},
	})
}

func scoreDiffFlattened(sa, sb []*models.StageResult) map[string]map[string]float64 {
	fa := flattenStageScores(sa)
	fb := flattenStageScores(sb)
	out := make(map[string]map[string]float64)
	keys := map[string]struct{}{}
	for k := range fa {
		keys[k] = struct{}{}
	}
	for k := range fb {
		keys[k] = struct{}{}
	}
	for k := range keys {
		va, oka := fa[k]
		vb, okb := fb[k]
		if !oka {
			va = 0
		}
		if !okb {
			vb = 0
		}
		out[k] = map[string]float64{"a": va, "b": vb, "delta": vb - va}
	}
	return out
}

func flattenStageScores(stages []*models.StageResult) map[string]float64 {
	out := make(map[string]float64)
	for _, st := range stages {
		for _, step := range st.Steps {
			prefix := st.StageName + "." + step.Name + "."
			for k, v := range step.Scores {
				out[prefix+k] = v
			}
		}
	}
	return out
}

// StreamLogs handles GET /api/v1/runs/{runID}/logs
//
// Returns logs as Server-Sent Events (SSE) while the run is active,
// then closes the stream. For completed runs it streams all stored logs
// and closes immediately.
//
// SSE event format:
//
//	data: {"line": "...", "stage": "...", "step": "...", "ts": "..."}
func (h *RunHandler) StreamLogs(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runID")

	run, err := h.store.GetRun(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "run not found")
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering
	w.WriteHeader(http.StatusOK)

	flusher, canFlush := w.(http.Flusher)

	sendEvent := func(entry *models.LogEntry) {
		payload, _ := json.Marshal(map[string]string{
			"line":  entry.Line,
			"stage": entry.StageName,
			"step":  entry.StepName,
			"ts":    entry.CreatedAt.UTC().Format(time.RFC3339),
		})
		fmt.Fprintf(w, "data: %s\n\n", payload)
		if canFlush {
			flusher.Flush()
		}
	}

	sendDone := func() {
		fmt.Fprintf(w, "event: done\ndata: {}\n\n")
		if canFlush {
			flusher.Flush()
		}
	}

	// For a completed/failed/cancelled run, stream all stored logs and close.
	if run.Status != models.RunStatusRunning && run.Status != models.RunStatusPending {
		logs, _ := h.store.GetLogs(r.Context(), id)
		for _, entry := range logs {
			sendEvent(entry)
		}
		sendDone()
		return
	}

	// For an active run, poll for new logs and stream them as they arrive.
	// Uses last-seen log ID as a cursor.
	var lastID int64
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			// Fetch all logs and send any we haven't seen yet
			logs, err := h.store.GetLogs(r.Context(), id)
			if err != nil {
				return
			}
			for _, entry := range logs {
				if entry.ID > lastID {
					sendEvent(entry)
					lastID = entry.ID
				}
			}

			// Check if run finished
			current, err := h.store.GetRun(r.Context(), id)
			if err != nil {
				return
			}
			if current.Status != models.RunStatusRunning && current.Status != models.RunStatusPending {
				// Drain any remaining logs
				logs, _ = h.store.GetLogs(r.Context(), id)
				for _, entry := range logs {
					if entry.ID > lastID {
						sendEvent(entry)
						lastID = entry.ID
					}
				}
				sendDone()
				return
			}
		}
	}
}

// Cancel handles POST /api/v1/runs/{runID}/cancel
func (h *RunHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runID")

	run, err := h.store.GetRun(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "run not found")
		return
	}

	if run.Status != models.RunStatusRunning && run.Status != models.RunStatusPending {
		respondError(w, http.StatusConflict,
			fmt.Sprintf("run is %s, only running or pending runs can be cancelled", run.Status))
		return
	}

	if err := h.store.FinishRun(r.Context(), id, models.RunStatusCancelled, "cancelled by user"); err != nil {
		respondError(w, http.StatusInternalServerError, "cancel run: "+err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "cancelled", "run_id": id})
}
