package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"context"

	"github.com/kyklos/kyklos/internal/config"
	"github.com/kyklos/kyklos/internal/store"
)

// PushDispatcher is the minimal interface the webhook handler needs from the scheduler.
type PushDispatcher interface {
	TriggerPush(pipelineID, sha, branch string)
}

// WebhookHandler handles incoming git push events from GitHub and GitLab.
type WebhookHandler struct {
	store      store.Store
	dispatcher PushDispatcher
	repos      []config.RepoConfig
}

// NewWebhookHandler creates a WebhookHandler.
func NewWebhookHandler(st store.Store, d PushDispatcher, repos []config.RepoConfig) *WebhookHandler {
	return &WebhookHandler{store: st, dispatcher: d, repos: repos}
}

// ── GitHub ────────────────────────────────────────────────────────────────────

// GitHub handles POST /webhooks/github
func (h *WebhookHandler) GitHub(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "read body", http.StatusBadRequest)
		return
	}

	event := r.Header.Get("X-GitHub-Event")
	if event != "push" {
		w.WriteHeader(http.StatusNoContent) // ignore non-push events
		return
	}

	// Parse payload first to identify which repo this belongs to
	var payload githubPushPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	repo := h.findRepoByRemote(payload.Repository.CloneURL, payload.Repository.SSHURL)
	if repo == nil {
		slog.Debug("github webhook: no matching repo", "clone_url", payload.Repository.CloneURL)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Validate HMAC signature with repo-specific secret
	if secret := os.Getenv(repo.WebhookSecretEnv); secret != "" {
		sig := r.Header.Get("X-Hub-Signature-256")
		if !validateGitHubSignature(body, secret, sig) {
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}
	}

	branch := strings.TrimPrefix(payload.Ref, "refs/heads/")
	sha := payload.After

	h.dispatchPush(r.Context(), repo.Name, sha, branch)
	w.WriteHeader(http.StatusNoContent)
}

type githubPushPayload struct {
	Ref   string `json:"ref"`
	After string `json:"after"`
	Repository struct {
		CloneURL string `json:"clone_url"`
		SSHURL   string `json:"ssh_url"`
	} `json:"repository"`
}

func validateGitHubSignature(body []byte, secret, signature string) bool {
	const prefix = "sha256="
	if !strings.HasPrefix(signature, prefix) {
		return false
	}
	got, err := hex.DecodeString(signature[len(prefix):])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := mac.Sum(nil)
	return hmac.Equal(got, expected)
}

// ── GitLab ────────────────────────────────────────────────────────────────────

// GitLab handles POST /webhooks/gitlab
func (h *WebhookHandler) GitLab(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "read body", http.StatusBadRequest)
		return
	}

	event := r.Header.Get("X-Gitlab-Event")
	if event != "Push Hook" && event != "Tag Push Hook" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var payload gitlabPushPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	repo := h.findRepoByRemote(payload.Repository.GitHTTPURL, payload.Repository.GitSSHURL)
	if repo == nil {
		slog.Debug("gitlab webhook: no matching repo", "http_url", payload.Repository.GitHTTPURL)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Validate token with repo-specific secret
	if secret := os.Getenv(repo.WebhookSecretEnv); secret != "" {
		token := r.Header.Get("X-Gitlab-Token")
		if token != secret {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
	}

	branch := strings.TrimPrefix(payload.Ref, "refs/heads/")
	sha := payload.CheckoutSHA

	h.dispatchPush(r.Context(), repo.Name, sha, branch)
	w.WriteHeader(http.StatusNoContent)
}

type gitlabPushPayload struct {
	Ref         string `json:"ref"`
	CheckoutSHA string `json:"checkout_sha"`
	Repository  struct {
		GitHTTPURL string `json:"git_http_url"`
		GitSSHURL  string `json:"git_ssh_url"`
	} `json:"repository"`
}

// ── Shared logic ──────────────────────────────────────────────────────────────

// dispatchPush finds all pipelines for this repo whose push trigger matches
// the branch, then fires a run for each.
func (h *WebhookHandler) dispatchPush(ctx context.Context, repoName, sha, branch string) {
	pipelines, err := h.store.ListPipelines(ctx)
	if err != nil {
		slog.Error("webhook: list pipelines failed", "err", err)
		return
	}

	for _, p := range pipelines {
		if p.RepoName != repoName {
			continue
		}
		for _, trigger := range p.Config.Triggers {
			if trigger.On != "push" {
				continue
			}
			watchBranch := trigger.Branch
			if watchBranch == "" {
				watchBranch = "main"
			}
			if watchBranch != branch {
				continue
			}
			// TODO(phase3): check trigger.Paths filter against changed files
			slog.Info("webhook dispatching push trigger",
				"pipeline", p.Name,
				"branch", branch,
				"sha", sha,
			)
			h.dispatcher.TriggerPush(p.ID, sha, branch)
		}
	}
}

// findRepoByRemote finds the RepoConfig whose remote matches any of the given URLs.
func (h *WebhookHandler) findRepoByRemote(urls ...string) *config.RepoConfig {
	for i := range h.repos {
		for _, u := range urls {
			if normalizeRemote(h.repos[i].Remote) == normalizeRemote(u) {
				return &h.repos[i]
			}
		}
	}
	return nil
}

// normalizeRemote strips trailing slashes and .git suffixes for comparison.
func normalizeRemote(u string) string {
	u = strings.TrimSuffix(strings.TrimSpace(u), "/")
	u = strings.TrimSuffix(u, ".git")
	return strings.ToLower(u)
}
