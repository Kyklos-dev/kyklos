package models

import "time"

// RunStatus represents the lifecycle state of a pipeline run.
type RunStatus string

const (
	RunStatusPending   RunStatus = "pending"
	RunStatusRunning   RunStatus = "running"
	RunStatusPassed    RunStatus = "passed"
	RunStatusFailed    RunStatus = "failed"
	RunStatusCancelled RunStatus = "cancelled"
)

// TriggerKind indicates what initiated a run.
type TriggerKind string

const (
	TriggerPush     TriggerKind = "push"
	TriggerSchedule TriggerKind = "schedule"
	TriggerManual   TriggerKind = "manual"
)

// Run is one execution of a pipeline.
type Run struct {
	ID          string      `json:"id"`
	PipelineID  string      `json:"pipeline_id"`
	Status      RunStatus   `json:"status"`
	Trigger     TriggerKind `json:"trigger"`
	GitSHA      string      `json:"git_sha,omitempty"`
	GitBranch   string      `json:"git_branch,omitempty"`
	StartedAt   *time.Time  `json:"started_at,omitempty"`
	FinishedAt  *time.Time  `json:"finished_at,omitempty"`
	ErrorMsg    string      `json:"error_msg,omitempty"`
	CreatedAt   time.Time   `json:"created_at"`
	// EvalBundleID is the optional eval_bundle.id from kyklos.yaml at run time.
	EvalBundleID string `json:"eval_bundle_id,omitempty"`
	// EvalBundleFingerprint is a SHA-256 hex digest over pinned files + model (see evalbundle package).
	EvalBundleFingerprint string `json:"eval_bundle_fingerprint,omitempty"`
	// ChartMetrics is set when listing runs with ?enrich=1 (flattened step scores for charts).
	ChartMetrics map[string]float64 `json:"chart_metrics,omitempty"`
}

// TriggerRequest is the payload for a manual run trigger.
type TriggerRequest struct {
	Trigger       TriggerKind `json:"trigger"`
	GitSHA        string      `json:"sha,omitempty"`
	GitBranch     string      `json:"branch,omitempty"`
	WorkspacePath string      `json:"workspace_path,omitempty"` // Fix 2: local override, skips git
}
