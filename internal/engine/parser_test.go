package engine

import (
	"path/filepath"
	"strings"
	"testing"
)

var minimalYAML = `
version: "1.0"
name: test-agent

agent:
  model: claude-sonnet-4-6
  prompt: ./prompts/system.md

triggers:
  - on: manual

pipeline:
  - name: build
    steps:
      - uses: kyklos/snapshot
      - uses: kyklos/lint
    pass_if:
      lint.passed: "== true"
    on_fail:
      then: abort
`

var fullYAML = `
version: "1.0"
name: research-agent

agent:
  model: claude-opus-4-6
  prompt: ./prompts/research.md
  runner:
    type: anthropic

triggers:
  - on: push
    branch: main
  - on: schedule
    cron: "0 9 * * 1"

pipeline:
  - name: build
    steps:
      - uses: kyklos/lint
    pass_if:
      lint.passed: "== true"
    on_fail:
      then: abort

  - name: evaluate
    steps:
      - uses: kyklos/llm-judge
        name: llm-judge
        with:
          model: claude-sonnet-4-6
          from: test.run-dataset
    pass_if:
      llm-judge.score: ">= 0.85"
    on_fail:
      then: goto
      goto: build
      retry:
        max_attempts: 2
        delay_seconds: 10
`

func TestParseMinimal(t *testing.T) {
	cfg, err := ParsePipelineBytes([]byte(minimalYAML), "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Name != "test-agent" {
		t.Errorf("name: got %q, want %q", cfg.Name, "test-agent")
	}
	if len(cfg.Pipeline) != 1 {
		t.Fatalf("stages: got %d, want 1", len(cfg.Pipeline))
	}
	if cfg.Pipeline[0].PassIf["lint.passed"] != "== true" {
		t.Errorf("pass_if: got %q", cfg.Pipeline[0].PassIf["lint.passed"])
	}
}

func TestParseFull(t *testing.T) {
	cfg, err := ParsePipelineBytes([]byte(fullYAML), "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Agent.Runner.RunnerType() != "anthropic" {
		t.Errorf("runner type: got %q", cfg.Agent.Runner.RunnerType())
	}
	if len(cfg.Pipeline) != 2 {
		t.Fatalf("stages: got %d, want 2", len(cfg.Pipeline))
	}
	eval := cfg.Pipeline[1]
	if eval.OnFail.Then != "goto" || eval.OnFail.Goto != "build" {
		t.Errorf("on_fail: got then=%q goto=%q", eval.OnFail.Then, eval.OnFail.Goto)
	}
}

func TestRejectLegacyGateKey(t *testing.T) {
	yaml := strings.Replace(minimalYAML, "pass_if:", "gate:", 1)
	_, err := ParsePipelineBytes([]byte(yaml), "")
	if err == nil {
		t.Fatal("expected error for legacy 'gate:' key")
	}
	if !strings.Contains(err.Error(), "renamed to 'pass_if:'") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRejectAbortShorthand(t *testing.T) {
	yaml := strings.Replace(minimalYAML, "then: abort", "abort: true", 1)
	_, err := ParsePipelineBytes([]byte(yaml), "")
	if err == nil {
		t.Fatal("expected error for 'abort: true' shorthand")
	}
	if !strings.Contains(err.Error(), "then: abort") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRejectInvalidOnFail(t *testing.T) {
	cases := []struct {
		name string
		yaml string
		want string
	}{
		{
			name: "goto without target",
			yaml: strings.Replace(fullYAML, "goto: build", "", 1),
			want: "goto field is required",
		},
		{
			name: "goto target on abort",
			yaml: strings.Replace(minimalYAML, "then: abort", "then: abort\n      goto: build", 1),
			want: "only valid when then=goto",
		},
		{
			name: "regression expr in pass_if",
			yaml: strings.Replace(minimalYAML,
				`lint.passed: "== true"`, `llm-judge.score: "drops > 0.03"`, 1),
			want: "regression expressions",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParsePipelineBytes([]byte(tc.yaml), "")
			if err == nil {
				t.Fatal("expected error")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("error %q does not contain %q", err.Error(), tc.want)
			}
		})
	}
}

func TestDefaultRunnerType(t *testing.T) {
	cfg, err := ParsePipelineBytes([]byte(minimalYAML), "")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Agent.Runner.RunnerType() != "anthropic" {
		t.Errorf("default runner: got %q, want anthropic", cfg.Agent.Runner.RunnerType())
	}
}

func TestProductionExampleParses(t *testing.T) {
	path := filepath.Join("..", "..", "examples", "production-pipeline.yaml")
	_, err := ParsePipelineFile(path, "")
	if err != nil {
		t.Fatal(err)
	}
}
