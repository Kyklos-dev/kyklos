package evalbundle

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kyklos/kyklos/internal/config"
)

func TestResolve_Deterministic(t *testing.T) {
	dir := t.TempDir()
	prompt := filepath.Join(dir, "p.md")
	dataset := filepath.Join(dir, "d.jsonl")
	_ = os.WriteFile(prompt, []byte("hello"), 0o644)
	_ = os.WriteFile(dataset, []byte(`{"x":1}`+"\n"), 0o644)

	cfg := &config.PipelineConfig{
		Agent: config.AgentConfig{
			Model:       "claude-test",
			Temperature: 0.2,
			Prompt:      prompt,
		},
		EvalBundle: &config.EvalBundleConfig{
			ID:      "bundle-a",
			Dataset: dataset,
		},
	}

	r1, err := Resolve(dir, cfg)
	if err != nil {
		t.Fatal(err)
	}
	r2, err := Resolve(dir, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if r1.Fingerprint != r2.Fingerprint {
		t.Errorf("fingerprints differ: %s vs %s", r1.Fingerprint, r2.Fingerprint)
	}
	if r1.Label != "bundle-a" {
		t.Errorf("label: %q", r1.Label)
	}
	if r1.FileHashes["prompt"] == "" || r1.FileHashes["dataset"] == "" {
		t.Errorf("expected prompt and dataset hashes: %#v", r1.FileHashes)
	}
}

func TestResolve_ModelOverrideChangesFingerprint(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "p.md")
	_ = os.WriteFile(p, []byte("x"), 0o644)

	base := &config.PipelineConfig{
		Agent: config.AgentConfig{Model: "m1", Prompt: p},
		EvalBundle: &config.EvalBundleConfig{
			Model: "m2",
		},
	}
	r1, err := Resolve(dir, base)
	if err != nil {
		t.Fatal(err)
	}
	base.EvalBundle.Model = "m3"
	r2, err := Resolve(dir, base)
	if err != nil {
		t.Fatal(err)
	}
	if r1.Fingerprint == r2.Fingerprint {
		t.Error("model override should change fingerprint")
	}
}

func TestResolve_NilBundle(t *testing.T) {
	r, err := Resolve(t.TempDir(), &config.PipelineConfig{Agent: config.AgentConfig{Model: "x"}})
	if err != nil {
		t.Fatal(err)
	}
	if r != nil {
		t.Errorf("want nil, got %+v", r)
	}
}
