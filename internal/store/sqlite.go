package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/kyklos/kyklos/internal/models"
	_ "modernc.org/sqlite"
)

// SQLiteStore implements Store using modernc.org/sqlite (pure Go, no CGO).
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLite opens (or creates) a SQLite database at the given path and runs migrations.
func NewSQLite(path string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite %q: %w", path, err)
	}
	// Single-writer SQLite: serialise writes.
	db.SetMaxOpenConns(1)

	s := &SQLiteStore{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

// migrate runs the DDL to create all tables if they don't exist.
func (s *SQLiteStore) migrate() error {
	ddl := `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS pipelines (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    repo_name   TEXT NOT NULL DEFAULT '',
    yaml_path   TEXT NOT NULL DEFAULT 'kyklos.yaml',
    config      TEXT NOT NULL,
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
    id                       TEXT PRIMARY KEY,
    pipeline_id              TEXT NOT NULL REFERENCES pipelines(id),
    status                   TEXT NOT NULL DEFAULT 'pending',
    trigger                  TEXT NOT NULL,
    git_sha                  TEXT NOT NULL DEFAULT '',
    git_branch               TEXT NOT NULL DEFAULT '',
    error_msg                TEXT NOT NULL DEFAULT '',
    started_at               DATETIME,
    finished_at              DATETIME,
    created_at               DATETIME NOT NULL,
    eval_bundle_id           TEXT NOT NULL DEFAULT '',
    eval_bundle_fingerprint  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_runs_pipeline_id ON runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_runs_status      ON runs(status);

CREATE TABLE IF NOT EXISTS stage_results (
    id          TEXT PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES runs(id),
    stage_name  TEXT NOT NULL,
    iteration   INTEGER NOT NULL DEFAULT 1,
    status      TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    results     TEXT NOT NULL,
    started_at  DATETIME,
    finished_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_stage_results_run_id ON stage_results(run_id);

CREATE TABLE IF NOT EXISTS logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT NOT NULL REFERENCES runs(id),
    stage_name  TEXT NOT NULL DEFAULT '',
    step_name   TEXT NOT NULL DEFAULT '',
    line        TEXT NOT NULL,
    created_at  DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_run_id ON logs(run_id);

CREATE TABLE IF NOT EXISTS run_artifacts (
    id           TEXT PRIMARY KEY,
    run_id       TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    stage_name   TEXT NOT NULL DEFAULT '',
    step_name    TEXT NOT NULL DEFAULT '',
    logical_name TEXT NOT NULL DEFAULT '',
    storage_path TEXT NOT NULL,
    size_bytes   INTEGER NOT NULL DEFAULT 0,
    created_at   DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_artifacts_run_id ON run_artifacts(run_id);
`
	if _, err := s.db.Exec(ddl); err != nil {
		return err
	}
	if err := s.migrateRunsEvalBundleColumns(); err != nil {
		return err
	}
	if err := s.migratePipelineBaselineColumn(); err != nil {
		return err
	}
	if err := s.migrateSettingsTable(); err != nil {
		return err
	}
	if err := s.migrateWorkspacesTable(); err != nil {
		return err
	}
	if err := s.migratePipelineWorkspaceColumn(); err != nil {
		return err
	}
	return nil
}

func (s *SQLiteStore) migrateWorkspacesTable() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS workspaces (
    id                   TEXT PRIMARY KEY NOT NULL,
    name                 TEXT NOT NULL,
    repo_url             TEXT NOT NULL,
    default_branch       TEXT NOT NULL DEFAULT 'main',
    branches_json        TEXT NOT NULL DEFAULT '[]',
    branches_updated_at  DATETIME,
    created_at           DATETIME NOT NULL,
    updated_at           DATETIME NOT NULL
)`)
	return err
}

func (s *SQLiteStore) migratePipelineWorkspaceColumn() error {
	q := `ALTER TABLE pipelines ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''`
	if _, err := s.db.Exec(q); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
			return err
		}
	}
	return nil
}

func (s *SQLiteStore) migrateSettingsTable() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
)`)
	return err
}

