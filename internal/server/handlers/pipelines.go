package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/kyklos/kyklos/internal/engine"
	"github.com/kyklos/kyklos/internal/models"
	"github.com/kyklos/kyklos/internal/store"
	"gopkg.in/yaml.v3"
)

// PipelineHandler handles pipeline CRUD endpoints.
type PipelineHandler struct {
	store     store.Store
	scheduler *schedulerFacade
}

// schedulerFacade adapts engine.Scheduler to avoid a circular import.
type schedulerFacade struct {
	reload  func()
	trigger func(pipelineID string, req models.TriggerRequest)
}

// NewPipelineHandler creates a PipelineHandler.
// reloadFn is called after any pipeline mutation so the scheduler picks up changes.
// triggerFn dispatches a manual run (can be nil if manual trigger is not needed here).
func NewPipelineHandler(st store.Store, reloadFn func(), triggerFn func(string, models.TriggerRequest)) *PipelineHandler {
	return &PipelineHandler{
		store: st,
		scheduler: &schedulerFacade{
			reload:  reloadFn,
			trigger: triggerFn,
		},
	}
}

// ── Route registration ────────────────────────────────────────────────────────

// Mount registers all pipeline routes under the provided chi router.
func (h *PipelineHandler) Mount(r chi.Router) {
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Route("/{pipelineID}", func(r chi.Router) {
		r.Get("/", h.Get)
		r.Put("/", h.Update)
		r.Delete("/", h.Delete)
		r.Put("/baseline", h.SetBaseline)
		r.Delete("/baseline", h.ClearBaseline)
		r.Post("/runs", h.TriggerRun)
		r.Get("/runs", h.ListRuns)
	})
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// List handles GET /api/v1/pipelines
// Optional query: workspace_id=<uuid> — only pipelines in that workspace.
func (h *PipelineHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := strings.TrimSpace(r.URL.Query().Get("workspace_id"))
	var pipelines []*models.Pipeline
	var err error
	if wsID != "" {
		pipelines, err = h.store.ListPipelinesByWorkspace(r.Context(), wsID)
	} else {
		pipelines, err = h.store.ListPipelines(r.Context())
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "list pipelines: "+err.Error())
		return
	}
	if pipelines == nil {
		pipelines = []*models.Pipeline{}
	}
	respondJSON(w, http.StatusOK, pipelines)
}

// Create handles POST /api/v1/pipelines
//
// Body:
//
//	{
//	  "name": "my-agent",
//	  "repo_name": "my-agent",
//	  "yaml_path": "kyklos.yaml",
//	  "yaml": "<raw kyklos.yaml content>"    // parsed and validated server-side
//	}
func (h *PipelineHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		WorkspaceID string `json:"workspace_id"`
		RepoName    string `json:"repo_name"`
		YAMLPath    string `json:"yaml_path"`
		YAML        string `json:"yaml"` // raw kyklos.yaml content
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if strings.TrimSpace(body.YAML) == "" {
		respondError(w, http.StatusBadRequest, "yaml field is required")
		return
	}

	cfg, err := engine.ParsePipelineBytes([]byte(body.YAML), "")
	if err != nil {
		respondError(w, http.StatusUnprocessableEntity, "invalid kyklos.yaml: "+err.Error())
		return
	}

	name := body.Name
	if name == "" {
		name = cfg.Name
	}
	yamlPath := body.YAMLPath
	if yamlPath == "" {
		yamlPath = "kyklos.yaml"
	}

	p := &models.Pipeline{
		Name:        name,
		WorkspaceID: strings.TrimSpace(body.WorkspaceID),
		RepoName:    body.RepoName,
		YAMLPath:    yamlPath,
		Config:      *cfg,
	}
	if p.WorkspaceID != "" {
		if _, err := h.store.GetWorkspace(r.Context(), p.WorkspaceID); err != nil {
			respondError(w, http.StatusBadRequest, "unknown workspace_id")
			return
		}
	}
	if err := h.store.CreatePipeline(r.Context(), p); err != nil {
		respondError(w, http.StatusInternalServerError, "create pipeline: "+err.Error())
		return
	}

	h.scheduler.reload()
	attachPipelineYAML(p)
	respondJSON(w, http.StatusCreated, p)
}

// Get handles GET /api/v1/pipelines/{pipelineID}
func (h *PipelineHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pipelineID")
	p, err := h.store.GetPipeline(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "pipeline not found")
		return
	}
	attachPipelineYAML(p)
	respondJSON(w, http.StatusOK, p)
}

