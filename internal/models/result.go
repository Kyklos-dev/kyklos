package models

import "time"

// StageStatus mirrors RunStatus but for a single stage.
type StageStatus string

const (
	StageStatusPassed  StageStatus = "passed"
	StageStatusFailed  StageStatus = "failed"
	StageStatusSkipped StageStatus = "skipped"
	StageStatusRunning StageStatus = "running"
)

// StageResult is one execution of a named stage. (Fix 5: slice of these per stage name)
// A single stage may appear multiple times in a run when goto loops back to it.
type StageResult struct {
	ID          string        `json:"id"`
	RunID       string        `json:"run_id"`
	StageName   string        `json:"stage_name"`
	Iteration   int           `json:"iteration"`   // 1-based; increments on each goto loop
	Status      StageStatus   `json:"status"`
	RetryCount  int           `json:"retry_count"`
	Steps       []StepResult  `json:"steps"`
	GateResults []GateResult  `json:"gate_results"`
	StartedAt   *time.Time    `json:"started_at,omitempty"`
	FinishedAt  *time.Time    `json:"finished_at,omitempty"`
}

// StepResult captures the output of one step execution.
type StepResult struct {
	Name     string             `json:"name"`   // effective step name
	Uses     string             `json:"uses"`   // uses field from kyklos.yaml
	Status   StageStatus        `json:"status"`
	Scores   map[string]float64 `json:"scores"`
	Passed   bool               `json:"passed"`
	Metadata map[string]any     `json:"metadata"`
	Artifacts []string          `json:"artifacts"`
	Logs     []string           `json:"logs"`
}

// GateResult is the evaluated outcome of one pass_if condition. (Fix 8: was "gate")
type GateResult struct {
	Key    string  `json:"key"`    // e.g. "llm-judge.score"
	Value  float64 `json:"value"`
	Expr   string  `json:"expr"`   // e.g. ">= 0.85"
	Passed bool    `json:"passed"`
}

// LogEntry is one log line stored in the database.
type LogEntry struct {
	ID        int64     `json:"id"`
	RunID     string    `json:"run_id"`
	StageName string    `json:"stage_name,omitempty"`
	StepName  string    `json:"step_name,omitempty"`
	Line      string    `json:"line"`
	CreatedAt time.Time `json:"created_at"`
}

// StageResultSummary is what downstream steps see in KyklosContext.previous_results. (Fix 7)
// It is the latest iteration of a stage, with all steps summarised.
type StageResultSummary struct {
	Stage           string               `json:"stage"`
	Iteration       int                  `json:"iteration"`
	TotalIterations int                  `json:"total_iterations"`
	Status          StageStatus          `json:"status"`
	StartedAt       string               `json:"started_at"`  // ISO 8601
	FinishedAt      string               `json:"finished_at"` // ISO 8601
	DurationSeconds float64              `json:"duration_seconds"`
	Steps           []StepResultSummary  `json:"steps"`
}

// StepResultSummary is the per-step view inside StageResultSummary. (Fix 7)
type StepResultSummary struct {
	Name     string             `json:"name"`
	Uses     string             `json:"uses"`
	Status   StageStatus        `json:"status"`
	Score    *float64           `json:"score,omitempty"`    // primary score if step produced one
	Metrics  map[string]float64 `json:"metrics,omitempty"`  // all named scores
	Artifact *string            `json:"artifact,omitempty"` // primary artifact path
}

// ToSummary converts a StageResult (with full step data) to the lightweight
// summary shape exposed in KyklosContext.previous_results.
func ToSummary(r StageResult, totalIterations int) StageResultSummary {
	s := StageResultSummary{
		Stage:           r.StageName,
		Iteration:       r.Iteration,
		TotalIterations: totalIterations,
		Status:          r.Status,
	}
	if r.StartedAt != nil {
		s.StartedAt = r.StartedAt.UTC().Format(time.RFC3339)
	}
	if r.FinishedAt != nil {
		s.FinishedAt = r.FinishedAt.UTC().Format(time.RFC3339)
		if r.StartedAt != nil {
			s.DurationSeconds = r.FinishedAt.Sub(*r.StartedAt).Seconds()
		}
	}
	for _, step := range r.Steps {
		ss := StepResultSummary{
			Name:    step.Name,
			Uses:    step.Uses,
			Status:  step.Status,
			Metrics: step.Scores,
		}
		// Expose the first scalar score as the primary "score" field.
		for _, v := range step.Scores {
			vCopy := v
			ss.Score = &vCopy
			break
		}
		if len(step.Artifacts) > 0 {
			ss.Artifact = &step.Artifacts[0]
		}
		s.Steps = append(s.Steps, ss)
	}
	return s
}