// migrateRunsEvalBundleColumns adds eval bundle columns to legacy databases.
func (s *SQLiteStore) migrateRunsEvalBundleColumns() error {
	for _, q := range []string{
		`ALTER TABLE runs ADD COLUMN eval_bundle_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE runs ADD COLUMN eval_bundle_fingerprint TEXT NOT NULL DEFAULT ''`,
	} {
		if _, err := s.db.Exec(q); err != nil {
			if !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
				return err
			}
		}
	}
	return nil
}

// migratePipelineBaselineColumn adds baseline_run_id to legacy databases.
func (s *SQLiteStore) migratePipelineBaselineColumn() error {
	q := `ALTER TABLE pipelines ADD COLUMN baseline_run_id TEXT NOT NULL DEFAULT ''`
	if _, err := s.db.Exec(q); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
			return err
		}
	}
	return nil
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

func (s *SQLiteStore) CreatePipeline(ctx context.Context, p *models.Pipeline) error {
	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	now := time.Now().UTC()
	p.CreatedAt = now
	p.UpdatedAt = now

	cfg, err := json.Marshal(p.Config)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO pipelines (id, name, workspace_id, repo_name, yaml_path, config, created_at, updated_at, baseline_run_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.WorkspaceID, p.RepoName, p.YAMLPath, string(cfg), now, now, p.BaselineRunID,
	)
	return err
}

