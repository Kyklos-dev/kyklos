package models

// RunSummary is a run row joined with pipeline metadata for global lists.
type RunSummary struct {
	Run
	PipelineName     string `json:"pipeline_name,omitempty"`
	PipelineRepoName string `json:"pipeline_repo_name,omitempty"`
}
