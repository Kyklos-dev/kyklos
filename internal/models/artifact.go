package models

import "time"

// RunArtifact is a step output file copied to durable storage (outside the ephemeral worktree).
type RunArtifact struct {
	ID          string    `json:"id"`
	RunID       string    `json:"run_id"`
	StageName   string    `json:"stage_name"`
	StepName    string    `json:"step_name"`
	LogicalName string    `json:"logical_name"`
	SizeBytes   int64     `json:"size_bytes"`
	CreatedAt   time.Time `json:"created_at"`
	// StoragePath is server-local; omitted from JSON for API responses.
	StoragePath string `json:"-"`
}

// ArtifactListItem is a persisted artifact with run and pipeline context (global explorer).
type ArtifactListItem struct {
	RunArtifact
	PipelineID       string `json:"pipeline_id"`
	PipelineName     string `json:"pipeline_name"`
	PipelineRepoName string `json:"pipeline_repo_name"`
	RunStatus        string `json:"run_status"`
}