func (s *SQLiteStore) GetPipeline(ctx context.Context, id string) (*models.Pipeline, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, name, workspace_id, repo_name, yaml_path, config, created_at, updated_at, baseline_run_id FROM pipelines WHERE id = ?`, id)
	return scanPipeline(row)
}

func (s *SQLiteStore) ListPipelines(ctx context.Context) ([]*models.Pipeline, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, workspace_id, repo_name, yaml_path, config, created_at, updated_at, baseline_run_id FROM pipelines ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.Pipeline
	for rows.Next() {
		p, err := scanPipeline(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) ListPipelinesByWorkspace(ctx context.Context, workspaceID string) ([]*models.Pipeline, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, workspace_id, repo_name, yaml_path, config, created_at, updated_at, baseline_run_id FROM pipelines WHERE workspace_id = ? ORDER BY created_at DESC`,
		workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.Pipeline
	for rows.Next() {
		p, err := scanPipeline(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) UpdatePipeline(ctx context.Context, p *models.Pipeline) error {
	p.UpdatedAt = time.Now().UTC()
	cfg, err := json.Marshal(p.Config)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE pipelines SET name=?, workspace_id=?, repo_name=?, yaml_path=?, config=?, baseline_run_id=?, updated_at=? WHERE id=?`,
		p.Name, p.WorkspaceID, p.RepoName, p.YAMLPath, string(cfg), p.BaselineRunID, p.UpdatedAt, p.ID,
	)
	return err
}

// SetPipelineBaseline pins a run as the pipeline baseline (empty runID clears).
func (s *SQLiteStore) SetPipelineBaseline(ctx context.Context, pipelineID, runID string) error {
	if _, err := s.GetPipeline(ctx, pipelineID); err != nil {
		return err
	}
	if runID == "" {
		_, err := s.db.ExecContext(ctx,
			`UPDATE pipelines SET baseline_run_id='', updated_at=? WHERE id=?`,
			time.Now().UTC(), pipelineID)
		return err
	}
	var pid string
	err := s.db.QueryRowContext(ctx, `SELECT pipeline_id FROM runs WHERE id=?`, runID).Scan(&pid)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("run not found")
	}
	if err != nil {
		return err
	}
	if pid != pipelineID {
		return fmt.Errorf("run does not belong to this pipeline")
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE pipelines SET baseline_run_id=?, updated_at=? WHERE id=?`,
		runID, time.Now().UTC(), pipelineID)
	return err
}

// DeletePipeline removes a pipeline and all associated runs, stage results, and logs
// (SQLite foreign keys would otherwise block deleting a pipeline that still has runs).
func (s *SQLiteStore) DeletePipeline(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err = tx.ExecContext(ctx,
		`DELETE FROM logs WHERE run_id IN (SELECT id FROM runs WHERE pipeline_id = ?)`, id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx,
		`DELETE FROM stage_results WHERE run_id IN (SELECT id FROM runs WHERE pipeline_id = ?)`, id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM runs WHERE pipeline_id = ?`, id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM pipelines WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// ── Workspace ─────────────────────────────────────────────────────────────────

func (s *SQLiteStore) CreateWorkspace(ctx context.Context, w *models.Workspace) error {
	if w.ID == "" {
		w.ID = uuid.NewString()
	}
	now := time.Now().UTC()
	w.CreatedAt = now
	w.UpdatedAt = now
	if w.DefaultBranch == "" {
		w.DefaultBranch = "main"
	}
	if w.Branches == nil {
		w.Branches = []string{}
	}
	brJSON, err := json.Marshal(w.Branches)
	if err != nil {
		return fmt.Errorf("marshal branches: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO workspaces (id, name, repo_url, default_branch, branches_json, branches_updated_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		w.ID, w.Name, w.RepoURL, w.DefaultBranch, string(brJSON), optionalTimePtr(w.BranchesUpdatedAt), now, now,
	)
	return err
}

func (s *SQLiteStore) GetWorkspace(ctx context.Context, id string) (*models.Workspace, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, name, repo_url, default_branch, branches_json, branches_updated_at, created_at, updated_at FROM workspaces WHERE id = ?`, id)
	return scanWorkspace(row)
}

func (s *SQLiteStore) ListWorkspaces(ctx context.Context) ([]*models.Workspace, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, repo_url, default_branch, branches_json, branches_updated_at, created_at, updated_at FROM workspaces ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.Workspace
	for rows.Next() {
		w, err := scanWorkspace(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) UpdateWorkspace(ctx context.Context, w *models.Workspace) error {
	w.UpdatedAt = time.Now().UTC()
	if w.DefaultBranch == "" {
		w.DefaultBranch = "main"
	}
	if w.Branches == nil {
		w.Branches = []string{}
	}
	brJSON, err := json.Marshal(w.Branches)
	if err != nil {
		return fmt.Errorf("marshal branches: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE workspaces SET name=?, repo_url=?, default_branch=?, branches_json=?, branches_updated_at=?, updated_at=? WHERE id=?`,
		w.Name, w.RepoURL, w.DefaultBranch, string(brJSON), optionalTimePtr(w.BranchesUpdatedAt), w.UpdatedAt, w.ID,
	)
	return err
}

func (s *SQLiteStore) DeleteWorkspace(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM workspaces WHERE id=?`, id)
	return err
}

func (s *SQLiteStore) CountPipelinesInWorkspace(ctx context.Context, workspaceID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM pipelines WHERE workspace_id = ?`, workspaceID).Scan(&n)
	return n, err
}

func scanWorkspace(row scanner) (*models.Workspace, error) {
	var w models.Workspace
	var brJSON string
	var brAt sql.NullTime
	err := row.Scan(&w.ID, &w.Name, &w.RepoURL, &w.DefaultBranch, &brJSON, &brAt, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(brJSON), &w.Branches); err != nil || w.Branches == nil {
		w.Branches = []string{}
	}
	if brAt.Valid {
		t := brAt.Time
		w.BranchesUpdatedAt = &t
	}
	return &w, nil
}

func optionalTimePtr(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return *t
}

type scanner interface {
	Scan(dest ...any) error
}

func scanPipeline(row scanner) (*models.Pipeline, error) {
	var p models.Pipeline
	var cfgJSON string
	err := row.Scan(&p.ID, &p.Name, &p.WorkspaceID, &p.RepoName, &p.YAMLPath, &cfgJSON, &p.CreatedAt, &p.UpdatedAt, &p.BaselineRunID)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(cfgJSON), &p.Config); err != nil {
		return nil, fmt.Errorf("unmarshal config: %w", err)
	}
	return &p, nil
}

// ── Runs ──────────────────────────────────────────────────────────────────────

func (s *SQLiteStore) CreateRun(ctx context.Context, r *models.Run) error {
	if r.ID == "" {
		r.ID = uuid.NewString()
	}
	r.CreatedAt = time.Now().UTC()
	r.Status = models.RunStatusPending

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO runs (id, pipeline_id, status, trigger, git_sha, git_branch, error_msg, created_at,
		 eval_bundle_id, eval_bundle_fingerprint)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.PipelineID, r.Status, r.Trigger,
		r.GitSHA, r.GitBranch, r.ErrorMsg, r.CreatedAt,
		r.EvalBundleID, r.EvalBundleFingerprint,
	)
	return err
}

func (s *SQLiteStore) GetRun(ctx context.Context, id string) (*models.Run, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, pipeline_id, status, trigger, git_sha, git_branch, error_msg,
		        started_at, finished_at, created_at, eval_bundle_id, eval_bundle_fingerprint FROM runs WHERE id = ?`, id)
	return scanRun(row)
}

func (s *SQLiteStore) ListRuns(ctx context.Context, pipelineID string) ([]*models.Run, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, pipeline_id, status, trigger, git_sha, git_branch, error_msg,
		        started_at, finished_at, created_at, eval_bundle_id, eval_bundle_fingerprint
		 FROM runs WHERE pipeline_id = ? ORDER BY created_at DESC`, pipelineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.Run
	for rows.Next() {
		r, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) ListRunsAll(ctx context.Context, f ListRunsFilter) ([]*models.RunSummary, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 200
	}
	if limit > 500 {
		limit = 500
	}

	q := `SELECT r.id, r.pipeline_id, r.status, r.trigger, r.git_sha, r.git_branch, r.error_msg,
		r.started_at, r.finished_at, r.created_at, r.eval_bundle_id, r.eval_bundle_fingerprint,
		p.name, p.repo_name
		FROM runs r
		JOIN pipelines p ON p.id = r.pipeline_id
		WHERE 1=1`
	args := []any{}

	if f.Status != "" {
		q += ` AND r.status = ?`
		args = append(args, f.Status)
	}
	if f.RepoContains != "" {
		pat := "%" + f.RepoContains + "%"
		q += ` AND (LOWER(p.repo_name) LIKE LOWER(?) OR LOWER(p.name) LIKE LOWER(?))`
		args = append(args, pat, pat)
	}
	if f.BranchContains != "" {
		pat := "%" + f.BranchContains + "%"
		q += ` AND LOWER(r.git_branch) LIKE LOWER(?)`
		args = append(args, pat)
	}

	q += ` ORDER BY r.created_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.RunSummary
	for rows.Next() {
		su, err := scanRunSummary(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, su)
	}
	return out, rows.Err()
}

func scanRunSummary(row scanner) (*models.RunSummary, error) {
	var s models.RunSummary
	r := &s.Run
	var startedAt, finishedAt sql.NullTime
	err := row.Scan(
		&r.ID, &r.PipelineID, &r.Status, &r.Trigger,
		&r.GitSHA, &r.GitBranch, &r.ErrorMsg,
		&startedAt, &finishedAt, &r.CreatedAt,
		&r.EvalBundleID, &r.EvalBundleFingerprint,
		&s.PipelineName, &s.PipelineRepoName,
	)
	if err != nil {
		return nil, err
	}
	if startedAt.Valid {
		r.StartedAt = &startedAt.Time
	}
	if finishedAt.Valid {
		r.FinishedAt = &finishedAt.Time
	}
	return &s, nil
}

func (s *SQLiteStore) UpdateRunStatus(ctx context.Context, id string, status models.RunStatus, errMsg string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE runs SET status=?, error_msg=? WHERE id=?`, status, errMsg, id)
	return err
}

