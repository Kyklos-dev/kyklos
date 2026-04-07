package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/kyklos/kyklos/internal/models"
	"github.com/kyklos/kyklos/internal/store"
)

// ArtifactHandler exposes global artifact listing (cross-run).
type ArtifactHandler struct {
	store store.Store
}

// NewArtifactHandler returns a handler for GET /api/v1/artifacts.
func NewArtifactHandler(st store.Store) *ArtifactHandler {
	return &ArtifactHandler{store: st}
}

// ListAll handles GET /api/v1/artifacts?q=&pipeline=&limit=
func (h *ArtifactHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 300
	if v := strings.TrimSpace(q.Get("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	f := store.ListArtifactsFilter{
		NameContains:     strings.TrimSpace(q.Get("q")),
		PipelineContains: strings.TrimSpace(q.Get("pipeline")),
		Limit:            limit,
	}
	items, err := h.store.ListArtifactsAll(r.Context(), f)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "list artifacts: "+err.Error())
		return
	}
	if items == nil {
		items = []*models.ArtifactListItem{}
	}
	respondJSON(w, http.StatusOK, items)
}
