package store

// ListRunsAll filters for ListRunsAll (global run explorer).
type ListRunsFilter struct {
	Status         string // empty = any
	RepoContains   string // matches pipeline repo_name or name (substring, case-insensitive)
	BranchContains string // matches run git_branch (substring, case-insensitive)
	Limit          int    // default 200, max 500
}

// ListArtifactsFilter filters ListArtifactsAll (global artifact explorer).
type ListArtifactsFilter struct {
	NameContains     string // matches logical_name or step_name (substring, case-insensitive)
	PipelineContains string // matches pipeline name or repo_name
	Limit            int    // default 300, max 1000
}