func (s *SQLiteStore) StartRun(ctx context.Context, id string) error {
	now := time.Now().UTC()
	_, err := s.db.ExecContext(ctx,
		`UPDATE runs SET status=?, started_at=? WHERE id=?`, models.RunStatusRunning, now, id)
	return err
}

func (s *SQLiteStore) FinishRun(ctx context.Context, id string, status models.RunStatus, errMsg string) error {
	now := time.Now().UTC()
	_, err := s.db.ExecContext(ctx,
		`UPDATE runs SET status=?, error_msg=?, finished_at=? WHERE id=?`, status, errMsg, now, id)
	return err
}

func scanRun(row scanner) (*models.Run, error) {
	var r models.Run
	var startedAt, finishedAt sql.NullTime
	err := row.Scan(
		&r.ID, &r.PipelineID, &r.Status, &r.Trigger,
		&r.GitSHA, &r.GitBranch, &r.ErrorMsg,
		&startedAt, &finishedAt, &r.CreatedAt,
		&r.EvalBundleID, &r.EvalBundleFingerprint,
	)
	if err != nil {
		return nil, err
	}
	if startedAt.Valid {
		r.StartedAt = &startedAt.Time
	}
	if finishedAt.Valid {
		r.FinishedAt = &finishedAt.Time
	}
	return &r, nil
}

