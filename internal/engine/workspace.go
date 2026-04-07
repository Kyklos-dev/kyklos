package engine

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/kyklos/kyklos/internal/config"
	"github.com/kyklos/kyklos/internal/models"
)

// WorkspaceManager prepares per-run working directories. (Fix 2)
//
// For webhook/schedule triggers it clones or fetches the repo and creates a
// git worktree scoped to the run.  For manual triggers with workspace_path set
// it uses that path directly, skipping git entirely (local dev shortcut).
//
// Pipelines can set config.repository (url + branch) to clone any GitHub/Git remote
// without registering the repo in kyklos-server.yaml.
type WorkspaceManager struct {
	workspaceRoot string          // e.g. /var/kyklos/workspaces
	repos         []config.RepoConfig
}

// NewWorkspaceManager creates a WorkspaceManager from server config.
func NewWorkspaceManager(cfg *config.ServerConfig) *WorkspaceManager {
	return &WorkspaceManager{
		workspaceRoot: cfg.Server.WorkspaceDir(),
		repos:         cfg.Repos,
	}
}

// PrepareResult holds the workspace path and a cleanup function for the caller.
type PrepareResult struct {
	Path    string // absolute path to workspace
	Cleanup func() // caller must defer this
	// GitSHA and GitBranch are set when the workspace comes from a git clone/worktree
	// (the resolved commit and branch tip used for the run).
	GitSHA    string
	GitBranch string
}

// Prepare returns a ready-to-use workspace path for the given pipeline + trigger.
// The cleanup function removes any temporary worktree created for this run.
func (m *WorkspaceManager) Prepare(
	ctx context.Context,
	pipeline *models.Pipeline,
	req models.TriggerRequest,
) (*PrepareResult, error) {
	// Local override: skip git entirely (useful for dev / manual triggers)
	if req.WorkspacePath != "" {
		slog.Info("using local workspace override", "path", req.WorkspacePath)
		return &PrepareResult{Path: req.WorkspacePath, Cleanup: func() {}, GitSHA: req.GitSHA, GitBranch: req.GitBranch}, nil
	}

	cfg := pipeline.Config

	// Inline Git remote on the pipeline (GitHub URL + branch)
	if cfg.Repository != nil && strings.TrimSpace(cfg.Repository.URL) != "" {
		return m.prepareFromRepository(ctx, req, cfg.Repository)
	}

	// No repo configured (e.g. pipeline created via the UI with no repo_name).
	// Use a temporary directory — the engine will fall back to the stored config.
	if pipeline.RepoName == "" {
		tmpDir, err := os.MkdirTemp("", "kyklos-run-*")
		if err != nil {
			return nil, fmt.Errorf("create temp workspace: %w", err)
		}
		slog.Info("no repo configured, using temp workspace", "path", tmpDir)
		return &PrepareResult{Path: tmpDir, Cleanup: func() { os.RemoveAll(tmpDir) }, GitSHA: req.GitSHA, GitBranch: req.GitBranch}, nil
	}

	repo, err := m.findRepo(pipeline.RepoName)
	if err != nil {
		return nil, err
	}

	defaultBr := defaultServerRepoBranch(repo)
	baseDir := filepath.Join(m.workspaceRoot, repo.Name, "base")
	if err := m.ensureServerClone(ctx, repo, baseDir, defaultBr); err != nil {
		return nil, fmt.Errorf("ensure base clone for %q: %w", repo.Name, err)
	}

	sha, effBr, err := m.resolveCommitSHA(ctx, baseDir, req, defaultBr)
	if err != nil {
		return nil, fmt.Errorf("resolve commit for %q: %w", repo.Name, err)
	}

	worktreePath := filepath.Join(m.workspaceRoot, repo.Name, "runs", shortSHA(sha))
	if err := m.createWorktree(ctx, baseDir, worktreePath, sha); err != nil {
		return nil, fmt.Errorf("create worktree at %q: %w", worktreePath, err)
	}

	cleanup := func() {
		if err := m.removeWorktree(context.Background(), baseDir, worktreePath); err != nil {
			slog.Warn("failed to remove worktree", "path", worktreePath, "err", err)
		}
	}

	slog.Info("workspace ready", "repo", repo.Name, "sha", sha, "path", worktreePath)
	return &PrepareResult{Path: worktreePath, Cleanup: cleanup, GitSHA: sha, GitBranch: effBr}, nil
}

