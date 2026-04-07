package engine

import (
	"testing"

	"github.com/kyklos/kyklos/internal/config"
	"github.com/kyklos/kyklos/internal/models"
)

// ── RunState ───────────────────────────────────────────────────────────────

func TestRunStateAddAndLatest(t *testing.T) {
	rs := NewRunState()

	rs.AddStageResult(models.StageResult{StageName: "build", Status: models.StageStatusPassed})
	rs.AddStageResult(models.StageResult{StageName: "build", Status: models.StageStatusFailed})

	if rs.LoopCount["build"] != 2 {
		t.Errorf("loop count: got %d, want 2", rs.LoopCount["build"])
	}

	all := rs.StageResults["build"]
	if len(all) != 2 {
		t.Fatalf("history len: got %d, want 2", len(all))
	}
	if all[0].Iteration != 1 || all[1].Iteration != 2 {
		t.Errorf("iterations: got %d, %d", all[0].Iteration, all[1].Iteration)
	}

	summaries := rs.LatestSummaries([]string{"build"})
	if len(summaries) != 1 {
		t.Fatalf("summaries: got %d, want 1", len(summaries))
	}
	if summaries[0].Iteration != 2 {
		t.Errorf("latest iteration: got %d, want 2", summaries[0].Iteration)
	}
	if summaries[0].TotalIterations != 2 {
		t.Errorf("total iterations: got %d, want 2", summaries[0].TotalIterations)
	}
}

func TestRunStateAllSummaries(t *testing.T) {
	rs := NewRunState()
	rs.AddStageResult(models.StageResult{StageName: "build", Status: models.StageStatusPassed})
	rs.AddStageResult(models.StageResult{StageName: "evaluate", Status: models.StageStatusPassed})
	rs.AddStageResult(models.StageResult{StageName: "build", Status: models.StageStatusPassed})

	all := rs.AllSummaries()
	if len(all["build"]) != 2 {
		t.Errorf("build history: got %d, want 2", len(all["build"]))
	}
	if len(all["evaluate"]) != 1 {
		t.Errorf("evaluate history: got %d, want 1", len(all["evaluate"]))
	}
}

// ── Stage ordering helpers ─────────────────────────────────────────────────

func TestExtractStageNames(t *testing.T) {
	cfg := &config.PipelineConfig{
		Pipeline: []config.Stage{
			{Name: "build"},
			{Name: "test"},
			{Name: "deploy"},
		},
	}
	names := extractStageNames(cfg)
	if len(names) != 3 || names[0] != "build" || names[2] != "deploy" {
		t.Errorf("got %v", names)
	}
}

func TestIndexOfStage(t *testing.T) {
	stages := []config.Stage{
		{Name: "build"},
		{Name: "evaluate"},
		{Name: "deploy"},
	}
	if idx := indexOfStage(stages, "evaluate"); idx != 1 {
		t.Errorf("evaluate: got %d, want 1", idx)
	}
	if idx := indexOfStage(stages, "deploy"); idx != 2 {
		t.Errorf("deploy: got %d, want 2", idx)
	}
	// Missing returns 0 — parser validates goto targets exist, so this is a safety net
	if idx := indexOfStage(stages, "missing"); idx != 0 {
		t.Errorf("missing: got %d, want 0", idx)
	}
}

// ── BuildContext ───────────────────────────────────────────────────────────

func TestBuildContextFromResolution(t *testing.T) {
	state := NewRunState()
	state.AddStageResult(models.StageResult{
		StageName: "test",
		Status:    models.StageStatusPassed,
		Steps: []models.StepResult{
			{
				Name:   "run-dataset",
				Uses:   "kyklos/run-dataset",
				Scores: map[string]float64{"score": 0.91},
				Passed: true,
			},
		},
	})

	cfg := config.PipelineConfig{Name: "test-pipeline"}
	step := config.Step{
		Uses: "kyklos/llm-judge",
		With: map[string]interface{}{"from": "test.run-dataset"},
	}

	ctx := BuildContext("run-001", "/workspace", cfg, step, state, []string{"test"}, cfg.Env)

	if ctx.FromResult == nil {
		t.Fatal("from_result should be non-nil")
	}
	if ctx.FromResult.Name != "run-dataset" {
		t.Errorf("from_result name: got %q", ctx.FromResult.Name)
	}
	if ctx.FromResult.Metrics["score"] != 0.91 {
		t.Errorf("from_result metrics: got %v", ctx.FromResult.Metrics)
	}
}

func TestBuildContextNoFrom(t *testing.T) {
	state := NewRunState()
	cfg := config.PipelineConfig{Name: "test-pipeline"}
	step := config.Step{Uses: "kyklos/lint", With: map[string]interface{}{}}

	ctx := BuildContext("run-001", "/workspace", cfg, step, state, []string{}, cfg.Env)
	if ctx.FromResult != nil {
		t.Error("from_result should be nil when no from: is set")
	}
}

func TestBuildContextPreviousResultsOrder(t *testing.T) {
	state := NewRunState()
	state.AddStageResult(models.StageResult{StageName: "build", Status: models.StageStatusPassed})
	state.AddStageResult(models.StageResult{StageName: "test", Status: models.StageStatusPassed})

	cfg := config.PipelineConfig{Name: "p"}
	step := config.Step{Uses: "kyklos/llm-judge", With: map[string]interface{}{}}
	stageOrder := []string{"build", "test", "evaluate"}

	ctx := BuildContext("run-001", "/workspace", cfg, step, state, stageOrder, cfg.Env)

	if len(ctx.PreviousResults) != 2 {
		t.Fatalf("previous_results: got %d, want 2", len(ctx.PreviousResults))
	}
	if ctx.PreviousResults[0].Stage != "build" {
		t.Errorf("order: first should be build, got %q", ctx.PreviousResults[0].Stage)
	}
}