// ── Stage results ─────────────────────────────────────────────────────────────

func (s *SQLiteStore) SaveStageResult(ctx context.Context, r *models.StageResult) error {
	if r.ID == "" {
		r.ID = uuid.NewString()
	}
	results, err := json.Marshal(r)
	if err != nil {
		return fmt.Errorf("marshal stage result: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT OR REPLACE INTO stage_results
		 (id, run_id, stage_name, iteration, status, retry_count, results, started_at, finished_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.RunID, r.StageName, r.Iteration, r.Status, r.RetryCount,
		string(results), r.StartedAt, r.FinishedAt,
	)
	return err
}

func (s *SQLiteStore) GetStageResults(ctx context.Context, runID string) ([]*models.StageResult, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT results FROM stage_results WHERE run_id = ? ORDER BY started_at ASC`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.StageResult
	for rows.Next() {
		var blob string
		if err := rows.Scan(&blob); err != nil {
			return nil, err
		}
		var sr models.StageResult
		if err := json.Unmarshal([]byte(blob), &sr); err != nil {
			return nil, fmt.Errorf("unmarshal stage result: %w", err)
		}
		out = append(out, &sr)
	}
	return out, rows.Err()
}

// ── Logs ──────────────────────────────────────────────────────────────────────

func (s *SQLiteStore) AppendLog(ctx context.Context, entry *models.LogEntry) error {
	entry.CreatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO logs (run_id, stage_name, step_name, line, created_at)
		 VALUES (?, ?, ?, ?, ?)`,
		entry.RunID, entry.StageName, entry.StepName, entry.Line, entry.CreatedAt,
	)
	return err
}

func (s *SQLiteStore) GetLogs(ctx context.Context, runID string) ([]*models.LogEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, run_id, stage_name, step_name, line, created_at
		 FROM logs WHERE run_id = ? ORDER BY id ASC`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.LogEntry
	for rows.Next() {
		var e models.LogEntry
		if err := rows.Scan(&e.ID, &e.RunID, &e.StageName, &e.StepName, &e.Line, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

// ── Run artifacts ─────────────────────────────────────────────────────────────

func (s *SQLiteStore) InsertRunArtifact(ctx context.Context, a *models.RunArtifact) error {
	if a.ID == "" {
		a.ID = uuid.NewString()
	}
	if a.CreatedAt.IsZero() {
		a.CreatedAt = time.Now().UTC()
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO run_artifacts (id, run_id, stage_name, step_name, logical_name, storage_path, size_bytes, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ID, a.RunID, a.StageName, a.StepName, a.LogicalName, a.StoragePath, a.SizeBytes, a.CreatedAt,
	)
	return err
}

func (s *SQLiteStore) ListRunArtifacts(ctx context.Context, runID string) ([]*models.RunArtifact, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, run_id, stage_name, step_name, logical_name, size_bytes, created_at, storage_path
		 FROM run_artifacts WHERE run_id = ? ORDER BY created_at ASC`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.RunArtifact
	for rows.Next() {
		var a models.RunArtifact
		if err := rows.Scan(&a.ID, &a.RunID, &a.StageName, &a.StepName, &a.LogicalName, &a.SizeBytes, &a.CreatedAt, &a.StoragePath); err != nil {
			return nil, err
		}
		out = append(out, &a)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) ListArtifactsAll(ctx context.Context, f ListArtifactsFilter) ([]*models.ArtifactListItem, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 300
	}
	if limit > 1000 {
		limit = 1000
	}

	q := `SELECT a.id, a.run_id, a.stage_name, a.step_name, a.logical_name, a.size_bytes, a.created_at,
		r.pipeline_id, r.status, p.name, p.repo_name
		FROM run_artifacts a
		JOIN runs r ON r.id = a.run_id
		JOIN pipelines p ON p.id = r.pipeline_id
		WHERE 1=1`
	args := []any{}

	if f.NameContains != "" {
		pat := "%" + f.NameContains + "%"
		q += ` AND (LOWER(a.logical_name) LIKE LOWER(?) OR LOWER(a.step_name) LIKE LOWER(?))`
		args = append(args, pat, pat)
	}
	if f.PipelineContains != "" {
		pat := "%" + f.PipelineContains + "%"
		q += ` AND (LOWER(p.repo_name) LIKE LOWER(?) OR LOWER(p.name) LIKE LOWER(?))`
		args = append(args, pat, pat)
	}

	q += ` ORDER BY a.created_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.ArtifactListItem
	for rows.Next() {
		var item models.ArtifactListItem
		a := &item.RunArtifact
		err := rows.Scan(
			&a.ID, &a.RunID, &a.StageName, &a.StepName, &a.LogicalName, &a.SizeBytes, &a.CreatedAt,
			&item.PipelineID, &item.RunStatus, &item.PipelineName, &item.PipelineRepoName,
		)
		if err != nil {
			return nil, err
		}
		out = append(out, &item)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) GetRunArtifact(ctx context.Context, runID, artifactID string) (*models.RunArtifact, error) {
	var a models.RunArtifact
	err := s.db.QueryRowContext(ctx,
		`SELECT id, run_id, stage_name, step_name, logical_name, size_bytes, created_at, storage_path
		 FROM run_artifacts WHERE run_id = ? AND id = ?`, runID, artifactID,
	).Scan(&a.ID, &a.RunID, &a.StageName, &a.StepName, &a.LogicalName, &a.SizeBytes, &a.CreatedAt, &a.StoragePath)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

const settingsKeyGlobalEnv = "global_env"

// GetGlobalEnv returns dashboard-configured env vars merged into every run (pipeline env overrides on key clash).
func (s *SQLiteStore) GetGlobalEnv(ctx context.Context) (map[string]string, error) {
	var raw sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, settingsKeyGlobalEnv).Scan(&raw)
	if err == sql.ErrNoRows {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	if !raw.Valid || raw.String == "" {
		return map[string]string{}, nil
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(raw.String), &m); err != nil || m == nil {
		return map[string]string{}, nil
	}
	return m, nil
}

// SetGlobalEnv persists global env (replaces the whole map).
func (s *SQLiteStore) SetGlobalEnv(ctx context.Context, env map[string]string) error {
	if env == nil {
		env = map[string]string{}
	}
	b, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal global env: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		settingsKeyGlobalEnv, string(b),
	)
	return err
}

func (s *SQLiteStore) Close() error {
	return s.db.Close()
}
