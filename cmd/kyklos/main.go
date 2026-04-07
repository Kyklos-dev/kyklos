package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"gopkg.in/yaml.v3"

	"github.com/kyklos/kyklos/internal/config"
	"github.com/kyklos/kyklos/internal/engine"
	"github.com/kyklos/kyklos/internal/notify"
	"github.com/kyklos/kyklos/internal/server"
	"github.com/kyklos/kyklos/internal/store"
)

func main() {
	serverCfgPath := flag.String("config", "kyklos-server.yaml", "path to kyklos-server.yaml")
	dbPath := flag.String("db", "", "SQLite path (overrides DATABASE_URL)")
	flag.Parse()

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	// ── Config ────────────────────────────────────────────────────────────
	cfg, err := loadServerConfig(*serverCfgPath)
	if err != nil {
		slog.Error("load server config", "err", err)
		os.Exit(1)
	}
	if err := config.ValidateServerConfig(cfg); err != nil {
		slog.Error("invalid server config", "err", err)
		os.Exit(1)
	}
	ensureWritableWorkspaceRoot(cfg)

	// ── Database ──────────────────────────────────────────────────────────
	dbFile := resolveDBPath(*dbPath)
	st, err := store.NewSQLite(dbFile)
	if err != nil {
		slog.Error("open database", "path", dbFile, "err", err)
		os.Exit(1)
	}
	defer st.Close()
	slog.Info("database ready", "path", dbFile)

	// ── Python interpreter ────────────────────────────────────────────────
	pythonBin := ""
	if cfg.Server.PythonVenv != "" {
		pythonBin = cfg.Server.PythonVenv + "/bin/python"
	}

	// ── Notifier ──────────────────────────────────────────────────────────
	// Resolve SLACK_WEBHOOK from pipeline notify config if present,
	// falling back to the SLACK_WEBHOOK env var.
	slackURL := os.Getenv("SLACK_WEBHOOK")
	var notifier notify.Notifier
	if slack := notify.NewSlackNotifier(slackURL); slack != nil {
		notifier = notify.NewMulti(&notify.LogNotifier{}, slack)
		slog.Info("Slack notifications enabled")
	} else {
		notifier = &notify.LogNotifier{}
	}

	// ── Engine ────────────────────────────────────────────────────────────
	artifactRoot := resolveArtifactRoot(cfg)
	if err := os.MkdirAll(artifactRoot, 0o755); err != nil {
		slog.Error("artifact store dir", "path", artifactRoot, "err", err)
		os.Exit(1)
	}
	slog.Info("artifact store", "path", artifactRoot)

	runner := engine.NewRunner(pythonBin)
	resolver := engine.NewResolver("", pythonBin, "")
	wsMgr := engine.NewWorkspaceManager(cfg)
	eng := engine.New(st, runner, resolver, wsMgr, notifier, artifactRoot)
	scheduler := engine.NewScheduler(eng, st, cfg.Repos)

	stepsDir := os.Getenv("KYKLOS_STEPS_DIR")
	if stepsDir == "" {
		stepsDir = "steps"
	}

	// ── Server ────────────────────────────────────────────────────────────
	srv := server.New(cfg, st, artifactRoot, stepsDir)
	srv.SetWorkspaceManager(wsMgr)
	srv.SetScheduler(scheduler)

	// ── Start ─────────────────────────────────────────────────────────────
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := scheduler.Start(ctx); err != nil {
			slog.Error("scheduler error", "err", err)
		}
	}()

	if err := srv.Start(ctx); err != nil {
		slog.Error("server exited with error", "err", err)
		os.Exit(1)
	}
}

func loadServerConfig(path string) (*config.ServerConfig, error) {
	cfg := &config.ServerConfig{}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		slog.Info("no server config file, using defaults", "path", path)
		return cfg, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %q: %w", path, err)
	}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse %q: %w", path, err)
	}
	return cfg, nil
}

// ensureWritableWorkspaceRoot sets cfg.Server.WorkspaceRoot to ~/.kyklos/workspaces
// when the configured (or default /var/kyklos/workspaces) directory cannot be created.
// This matches resolveArtifactRoot and avoids permission denied for dev installs.
func ensureWritableWorkspaceRoot(cfg *config.ServerConfig) {
	primary := cfg.Server.WorkspaceDir()
	mkErr := os.MkdirAll(primary, 0o755)
	if mkErr == nil {
		return
	}
	slog.Warn("workspace root: not writable, using home fallback", "tried", primary, "err", mkErr)
	h, herr := os.UserHomeDir()
	if herr != nil {
		slog.Error("workspace root: cannot resolve home for fallback", "err", herr)
		return
	}
	fallback := filepath.Join(h, ".kyklos", "workspaces")
	if err := os.MkdirAll(fallback, 0o755); err != nil {
		slog.Error("workspace root: fallback mkdir failed", "path", fallback, "err", err)
		return
	}
	cfg.Server.WorkspaceRoot = fallback
	slog.Info("workspace root", "path", fallback)
}

// resolveArtifactRoot prefers workspace_root/artifact_store; if that path cannot
// be created (e.g. default /var/kyklos without permissions), uses ~/.kyklos/artifact_store.
func resolveArtifactRoot(cfg *config.ServerConfig) string {
	primary := filepath.Join(cfg.Server.WorkspaceDir(), "artifact_store")
	mkErr := os.MkdirAll(primary, 0o755)
	if mkErr == nil {
		return primary
	}
	slog.Warn("artifact store: workspace path not writable, using home fallback", "tried", primary, "err", mkErr)
	h, herr := os.UserHomeDir()
	if herr != nil {
		return primary
	}
	return filepath.Join(h, ".kyklos", "artifact_store")
}

func resolveDBPath(flagVal string) string {
	if flagVal != "" {
		return flagVal
	}
	if env := os.Getenv("DATABASE_URL"); env != "" {
		return env
	}
	dir := "/var/kyklos/data"
	if h, err := os.UserHomeDir(); err == nil {
		dir = h + "/.kyklos"
	}
	_ = os.MkdirAll(dir, 0o755)
	return dir + "/kyklos.db"
}
