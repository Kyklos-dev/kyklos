package engine

import (
	"context"
	"log/slog"
	"strings"
	"sync"

	"github.com/robfig/cron/v3"

	"github.com/kyklos/kyklos/internal/config"
	"github.com/kyklos/kyklos/internal/models"
	"github.com/kyklos/kyklos/internal/store"
)

// Scheduler manages cron-based and manual pipeline triggers.
type Scheduler struct {
	engine *Engine
	store  store.Store
	repos  []config.RepoConfig // default branches for server-registered repos
	cron   *cron.Cron

	mu      sync.Mutex
	entryIDs map[string]cron.EntryID // pipelineID → cron entry
}

// NewScheduler creates a Scheduler. Call Start() to begin execution.
// repos is the server kyklos-server.yaml repos list (used for default branch on cron runs).
func NewScheduler(engine *Engine, st store.Store, repos []config.RepoConfig) *Scheduler {
	return &Scheduler{
		engine:   engine,
		store:    st,
		repos:    repos,
		cron:     cron.New(cron.WithSeconds()),
		entryIDs: map[string]cron.EntryID{},
	}
}

// Start loads all pipelines from the store, registers cron triggers, and
// starts the cron runner. It blocks until ctx is cancelled.
func (s *Scheduler) Start(ctx context.Context) error {
	if err := s.loadAll(ctx); err != nil {
		slog.Warn("scheduler: initial pipeline load failed", "err", err)
		// Non-fatal: server still starts, manual triggers still work
	}

	s.cron.Start()
	slog.Info("scheduler started")

	<-ctx.Done()
	slog.Info("scheduler stopping")
	s.cron.Stop()
	return nil
}

// Reload re-reads all pipelines from the store and reconciles cron entries.
// Called by pipeline CRUD handlers (Phase 5) when pipelines are added or removed.
func (s *Scheduler) Reload(ctx context.Context) {
	if err := s.loadAll(ctx); err != nil {
		slog.Warn("scheduler: reload failed", "err", err)
	}
}

// TriggerManual dispatches an immediate run for the given pipeline.
// It prepares the run synchronously (workspace + DB row) so callers can obtain run_id,
// then executes pipeline stages asynchronously.
func (s *Scheduler) TriggerManual(ctx context.Context, pipelineID string, req models.TriggerRequest) (runID string, err error) {
	req.Trigger = models.TriggerManual
	runID, err = s.engine.StartManualRunAsync(ctx, pipelineID, req)
	if err != nil {
		slog.Error("manual trigger failed", "pipeline_id", pipelineID, "err", err)
	}
	return runID, err
}

// TriggerPush dispatches a run caused by a git push event.
func (s *Scheduler) TriggerPush(pipelineID, sha, branch string) {
	req := models.TriggerRequest{
		Trigger:   models.TriggerPush,
		GitSHA:    sha,
		GitBranch: branch,
	}
	go func() {
		if err := s.engine.RunPipeline(context.Background(), pipelineID, req); err != nil {
			slog.Error("push trigger failed",
				"pipeline_id", pipelineID,
				"branch", branch,
				"sha", sha,
				"err", err,
			)
		}
	}()
}

// loadAll re-registers cron entries for every pipeline in the store.
func (s *Scheduler) loadAll(ctx context.Context) error {
	pipelines, err := s.store.ListPipelines(ctx)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Remove all existing entries
	for _, id := range s.entryIDs {
		s.cron.Remove(id)
	}
	s.entryIDs = map[string]cron.EntryID{}

	// Re-register schedule triggers
	for _, p := range pipelines {
		pl := p // capture for cron closure
		for _, trigger := range pl.Config.Triggers {
			if trigger.On != "schedule" || trigger.Cron == "" {
				continue
			}
			pID := pl.ID
			pName := pl.Name
			cronExpr := trigger.Cron

			entryID, err := s.cron.AddFunc(cronExpr, func() {
				slog.Info("cron trigger fired", "pipeline", pName, "cron", cronExpr)
				br := cronDefaultBranch(pl, s.repos)
				req := models.TriggerRequest{Trigger: models.TriggerSchedule, GitBranch: br}
				if err := s.engine.RunPipeline(context.Background(), pID, req); err != nil {
					slog.Error("cron trigger failed", "pipeline", pName, "err", err)
				}
			})
			if err != nil {
				slog.Warn("invalid cron expression",
					"pipeline", pName,
					"cron", cronExpr,
					"err", err,
				)
				continue
			}
			s.entryIDs[pID] = entryID
			slog.Info("cron trigger registered", "pipeline", pName, "cron", cronExpr)
		}
	}

	return nil
}

// cronDefaultBranch picks the branch to resolve for scheduled runs (tip of branch).
func cronDefaultBranch(p *models.Pipeline, repos []config.RepoConfig) string {
	if p != nil && p.Config.Repository != nil && strings.TrimSpace(p.Config.Repository.Branch) != "" {
		return strings.TrimSpace(p.Config.Repository.Branch)
	}
	if p != nil {
		for _, r := range repos {
			if r.Name == p.RepoName && strings.TrimSpace(r.Branch) != "" {
				return strings.TrimSpace(r.Branch)
			}
		}
	}
	return "main"
}
