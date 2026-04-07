package store

import (
	"context"

	"github.com/kyklos/kyklos/internal/models"
)

// Store is the persistence interface for Kyklos.
// All methods are context-aware to support cancellation and deadlines.
type Store interface {
	// Workspaces (dashboard Git repos — pipelines reference workspace_id)
	CreateWorkspace(ctx context.Context, w *models.Workspace) error
	GetWorkspace(ctx context.Context, id string) (*models.Workspace, error)
	ListWorkspaces(ctx context.Context) ([]*models.Workspace, error)
	UpdateWorkspace(ctx context.Context, w *models.Workspace) error
	DeleteWorkspace(ctx context.Context, id string) error
	CountPipelinesInWorkspace(ctx context.Context, workspaceID string) (int, error)

	// Pipeline CRUD
	CreatePipeline(ctx context.Context, p *models.Pipeline) error
	GetPipeline(ctx context.Context, id string) (*models.Pipeline, error)
	ListPipelines(ctx context.Context) ([]*models.Pipeline, error)
	ListPipelinesByWorkspace(ctx context.Context, workspaceID string) ([]*models.Pipeline, error)
	UpdatePipeline(ctx context.Context, p *models.Pipeline) error
	DeletePipeline(ctx context.Context, id string) error
	// SetPipelineBaseline pins a run as the pipeline baseline (compare “Run A”). Empty runID clears it.
	SetPipelineBaseline(ctx context.Context, pipelineID, runID string) error

	// Run lifecycle
	CreateRun(ctx context.Context, r *models.Run) error
	GetRun(ctx context.Context, id string) (*models.Run, error)
	ListRuns(ctx context.Context, pipelineID string) ([]*models.Run, error)
	// ListRunsAll returns recent runs across all pipelines, optionally filtered.
	ListRunsAll(ctx context.Context, f ListRunsFilter) ([]*models.RunSummary, error)
	UpdateRunStatus(ctx context.Context, id string, status models.RunStatus, errMsg string) error
	StartRun(ctx context.Context, id string) error
	FinishRun(ctx context.Context, id string, status models.RunStatus, errMsg string) error

	// Stage results  (Fix 5: stored as an ordered list per run+stage)
	SaveStageResult(ctx context.Context, r *models.StageResult) error
	GetStageResults(ctx context.Context, runID string) ([]*models.StageResult, error)

	// Log lines
	AppendLog(ctx context.Context, entry *models.LogEntry) error
	GetLogs(ctx context.Context, runID string) ([]*models.LogEntry, error)

	// Run artifacts (durable copies of step artifact paths)
	InsertRunArtifact(ctx context.Context, a *models.RunArtifact) error
	ListRunArtifacts(ctx context.Context, runID string) ([]*models.RunArtifact, error)
	GetRunArtifact(ctx context.Context, runID, artifactID string) (*models.RunArtifact, error)
	ListArtifactsAll(ctx context.Context, f ListArtifactsFilter) ([]*models.ArtifactListItem, error)

	// Global env (dashboard “Settings”) merged into every pipeline run; pipeline env: wins on key clash.
	GetGlobalEnv(ctx context.Context) (map[string]string, error)
	SetGlobalEnv(ctx context.Context, env map[string]string) error

	// Lifecycle
	Close() error
}
