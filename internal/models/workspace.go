package models

import "time"

// Workspace groups pipelines that clone the same public Git repository.
// Branch tips are cached from git ls-remote for the dashboard.
type Workspace struct {
	ID                string     `json:"id"`
	Name              string     `json:"name"`
	RepoURL           string     `json:"repo_url"`
	DefaultBranch     string     `json:"default_branch"`
	Branches          []string   `json:"branches"`
	BranchesUpdatedAt *time.Time `json:"branches_updated_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}
