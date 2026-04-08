package engine

import (
	"fmt"
	"strings"

	"github.com/kyklos/kyklos/internal/config"
	"github.com/kyklos/kyklos/internal/models"
)

const kyklosVersion = "0.1.1"

// KyklosContext is the JSON payload written to every step's stdin.
// It mirrors the Python KyklosContext dataclass exactly.
type KyklosContext struct {
	RunID           string                                    `json:"run_id"`
	Workspace       string                                    `json:"workspace"`
	Config          config.PipelineConfig                     `json:"config"`
	StageConfig     map[string]interface{}                    `json:"stage_config"`
	PreviousResults []models.StageResultSummary               `json:"previous_results"`
	AllResults      map[string][]models.StageResultSummary    `json:"all_results"`
	FromResult      *models.StepResultSummary                 `json:"from_result,omitempty"`
	Env             map[string]string                         `json:"env"`
	KyklosVersion   string                                    `json:"kyklos_version"`
}

// RunState holds all stage results accumulated during a pipeline run.
// The slice per stage name captures every iteration (Fix 5: goto loops).
type RunState struct {
	StageResults map[string][]models.StageResult // key=stage name, ordered by iteration
	LoopCount    map[string]int                  // how many times each stage has run
}

// NewRunState creates an empty RunState.
func NewRunState() *RunState {
	return &RunState{
		StageResults: map[string][]models.StageResult{},
		LoopCount:    map[string]int{},
	}
}

// AddStageResult appends a completed stage result and increments the loop counter.
func (rs *RunState) AddStageResult(r models.StageResult) {
	rs.LoopCount[r.StageName]++
	r.Iteration = rs.LoopCount[r.StageName]
	rs.StageResults[r.StageName] = append(rs.StageResults[r.StageName], r)
}

// LatestSummaries returns the most-recent StageResultSummary for every stage
// that has run, in chronological order of first execution.
func (rs *RunState) LatestSummaries(stageOrder []string) []models.StageResultSummary {
	var out []models.StageResultSummary
	seen := map[string]bool{}
	for _, name := range stageOrder {
		if seen[name] {
			continue
		}
		seen[name] = true
		results := rs.StageResults[name]
		if len(results) == 0 {
			continue
		}
		latest := results[len(results)-1]
		total := len(results)
		out = append(out, models.ToSummary(latest, total))
	}
	return out
}

// AllSummaries returns the full iteration history keyed by stage name.
func (rs *RunState) AllSummaries() map[string][]models.StageResultSummary {
	out := map[string][]models.StageResultSummary{}
	for name, results := range rs.StageResults {
		total := len(results)
		for _, r := range results {
			out[name] = append(out[name], models.ToSummary(r, total))
		}
	}
	return out
}

// MergeEnv returns a new map: keys from base, then keys from over (over wins on duplicate).
func MergeEnv(base, over map[string]string) map[string]string {
	out := make(map[string]string, len(base)+len(over))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range over {
		out[k] = v
	}
	return out
}

// BuildContext constructs the KyklosContext for a specific step invocation.
// stageOrder is the pipeline stage order (for deterministic previous_results).
// env is the effective environment for steps (global dashboard env merged with pipeline env).
func BuildContext(
	runID string,
	workspace string,
	cfg config.PipelineConfig,
	step config.Step,
	state *RunState,
	stageOrder []string,
	env map[string]string,
) *KyklosContext {
	ctx := &KyklosContext{
		RunID:           runID,
		Workspace:       workspace,
		Config:          cfg,
		StageConfig:     normalizeWith(step.With),
		PreviousResults: state.LatestSummaries(stageOrder),
		AllResults:      state.AllSummaries(),
		Env:             env,
		KyklosVersion:   kyklosVersion,
	}

	// Resolve from: reference (Fix 7: stage.step format)
	if fromVal, ok := step.With["from"].(string); ok && fromVal != "" {
		ctx.FromResult = resolveFrom(fromVal, ctx.PreviousResults)
	}

	return ctx
}

// resolveFrom parses "stage-name.step-name" and finds the matching step result.
// Returns nil if either the stage or the step is not found.
func resolveFrom(fromExpr string, previous []models.StageResultSummary) *models.StepResultSummary {
	parts := strings.SplitN(fromExpr, ".", 2)
	if len(parts) != 2 {
		return nil
	}
	stageName, stepName := parts[0], parts[1]

	for i := range previous {
		if previous[i].Stage != stageName {
			continue
		}
		for j := range previous[i].Steps {
			if previous[i].Steps[j].Name == stepName {
				result := previous[i].Steps[j]
				return &result
			}
		}
	}
	return nil
}

// normalizeWith converts a step's With map so all values are JSON-compatible.
// yaml.v3 unmarshals nested maps as map[string]interface{} which is already
// JSON-serialisable, but we return a fresh copy to avoid aliasing.
func normalizeWith(with map[string]interface{}) map[string]interface{} {
	if with == nil {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(with))
	for k, v := range with {
		out[k] = v
	}
	return out
}

// ValidateFromRef checks that a step's from: reference can be resolved at
// runtime (best-effort static check at pipeline load time).
// Returns a descriptive error if the format is wrong.
func ValidateFromRef(fromExpr string) error {
	if !strings.Contains(fromExpr, ".") {
		return fmt.Errorf(
			"from: %q is not valid — must be <stage-name>.<step-name> (e.g. 'test.run-dataset')",
			fromExpr,
		)
	}
	return nil
}
