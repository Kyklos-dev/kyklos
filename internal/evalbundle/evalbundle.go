// Package evalbundle computes immutable fingerprints for eval_bundle blocks in kyklos.yaml.
package evalbundle

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/kyklos/kyklos/internal/config"
)

const formatVersion = 1

// Resolved is the materialized eval bundle for a run (stored on models.Run).
type Resolved struct {
	// Label is the optional human id from eval_bundle.id.
	Label string `json:"label,omitempty"`
	// Fingerprint is a SHA-256 hex digest over pinned files + model parameters.
	Fingerprint string `json:"fingerprint"`
	// FileHashes maps logical slot → sha256 of file bytes (empty if slot unused).
	FileHashes map[string]string `json:"file_hashes,omitempty"`
}

// Resolve computes the eval bundle fingerprint from the pipeline config and workspace.
// Returns (nil, nil) when cfg.EvalBundle is nil — callers should leave run bundle fields empty.
func Resolve(workspace string, cfg *config.PipelineConfig) (*Resolved, error) {
	if cfg == nil || cfg.EvalBundle == nil {
		return nil, nil
	}
	b := cfg.EvalBundle
	model := cfg.Agent.Model
	if b.Model != "" {
		model = b.Model
	}

	slots := map[string]string{
		"prompt":  "",
		"dataset": "",
		"rubric":  "",
		"schema":  "",
	}

	if b.Prompt != "" {
		slots["prompt"] = absPath(workspace, b.Prompt)
	} else if cfg.Agent.Prompt != "" {
		slots["prompt"] = absPath(workspace, cfg.Agent.Prompt)
	}

	if b.Dataset != "" {
		slots["dataset"] = absPath(workspace, b.Dataset)
	}
	if b.Rubric != "" {
		slots["rubric"] = absPath(workspace, b.Rubric)
	}
	if b.Schema != "" {
		slots["schema"] = absPath(workspace, b.Schema)
	}

	hashes := make(map[string]string)
	for name, p := range slots {
		if p == "" {
			hashes[name] = ""
			continue
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return nil, fmt.Errorf("eval_bundle %s: read %q: %w", name, p, err)
		}
		sum := sha256.Sum256(data)
		hashes[name] = hex.EncodeToString(sum[:])
	}

	payload := struct {
		V           int               `json:"v"`
		ID          string            `json:"id"`
		Model       string            `json:"model"`
		Temperature float64           `json:"temperature"`
		FileHashes  map[string]string `json:"file_hashes"`
	}{
		V:           formatVersion,
		ID:          b.ID,
		Model:       model,
		Temperature: cfg.Agent.Temperature,
		FileHashes:  stableFileHashes(hashes),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal bundle payload: %w", err)
	}
	sum := sha256.Sum256(body)
	fp := hex.EncodeToString(sum[:])

	return &Resolved{
		Label:       b.ID,
		Fingerprint: fp,
		FileHashes:  hashes,
	}, nil
}

func absPath(workspace, p string) string {
	if p == "" {
		return ""
	}
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	if workspace == "" {
		return filepath.Clean(p)
	}
	return filepath.Join(workspace, p)
}

func stableFileHashes(m map[string]string) map[string]string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make(map[string]string, len(m))
	for _, k := range keys {
		out[k] = m[k]
	}
	return out
}