func (m *WorkspaceManager) prepareFromRepository(
	ctx context.Context,
	req models.TriggerRequest,
	repo *config.RepositoryConfig,
) (*PrepareResult, error) {
	defaultBr := repo.Branch
	if defaultBr == "" {
		defaultBr = "main"
	}

	key := urlDirKey(repo.URL)
	baseDir := filepath.Join(m.workspaceRoot, "inline", key)

	if err := m.ensureInlineClone(ctx, repo, baseDir, defaultBr); err != nil {
		return nil, fmt.Errorf("clone repository: %w", err)
	}

	sha, effBr, err := m.resolveCommitSHA(ctx, baseDir, req, defaultBr)
	if err != nil {
		return nil, err
	}

	worktreePath := filepath.Join(m.workspaceRoot, "inline", key, "runs", shortSHA(sha))
	if err := m.createWorktree(ctx, baseDir, worktreePath, sha); err != nil {
		return nil, fmt.Errorf("create worktree at %q: %w", worktreePath, err)
	}

	cleanup := func() {
		if err := m.removeWorktree(context.Background(), baseDir, worktreePath); err != nil {
			slog.Warn("failed to remove worktree", "path", worktreePath, "err", err)
		}
	}

	slog.Info("workspace ready (inline repo)", "url", repo.URL, "branch", effBr, "sha", sha, "path", worktreePath)
	return &PrepareResult{Path: worktreePath, Cleanup: cleanup, GitSHA: sha, GitBranch: effBr}, nil
}

func defaultServerRepoBranch(r config.RepoConfig) string {
	if r.Branch != "" {
		return r.Branch
	}
	return "main"
}

func shortSHA(sha string) string {
	if len(sha) > 12 {
		return sha[:12]
	}
	return sha
}

// urlDirKey returns a stable directory name for a remote URL.
func urlDirKey(rawURL string) string {
	h := sha256.Sum256([]byte(strings.TrimSpace(rawURL)))
	return hex.EncodeToString(h[:8])
}

// refreshKyklosManagedClone widens fetch refspec and pulls branch tips so any remote branch
// can be checked out. Older Kyklos clones used `git clone -b BRANCH`, which implied
// single-branch and broke runs on other branches selected in the UI.
func (m *WorkspaceManager) refreshKyklosManagedClone(ctx context.Context, baseDir string) error {
	// Replace any single-branch refspec(s) with a wildcard so every remote head is available.
	_ = m.git(ctx, baseDir, "config", "--unset-all", "remote.origin.fetch")
	if err := m.git(ctx, baseDir, "config", "--add", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"); err != nil {
		return err
	}
	return m.git(ctx, baseDir, "fetch", "--depth=100", "origin")
}

