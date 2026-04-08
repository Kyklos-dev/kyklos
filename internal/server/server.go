package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/kyklos/kyklos/internal/config"
	"github.com/kyklos/kyklos/internal/engine"
	"github.com/kyklos/kyklos/internal/models"
	"github.com/kyklos/kyklos/internal/server/handlers"
	"github.com/kyklos/kyklos/internal/server/middleware"
	"github.com/kyklos/kyklos/internal/store"
	"github.com/kyklos/kyklos/web"
)

// Server wraps the HTTP server and all its wired dependencies.
type Server struct {
	cfg           *config.ServerConfig
	store         store.Store
	artifactRoot  string // directory for persisted run artifacts (API download)
	stepsDir      string // built-in step scripts (for GET /catalog/steps)
	scheduler     *engine.Scheduler // set via SetScheduler before Start
	wsMgr         *engine.WorkspaceManager
	router        chi.Router
	http          *http.Server
}

// New creates a configured Server. artifactRoot is where durable step files are stored (same as engine).
// stepsDir is the path to the steps/ tree (e.g. repo steps/); may be relative to process cwd.
func New(cfg *config.ServerConfig, st store.Store, artifactRoot, stepsDir string) *Server {
	s := &Server{cfg: cfg, store: st, artifactRoot: artifactRoot, stepsDir: stepsDir}
	// Build router without scheduler (webhooks and run triggers disabled until SetScheduler)
	s.router = s.buildRouter()
	s.http = &http.Server{
		Addr:         cfg.Server.BindAddr(),
		Handler:      s.router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second, // generous for SSE streams
		IdleTimeout:  120 * time.Second,
	}
	return s
}

// SetWorkspaceManager wires git workspace reads (e.g. load kyklos.yaml from a branch).
func (s *Server) SetWorkspaceManager(m *engine.WorkspaceManager) {
	s.wsMgr = m
	s.router = s.buildRouter()
	s.http.Handler = s.router
}

// SetScheduler wires the scheduler into the server, enabling webhooks and
// manual run triggers. Must be called before Start.
func (s *Server) SetScheduler(sched *engine.Scheduler) {
	s.scheduler = sched
	s.router = s.buildRouter()
	s.http.Handler = s.router
}

func (s *Server) buildRouter() chi.Router {
	r := chi.NewRouter()

	// ── Global middleware ────────────────────────────────────────────────
	r.Use(chimw.Recoverer)
	r.Use(middleware.Logger)
	r.Use(middleware.CORS)

	// ── Health ───────────────────────────────────────────────────────────
	r.Get("/health", handlers.Health)

	// ── Webhooks (HMAC-validated) ────────────────────────────────────────
	if s.scheduler != nil {
		wh := handlers.NewWebhookHandler(s.store, s.scheduler, s.cfg.Repos)
		r.Post("/webhooks/github", wh.GitHub)
		r.Post("/webhooks/gitlab", wh.GitLab)
	}

	// ── API v1 ───────────────────────────────────────────────────────────
	r.Route("/api/v1", func(r chi.Router) {
		// Pipelines
		ph := handlers.NewPipelineHandler(
			s.store,
			s.schedulerReload,
			s.schedulerTrigger,
		)
		r.Route("/pipelines", ph.Mount)

		// Runs
		rh := handlers.NewRunHandler(s.store, s.artifactRoot, s.schedulerTrigger)
		r.Route("/runs", rh.Mount)

		ch := &handlers.CatalogHandler{StepsDir: s.stepsDir}
		r.Get("/catalog/steps", ch.Steps)

		ah := handlers.NewArtifactHandler(s.store)
		r.Get("/artifacts", ah.ListAll)

		sh := &handlers.SettingsHandler{Store: s.store}
		r.Get("/settings/env", sh.GetEnv)
		r.Put("/settings/env", sh.PutEnv)

		wh := &handlers.WorkspaceHandler{Store: s.store, Ws: s.wsMgr}
		r.Route("/workspaces", wh.Mount)
	})

	// ── Dashboard static files ────────────────────────────────────────────
	r.Handle("/*", web.Handler())

	return r
}

// schedulerReload is called after pipeline mutations.
func (s *Server) schedulerReload() {
	if s.scheduler != nil {
		s.scheduler.Reload(context.Background())
	}
}

// schedulerTrigger dispatches a manual run and returns the new run id when preparation succeeds.
func (s *Server) schedulerTrigger(ctx context.Context, pipelineID string, req models.TriggerRequest) (string, error) {
	if s.scheduler == nil {
		return "", errors.New("scheduler not available")
	}
	return s.scheduler.TriggerManual(ctx, pipelineID, req)
}

// Start begins listening. Blocks until ctx is cancelled.
func (s *Server) Start(ctx context.Context) error {
	slog.Info("kyklos server starting", "addr", s.http.Addr)
	errCh := make(chan error, 1)
	go func() {
		if err := s.http.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return fmt.Errorf("server error: %w", err)
	case <-ctx.Done():
		slog.Info("shutting down server")
		shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return s.http.Shutdown(shutCtx)
	}
}
