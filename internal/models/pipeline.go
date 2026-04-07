package models

import (
	"time"

	"github.com/kyklos/kyklos/internal/config"
)

// Pipeline is a registered agent pipeline stored in the database.
type Pipeline struct {
	ID          string                `json:"id"`
	Name        string                `json:"name"`
	WorkspaceID string                `json:"workspace_id,omitempty"` // dashboard workspace → clone repo_url
	RepoName    string                `json:"repo_name"`                // matches a RepoConfig.Name
	YAMLPath string                `json:"yaml_path"` // default "kyklos.yaml"
	Config   config.PipelineConfig `json:"config"`    // parsed kyklos.yaml
	YAML     string                `json:"yaml,omitempty"` // canonical kyklos.yaml from Config; API-only, not persisted
	// BaselineRunID is the run used as default “Run A” for compare; persisted per pipeline.
	BaselineRunID string    `json:"baseline_run_id,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
