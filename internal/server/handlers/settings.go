package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/kyklos/kyklos/internal/store"
)

const (
	maxGlobalEnvKeys   = 64
	maxGlobalEnvKeyLen = 128
	maxGlobalEnvValLen = 32768
)

// SettingsHandler exposes dashboard-backed server settings (e.g. global env).
type SettingsHandler struct {
	Store store.Store
}

type globalEnvBody struct {
	Env map[string]string `json:"env"`
}

// GetEnv returns persisted global environment variables for pipeline runs.
func (h *SettingsHandler) GetEnv(w http.ResponseWriter, r *http.Request) {
	env, err := h.Store.GetGlobalEnv(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if env == nil {
		env = map[string]string{}
	}
	respondJSON(w, http.StatusOK, globalEnvBody{Env: env})
}

// PutEnv replaces global environment variables (merged into every run; pipeline YAML env wins on duplicate keys).
func (h *SettingsHandler) PutEnv(w http.ResponseWriter, r *http.Request) {
	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	rawEnv, ok := raw["env"]
	if !ok {
		respondError(w, http.StatusBadRequest, "missing env object")
		return
	}
	var inter map[string]interface{}
	if err := json.Unmarshal(rawEnv, &inter); err != nil {
		respondError(w, http.StatusBadRequest, "env must be a JSON object")
		return
	}
	if inter == nil {
		inter = map[string]interface{}{}
	}
	if len(inter) > maxGlobalEnvKeys {
		respondError(w, http.StatusBadRequest, "too many keys (max 64)")
		return
	}
	out := make(map[string]string, len(inter))
	for k, v := range inter {
		k = strings.TrimSpace(k)
		if k == "" {
			respondError(w, http.StatusBadRequest, "empty env key")
			return
		}
		if utf8.RuneCountInString(k) > maxGlobalEnvKeyLen {
			respondError(w, http.StatusBadRequest, "env key too long")
			return
		}
		s, ok := v.(string)
		if !ok {
			respondError(w, http.StatusBadRequest, "all env values must be strings")
			return
		}
		if len(s) > maxGlobalEnvValLen {
			respondError(w, http.StatusBadRequest, "env value too long")
			return
		}
		out[k] = s
	}
	if err := h.Store.SetGlobalEnv(r.Context(), out); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, globalEnvBody{Env: out})
}
