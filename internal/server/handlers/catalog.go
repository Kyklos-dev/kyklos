package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// CatalogHandler serves built-in step metadata from the steps/ directory.
type CatalogHandler struct {
	StepsDir string
}

// StepMeta is one discovered Python step script.
type StepMeta struct {
	Path        string `json:"path"`        // e.g. build/lint.py
	Category    string `json:"category"`    // top-level dir under steps/
	Name        string `json:"name"`        // file base without .py
	Description string `json:"description"` // short docstring or placeholder
	SizeBytes   int64  `json:"size_bytes"`
}

// Steps handles GET /api/v1/catalog/steps
func (h *CatalogHandler) Steps(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(h.StepsDir) == "" {
		respondJSON(w, http.StatusOK, []StepMeta{})
		return
	}
	root, err := filepath.Abs(h.StepsDir)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "steps dir: "+err.Error())
		return
	}
	st, err := os.Stat(root)
	if err != nil || !st.IsDir() {
		respondJSON(w, http.StatusOK, []StepMeta{})
		return
	}

	var out []StepMeta
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(strings.ToLower(path), ".py") {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		parts := strings.Split(rel, "/")
		cat := ""
		if len(parts) > 1 {
			cat = parts[0]
		}
		base := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		info, _ := d.Info()
		var size int64
		if info != nil {
			size = info.Size()
		}
		desc := peekPythonDescription(path)
		out = append(out, StepMeta{
			Path:        rel,
			Category:    cat,
			Name:        base,
			Description: desc,
			SizeBytes:   size,
		})
		return nil
	})

	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	respondJSON(w, http.StatusOK, out)
}

func peekPythonDescription(path string) string {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return ""
	}
	s := string(data)
	if i := strings.Index(s, `"""`); i >= 0 {
		rest := s[i+3:]
		if j := strings.Index(rest, `"""`); j >= 0 {
			doc := strings.TrimSpace(rest[:j])
			doc = strings.Join(strings.Fields(doc), " ")
			if len(doc) > 280 {
				return doc[:277] + "…"
			}
			if doc != "" {
				return doc
			}
		}
	}
	// Fallback: first #-comment (not shebang)
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#!") {
			continue
		}
		if strings.HasPrefix(line, "#") {
			t := strings.TrimSpace(strings.TrimPrefix(line, "#"))
			if t != "" {
				if len(t) > 200 {
					return t[:197] + "…"
				}
				return t
			}
		}
		break
	}
	return ""
}
