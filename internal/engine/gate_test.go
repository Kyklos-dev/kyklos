package engine

import (
	"testing"

	"github.com/kyklos/kyklos/internal/models"
)

func TestGateNumeric(t *testing.T) {
	g := &GateEvaluator{}
	steps := []models.StepResult{
		{Name: "llm-judge", Scores: map[string]float64{"score": 0.91}, Passed: true},
	}

	cases := []struct {
		expr string
		want bool
	}{
		{">= 0.90", true},
		{">= 0.95", false},
		{"<= 0.95", true},
		{"<= 0.90", false},
		{"> 0.80", true},
		{"< 0.95", true},
		{"< 0.90", false},
		{"== 0.91", true},
		{"== 0.90", false},
	}

	for _, tc := range cases {
		_, passed := g.Check(map[string]string{"llm-judge.score": tc.expr}, steps)
		if passed != tc.want {
			t.Errorf("score=0.91, expr=%q: got %v, want %v", tc.expr, passed, tc.want)
		}
	}
}

func TestGateBoolean(t *testing.T) {
	g := &GateEvaluator{}

	passedStep := []models.StepResult{{Name: "lint", Scores: map[string]float64{}, Passed: true}}
	failedStep := []models.StepResult{{Name: "lint", Scores: map[string]float64{}, Passed: false}}

	_, ok := g.Check(map[string]string{"lint.passed": "== true"}, passedStep)
	if !ok {
		t.Error("passed step with == true: expected gate pass")
	}

	_, ok = g.Check(map[string]string{"lint.passed": "== true"}, failedStep)
	if ok {
		t.Error("failed step with == true: expected gate fail")
	}

	_, ok = g.Check(map[string]string{"lint.passed": "== false"}, failedStep)
	if !ok {
		t.Error("failed step with == false: expected gate pass")
	}
}

func TestGateMissingStep(t *testing.T) {
	g := &GateEvaluator{}
	steps := []models.StepResult{
		{Name: "other", Scores: map[string]float64{"score": 0.9}, Passed: true},
	}
	_, passed := g.Check(map[string]string{"llm-judge.score": ">= 0.85"}, steps)
	if passed {
		t.Error("missing step should cause gate fail")
	}
}

func TestGateMissingScoreKey(t *testing.T) {
	g := &GateEvaluator{}
	steps := []models.StepResult{
		{Name: "llm-judge", Scores: map[string]float64{"accuracy": 0.9}, Passed: true},
	}
	_, passed := g.Check(map[string]string{"llm-judge.score": ">= 0.85"}, steps)
	if passed {
		t.Error("missing score key should cause gate fail")
	}
}

func TestGateEmptyPassIf(t *testing.T) {
	g := &GateEvaluator{}
	_, passed := g.Check(nil, nil)
	if !passed {
		t.Error("empty pass_if should always pass")
	}
}

func TestGateMultipleConditions(t *testing.T) {
	g := &GateEvaluator{}
	steps := []models.StepResult{
		{Name: "llm-judge", Scores: map[string]float64{"score": 0.91}, Passed: true},
		{Name: "safety-check", Scores: map[string]float64{}, Passed: true},
	}

	results, passed := g.Check(map[string]string{
		"llm-judge.score":       ">= 0.85",
		"safety-check.passed":   "== true",
	}, steps)

	if !passed {
		t.Errorf("all conditions met but gate failed: %v", results)
	}
	if len(results) != 2 {
		t.Errorf("expected 2 gate results, got %d", len(results))
	}
}

func TestGateSliceScoreKey(t *testing.T) {
	g := &GateEvaluator{}
	steps := []models.StepResult{
		{Name: "exact-match", Scores: map[string]float64{"accuracy": 0.95, "slice_eu": 0.88, "slice_us": 0.99}, Passed: true},
	}
	results, passed := g.Check(map[string]string{
		"exact-match.accuracy":  ">= 0.90",
		"exact-match.slice_eu": ">= 0.90", // fails: 0.88 < 0.90
	}, steps)
	if passed {
		t.Error("slice gate should fail when slice_eu below threshold")
	}
	var euFail bool
	for _, r := range results {
		if r.Key == "exact-match.slice_eu" && !r.Passed {
			euFail = true
		}
	}
	if !euFail {
		t.Errorf("expected exact-match.slice_eu to fail: %#v", results)
	}
}

func TestGatePartialFail(t *testing.T) {
	g := &GateEvaluator{}
	steps := []models.StepResult{
		{Name: "llm-judge", Scores: map[string]float64{"score": 0.80}, Passed: true},
		{Name: "safety-check", Scores: map[string]float64{}, Passed: true},
	}

	_, passed := g.Check(map[string]string{
		"llm-judge.score":     ">= 0.85", // fails: 0.80 < 0.85
		"safety-check.passed": "== true",  // passes
	}, steps)

	if passed {
		t.Error("one condition failed but gate reported pass")
	}
}

func TestContextFromResolution(t *testing.T) {
	previous := []models.StageResultSummary{
		{
			Stage:     "test",
			Iteration: 1,
			Steps: []models.StepResultSummary{
				{Name: "run-dataset", Uses: "kyklos/run-dataset", Score: ptr(0.95)},
			},
		},
	}

	result := resolveFrom("test.run-dataset", previous)
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Name != "run-dataset" {
		t.Errorf("got name %q", result.Name)
	}
	if result.Score == nil || *result.Score != 0.95 {
		t.Errorf("got score %v", result.Score)
	}
}

func TestContextFromMissing(t *testing.T) {
	result := resolveFrom("test.run-dataset", nil)
	if result != nil {
		t.Error("expected nil for missing stage")
	}

	// Bad format (no dot)
	result = resolveFrom("run-dataset", nil)
	if result != nil {
		t.Error("expected nil for bad format")
	}
}

func ptr(f float64) *float64 { return &f }