// resolveCommitSHA picks a commit to run. req.GitSHA wins; otherwise the tip of
// req.GitBranch or defaultBranch (typically from kyklos.yaml repository.branch or server repo.branch).
func (m *WorkspaceManager) resolveCommitSHA(
	ctx context.Context,
	baseDir string,
	req models.TriggerRequest,
	defaultBranch string,
) (sha string, effectiveBranch string, err error) {
	if err := m.git(ctx, baseDir, "fetch", "--depth=100", "origin"); err != nil {
		return "", "", fmt.Errorf("git fetch: %w", err)
	}

	if s := strings.TrimSpace(req.GitSHA); s != "" {
		if err := m.git(ctx, baseDir, "cat-file", "-e", s+"^{commit}"); err != nil {
			return "", "", fmt.Errorf("commit %q not found after fetch (need a full fetch or valid SHA)", s)
		}
		out, err := exec.CommandContext(ctx, "git", "-C", baseDir, "rev-parse", s).Output()
		if err != nil {
			return "", "", fmt.Errorf("rev-parse sha: %w", err)
		}
		full := strings.TrimSpace(string(out))
		br := strings.TrimSpace(req.GitBranch)
		return full, br, nil
	}

	branch := strings.TrimSpace(req.GitBranch)
	if branch == "" {
		branch = strings.TrimSpace(defaultBranch)
	}
	if branch == "" {
		branch = "main"
	}

	// Ensure remote-tracking ref exists (depth for shallow clones)
	refspec := fmt.Sprintf("+refs/heads/%s:refs/remotes/origin/%s", branch, branch)
	if err := m.git(ctx, baseDir, "fetch", "--depth=100", "origin", refspec); err != nil {
		return "", "", fmt.Errorf("fetch branch %q: %w", branch, err)
	}

	out, err := exec.CommandContext(ctx, "git", "-C", baseDir, "rev-parse", fmt.Sprintf("origin/%s", branch)).Output()
	if err != nil {
		return "", "", fmt.Errorf("rev-parse origin/%s: %w", branch, err)
	}
	full := strings.TrimSpace(string(out))
	return full, branch, nil
}

func (m *WorkspaceManager) findRepo(name string) (config.RepoConfig, error) {
	for _, r := range m.repos {
		if r.Name == name {
			return r, nil
		}
	}
	return config.RepoConfig{}, fmt.Errorf("repo %q not registered in kyklos-server.yaml", name)
}

func (m *WorkspaceManager) ensureServerClone(ctx context.Context, repo config.RepoConfig, baseDir, defaultBranch string) error {
	if _, err := os.Stat(filepath.Join(baseDir, ".git")); err == nil {
		return m.refreshKyklosManagedClone(ctx, baseDir)
	}

	if err := os.MkdirAll(filepath.Dir(baseDir), 0o755); err != nil {
		return err
	}

	remote, err := m.authenticatedServerRemote(repo)
	if err != nil {
		return err
	}

	return m.git(ctx, "", "clone", "--depth=50", "--no-single-branch", "-b", defaultBranch, remote, baseDir)
}

func (m *WorkspaceManager) ensureInlineClone(ctx context.Context, repo *config.RepositoryConfig, baseDir, defaultBranch string) error {
	if _, err := os.Stat(filepath.Join(baseDir, ".git")); err == nil {
		return m.refreshKyklosManagedClone(ctx, baseDir)
	}

	if err := os.MkdirAll(filepath.Dir(baseDir), 0o755); err != nil {
		return err
	}

	remote, err := m.authenticatedInlineRemote(repo)
	if err != nil {
		return err
	}

	return m.git(ctx, "", "clone", "--depth=50", "--no-single-branch", "-b", defaultBranch, remote, baseDir)
}

func (m *WorkspaceManager) authenticatedServerRemote(repo config.RepoConfig) (string, error) {
	return m.authenticatedHTTPSRemote(repo.Remote, repo.Auth)
}

func (m *WorkspaceManager) authenticatedInlineRemote(repo *config.RepositoryConfig) (string, error) {
	if repo.TokenEnv != "" {
		return m.authenticatedHTTPSRemote(repo.URL, config.RepoAuth{Type: "token", Env: repo.TokenEnv})
	}
	for _, env := range []string{"GITHUB_TOKEN", "KYKLOS_GIT_TOKEN", "GIT_TOKEN"} {
		if os.Getenv(env) != "" {
			return m.authenticatedHTTPSRemote(repo.URL, config.RepoAuth{Type: "token", Env: env})
		}
	}
	return repo.URL, nil
}

