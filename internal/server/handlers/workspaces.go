package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/kyklos/kyklos/internal/engine"
	"github.com/kyklos/kyklos/internal/gitbranches"
	"github.com/kyklos/kyklos/internal/models"
	"github.com/kyklos/kyklos/internal/store"
)

// WorkspaceHandler manages dashboard workspaces (Git repo + branch cache).
type WorkspaceHandler struct {
	Store store.Store
	// Ws reads files from cached clones; nil disables GET .../file.
	Ws *engine.WorkspaceManager
}

// Mount registers /workspaces routes (caller mounts under /api/v1).
func (h *WorkspaceHandler) Mount(r chi.Router) {
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Route("/{workspaceID}", func(r chi.Router) {
		r.Get("/file", h.GetFile)
		r.Get("/", h.Get)
		r.Delete("/", h.Delete)
		r.Post("/scan-branches", h.ScanBranches)
	})
}

func (h *WorkspaceHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ListWorkspaces(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if list == nil {
		list = []*models.Workspace{}
	}
	respondJSON(w, http.StatusOK, list)
}

func (h *WorkspaceHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "workspaceID")
	ws, err := h.Store.GetWorkspace(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "workspace not found")
		return
	}
	respondJSON(w, http.StatusOK, ws)
}

type workspaceFileResponse struct {
	Content string `json:"content"`
	Branch  string `json:"branch"`
	Path    string `json:"path"`
}

// GetFile handles GET /workspaces/{workspaceID}/file?branch=&path=
// Fetches file contents from the remote at the branch tip (default path kyklos.yaml).
func (h *WorkspaceHandler) GetFile(w http.ResponseWriter, r *http.Request) {
	if h.Ws == nil {
		respondError(w, http.StatusServiceUnavailable, "workspace file API not configured")
		return
	}
	id := chi.URLParam(r, "workspaceID")
	ws, err := h.Store.GetWorkspace(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "workspace not found")
		return
	}
	branch := strings.TrimSpace(r.URL.Query().Get("branch"))
	path := strings.TrimSpace(r.URL.Query().Get("path"))
	if path == "" {
		path = "kyklos.yaml"
	}
	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()
	raw, err := h.Ws.ReadRepoFile(ctx, ws.RepoURL, ws.DefaultBranch, branch, path)
	if err != nil {
		msg := err.Error()
		low := strings.ToLower(msg)
		if strings.Contains(low, "does not exist") || strings.Contains(low, "not found") ||
			strings.Contains(low, "ambiguous argument") || strings.Contains(low, "invalid object name") ||
			strings.Contains(low, "bad object") {
			respondError(w, http.StatusNotFound, msg)
			return
		}
		respondError(w, http.StatusBadGateway, msg)
		return
	}
	effectiveBr := strings.TrimSpace(branch)
	if effectiveBr == "" {
		effectiveBr = strings.TrimSpace(ws.DefaultBranch)
	}
	if effectiveBr == "" {
		effectiveBr = "main"
	}
	respondJSON(w, http.StatusOK, workspaceFileResponse{
		Content: string(raw),
		Branch:  effectiveBr,
		Path:    path,
	})
}

type createWorkspaceBody struct {
	Name    string `json:"name"`
	RepoURL string `json:"repo_url"`
}

func (h *WorkspaceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body createWorkspaceBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	url := strings.TrimSpace(body.RepoURL)
	if url == "" {
		respondError(w, http.StatusBadRequest, "repo_url is required")
		return
	}
	if err := validatePublicRepoURL(url); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = shortenRepoLabel(url)
	}

	ws := &models.Workspace{Name: name, RepoURL: url, DefaultBranch: "main"}
	scanCtx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	if branches, err := gitbranches.ListHeads(scanCtx, url); err == nil && len(branches) > 0 {
		ws.Branches = branches
		now := time.Now().UTC()
		ws.BranchesUpdatedAt = &now
		ws.DefaultBranch = pickDefaultBranchName(branches)
	}

	if err := h.Store.CreateWorkspace(r.Context(), ws); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, ws)
}

func (h *WorkspaceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "workspaceID")
	n, err := h.Store.CountPipelinesInWorkspace(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if n > 0 {
		respondError(w, http.StatusConflict, "workspace still has pipelines; delete or move them first")
		return
	}
	if _, err := h.Store.GetWorkspace(r.Context(), id); err != nil {
		respondError(w, http.StatusNotFound, "workspace not found")
		return
	}
	if err := h.Store.DeleteWorkspace(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *WorkspaceHandler) ScanBranches(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "workspaceID")
	ws, err := h.Store.GetWorkspace(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "workspace not found")
		return
	}
	scanCtx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	branches, err := gitbranches.ListHeads(scanCtx, ws.RepoURL)
	if err != nil {
		respondError(w, http.StatusBadGateway, "git ls-remote failed: "+err.Error())
		return
	}
	ws.Branches = branches
	now := time.Now().UTC()
	ws.BranchesUpdatedAt = &now
	if len(branches) > 0 {
		// Keep default unless current default disappeared
		cur := strings.TrimSpace(ws.DefaultBranch)
		found := false
		for _, b := range branches {
			if b == cur {
				found = true
				break
			}
		}
		if !found {
			ws.DefaultBranch = pickDefaultBranchName(branches)
		}
	}
	if err := h.Store.UpdateWorkspace(r.Context(), ws); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, ws)
}

func validatePublicRepoURL(u string) error {
	lu := strings.ToLower(strings.TrimSpace(u))
	if strings.HasPrefix(lu, "https://") || strings.HasPrefix(lu, "http://") {
		return nil
	}
	return fmt.Errorf("repo_url must be an http(s) clone URL (e.g. https://github.com/org/repo.git)")
}

func shortenRepoLabel(url string) string {
	url = strings.TrimSuffix(strings.TrimSpace(url), "/")
	url = strings.TrimSuffix(url, ".git")
	if i := strings.LastIndex(url, "/"); i >= 0 && i+1 < len(url) {
		return url[i+1:]
	}
	return url
}

func pickDefaultBranchName(branches []string) string {
	for _, pref := range []string{"main", "master"} {
		for _, b := range branches {
			if strings.EqualFold(b, pref) {
				return b
			}
		}
	}
	if len(branches) > 0 {
		return branches[0]
	}
	return "main"
}