// Update handles PUT /api/v1/pipelines/{pipelineID}
func (h *PipelineHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pipelineID")
	p, err := h.store.GetPipeline(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "pipeline not found")
		return
	}

	var body struct {
		Name        string  `json:"name"`
		WorkspaceID *string `json:"workspace_id"`
		RepoName    string  `json:"repo_name"`
		YAMLPath    string  `json:"yaml_path"`
		YAML        string  `json:"yaml"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}

	if body.WorkspaceID != nil {
		wid := strings.TrimSpace(*body.WorkspaceID)
		if wid != "" {
			if _, err := h.store.GetWorkspace(r.Context(), wid); err != nil {
				respondError(w, http.StatusBadRequest, "unknown workspace_id")
				return
			}
		}
		p.WorkspaceID = wid
	}

	if body.YAML != "" {
		cfg, err := engine.ParsePipelineBytes([]byte(body.YAML), "")
		if err != nil {
			respondError(w, http.StatusUnprocessableEntity, "invalid kyklos.yaml: "+err.Error())
			return
		}
		p.Config = *cfg
	}
	if body.Name != "" {
		p.Name = body.Name
	}
	if body.RepoName != "" {
		p.RepoName = body.RepoName
	}
	if body.YAMLPath != "" {
		p.YAMLPath = body.YAMLPath
	}

	if err := h.store.UpdatePipeline(r.Context(), p); err != nil {
		respondError(w, http.StatusInternalServerError, "update pipeline: "+err.Error())
		return
	}

	h.scheduler.reload()
	attachPipelineYAML(p)
	respondJSON(w, http.StatusOK, p)
}

// SetBaseline handles PUT /api/v1/pipelines/{pipelineID}/baseline
// Body: { "run_id": "<uuid>" }
func (h *PipelineHandler) SetBaseline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pipelineID")
	var body struct {
		RunID string `json:"run_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	runID := strings.TrimSpace(body.RunID)
	if runID == "" {
		respondError(w, http.StatusBadRequest, "run_id is required")
		return
	}
	if err := h.store.SetPipelineBaseline(r.Context(), id, runID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "pipeline not found")
			return
		}
		switch err.Error() {
		case "run not found":
			respondError(w, http.StatusNotFound, err.Error())
		case "run does not belong to this pipeline":
			respondError(w, http.StatusBadRequest, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "set baseline: "+err.Error())
		}
		return
	}
	p, err := h.store.GetPipeline(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "get pipeline: "+err.Error())
		return
	}
	attachPipelineYAML(p)
	respondJSON(w, http.StatusOK, p)
}

// ClearBaseline handles DELETE /api/v1/pipelines/{pipelineID}/baseline
func (h *PipelineHandler) ClearBaseline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pipelineID")
	if err := h.store.SetPipelineBaseline(r.Context(), id, ""); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "pipeline not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "clear baseline: "+err.Error())
		return
	}
	p, err := h.store.GetPipeline(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "get pipeline: "+err.Error())
		return
	}
	attachPipelineYAML(p)
	respondJSON(w, http.StatusOK, p)
}

// Delete handles DELETE /api/v1/pipelines/{pipelineID}
func (h *PipelineHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pipelineID")
	if _, err := h.store.GetPipeline(r.Context(), id); err != nil {
		respondError(w, http.StatusNotFound, "pipeline not found")
		return
	}
	if err := h.store.DeletePipeline(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, "delete pipeline: "+err.Error())
		return
	}
	h.scheduler.reload()
	w.WriteHeader(http.StatusNoContent)
}

// TriggerRun handles POST /api/v1/pipelines/{pipelineID}/runs
func (h *PipelineHandler) TriggerRun(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pipelineID")
	if _, err := h.store.GetPipeline(r.Context(), id); err != nil {
		respondError(w, http.StatusNotFound, "pipeline not found")
		return
	}

	var req models.TriggerRequest
	if r.Body != nil {
		// Do not gate on ContentLength: chunked encoding and some proxies set length -1;
		// skipping decode dropped branch/sha and broke manual runs.
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			respondError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
			return
		}
	}
	req.Trigger = models.TriggerManual

	if h.scheduler == nil || h.scheduler.trigger == nil {
		respondError(w, http.StatusServiceUnavailable, "manual runs not available (scheduler not wired)")
		return
	}
	h.scheduler.trigger(id, req)
	respondJSON(w, http.StatusAccepted, map[string]string{"status": "triggered", "pipeline_id": id})
}

// ListRuns handles GET /api/v1/pipelines/{pipelineID}/runs
// Optional query: enrich=1 — attach chart_metrics (flattened step scores) for the latest 50 runs.
func (h *PipelineHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "pipelineID")
	runs, err := h.store.ListRuns(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "list runs: "+err.Error())
		return
	}
	if runs == nil {
		runs = []*models.Run{}
	}
	if r.URL.Query().Get("enrich") == "1" {
		const maxEnrich = 50
		n := len(runs)
		if n > maxEnrich {
			n = maxEnrich
		}
		for i := 0; i < n; i++ {
			enrichRunChartMetrics(r.Context(), h.store, runs[i])
		}
	}
	respondJSON(w, http.StatusOK, runs)
}

func enrichRunChartMetrics(ctx context.Context, st store.Store, run *models.Run) {
	stages, err := st.GetStageResults(ctx, run.ID)
	if err != nil || len(stages) == 0 {
		return
	}
	m := make(map[string]float64)
	for _, stg := range stages {
		for _, step := range stg.Steps {
			prefix := metricPrefixFromUses(step.Uses)
			for k, v := range step.Scores {
				key := prefix + "_" + k
				m[key] = v
			}
		}
	}
	if len(m) > 0 {
		run.ChartMetrics = m
	}
}

func metricPrefixFromUses(uses string) string {
	uses = strings.TrimPrefix(uses, "kyklos/")
	return strings.ReplaceAll(uses, "/", "_")
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// attachPipelineYAML sets p.YAML to a canonical kyklos.yaml string derived from p.Config
// so the dashboard can pre-fill the edit form (raw text is not stored in SQLite).
func attachPipelineYAML(p *models.Pipeline) {
	b, err := yaml.Marshal(&p.Config)
	if err != nil {
		p.YAML = ""
		return
	}
	p.YAML = strings.TrimSpace(string(b))
}

func respondJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}