// authenticatedHTTPSRemote injects credentials into https:// URLs when auth is token-based.
func (m *WorkspaceManager) authenticatedHTTPSRemote(remote string, auth config.RepoAuth) (string, error) {
	if auth.Type != "token" {
		return remote, nil
	}
	token := os.Getenv(auth.Env)
	if token == "" {
		return "", fmt.Errorf("git auth: environment variable %q is empty", auth.Env)
	}
	const prefix = "https://"
	if len(remote) > len(prefix) && remote[:len(prefix)] == prefix {
		return prefix + token + "@" + remote[len(prefix):], nil
	}
	return remote, nil
}

// createWorktree creates a git worktree at path checked out at sha.
// If the worktree path already exists (e.g. from a previous run with same sha),
// it is reused as-is.
func (m *WorkspaceManager) createWorktree(ctx context.Context, baseDir, path, sha string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return m.git(ctx, baseDir, "worktree", "add", "--detach", path, sha)
}

func (m *WorkspaceManager) removeWorktree(ctx context.Context, baseDir, path string) error {
	return m.git(ctx, baseDir, "worktree", "remove", "--force", path)
}

// git runs a git subcommand, optionally inside dir.
func (m *WorkspaceManager) git(ctx context.Context, dir string, args ...string) error {
	cmd := exec.CommandContext(ctx, "git", args...)
	if dir != "" {
		cmd.Dir = dir
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git %v: %w\n%s", args, err, string(out))
	}
	return nil
}

const maxRepoFileBytes = 512 * 1024

func sanitizeRepoRelativePath(p string) (string, error) {
	p = strings.TrimSpace(filepath.ToSlash(p))
	p = strings.TrimPrefix(p, "/")
	if p == "" || p == "." {
		return "", fmt.Errorf("path is empty")
	}
	if strings.Contains(p, "..") {
		return "", fmt.Errorf("path must not contain '..'")
	}
	if len(p) > 1024 {
		return "", fmt.Errorf("path too long")
	}
	return p, nil
}

// ReadRepoFile reads a text file from the remote at the tip of fileBranch using the same
// cached clone as pipeline runs (inline URL key under workspaceRoot).
func (m *WorkspaceManager) ReadRepoFile(ctx context.Context, repoURL, defaultBranch, fileBranch, relPath string) ([]byte, error) {
	repoURL = strings.TrimSpace(repoURL)
	if repoURL == "" {
		return nil, fmt.Errorf("empty repo URL")
	}
	cleanPath, err := sanitizeRepoRelativePath(relPath)
	if err != nil {
		return nil, err
	}
	defBr := strings.TrimSpace(defaultBranch)
	if defBr == "" {
		defBr = "main"
	}
	fileBranch = strings.TrimSpace(fileBranch)
	if fileBranch == "" {
		fileBranch = defBr
	}

	key := urlDirKey(repoURL)
	baseDir := filepath.Join(m.workspaceRoot, "inline", key)
	repoCfg := &config.RepositoryConfig{URL: repoURL, Branch: defBr}
	if err := m.ensureInlineClone(ctx, repoCfg, baseDir, defBr); err != nil {
		return nil, err
	}
	if err := m.refreshKyklosManagedClone(ctx, baseDir); err != nil {
		return nil, err
	}
	refspec := fmt.Sprintf("+refs/heads/%s:refs/remotes/origin/%s", fileBranch, fileBranch)
	if err := m.git(ctx, baseDir, "fetch", "--depth=100", "origin", refspec); err != nil {
		return nil, fmt.Errorf("fetch branch %q: %w", fileBranch, err)
	}
	showArg := fmt.Sprintf("origin/%s:%s", fileBranch, cleanPath)
	cmd := exec.CommandContext(ctx, "git", "-C", baseDir, "show", showArg)
	out, err := cmd.Output()
	if err != nil {
		if x, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("git show %s: %w\n%s", showArg, err, string(x.Stderr))
		}
		return nil, fmt.Errorf("git show %s: %w", showArg, err)
	}
	if len(out) > maxRepoFileBytes {
		return nil, fmt.Errorf("file exceeds max size (%d bytes)", maxRepoFileBytes)
	}
	return out, nil
}
