package config

// PipelineConfig is the parsed representation of a kyklos.yaml file.
type PipelineConfig struct {
	Version  string            `yaml:"version"`
	Name     string            `yaml:"name"`
	Agent    AgentConfig       `yaml:"agent"`
	Triggers []Trigger         `yaml:"triggers"`
	Pipeline []Stage           `yaml:"pipeline"`
	Notify   NotifyConfig      `yaml:"notify"`
	Env      map[string]string `yaml:"env"`
	// Repository pins a Git remote + default branch without kyklos-server.yaml repo registration.
	// When set (url non-empty), the engine clones this URL into the workspace (token from token_env or GITHUB_TOKEN / KYKLOS_GIT_TOKEN).
	Repository *RepositoryConfig `yaml:"repository,omitempty"`
	// EvalBundle optionally pins prompt/dataset/rubric/schema + model for an immutable fingerprint per run.
	EvalBundle *EvalBundleConfig `yaml:"eval_bundle,omitempty"`
	// MaxGoto caps the number of times the engine will follow an on_fail goto
	// across the entire run. Default 10. (Fix 5)
	MaxGoto int `yaml:"max_goto"`
}

// RepositoryConfig declares where to clone agent code from when not using server repos (repo_name).
type RepositoryConfig struct {
	URL      string `yaml:"url"`                // https://github.com/org/repo.git or SSH form
	Branch   string `yaml:"branch,omitempty"`   // default branch when trigger does not pass branch/sha (default main)
	TokenEnv string `yaml:"token_env,omitempty"` // env var holding a Git HTTPS token (GitHub: PAT or fine-grained token)
}

// EvalBundleConfig defines artifacts included in the run's eval_bundle_fingerprint.
// Paths are relative to the workspace root unless absolute. Empty prompt falls back to agent.prompt.
type EvalBundleConfig struct {
	ID      string `yaml:"id,omitempty"`      // human-readable label (e.g. prod-2026q1)
	Prompt  string `yaml:"prompt,omitempty"`  // overrides hashed prompt file; default is agent.prompt
	Dataset string `yaml:"dataset,omitempty"` // JSONL or similar
	Rubric  string `yaml:"rubric,omitempty"`
	Schema  string `yaml:"schema,omitempty"`
	Model   string `yaml:"model,omitempty"` // when set, overrides agent.model for the fingerprint
}

// AgentConfig describes the agent being tested. (Fix 1: runner field added)
type AgentConfig struct {
	Name        string      `yaml:"name"`
	Prompt      string      `yaml:"prompt"`
	Model       string      `yaml:"model"`
	Tools       []string    `yaml:"tools"`
	Temperature float64     `yaml:"temperature"`
	MaxTokens   int         `yaml:"max_tokens"`
	Runner      AgentRunner `yaml:"runner"`
}

// AgentRunner selects how the agent is invoked. (Fix 1)
// type=anthropic: Anthropic Messages API (default when Runner is zero value)
// type=openai:    OpenAI Chat Completions (OPENAI_API_KEY)
// type=gemini:    Google Generative AI (GOOGLE_API_KEY); alias type=google
// type=script:    user-supplied Python script
type AgentRunner struct {
	Type   string `yaml:"type"`   // anthropic | openai | gemini | google | script
	Script string `yaml:"script"` // path to script; only valid when type="script"
}

// RunnerType returns the effective runner type, defaulting to "anthropic".
func (r AgentRunner) RunnerType() string {
	if r.Type == "" {
		return "anthropic"
	}
	return r.Type
}

// Trigger defines when a pipeline runs.
type Trigger struct {
	On     string   `yaml:"on"`     // "push" | "schedule" | "manual"
	Branch string   `yaml:"branch"` // for on=push; default "main"
	Paths  []string `yaml:"paths"`  // optional path filters for on=push
	Cron   string   `yaml:"cron"`   // for on=schedule
}

// Stage is one step in the pipeline. (Fix 8: pass_if replaces gate)
type Stage struct {
	Name   string            `yaml:"name"`
	Steps  []Step            `yaml:"steps"`
	PassIf map[string]string `yaml:"pass_if"` // engine-evaluated conditions; was "gate:"
	OnFail OnFail            `yaml:"on_fail"`
}

// Step is a single executable unit within a stage.
type Step struct {
	Uses string                 `yaml:"uses"` // "kyklos/llm-judge" | "./my_step.py" | "package"
	Name string                 `yaml:"name"` // optional override; defaults to uses
	With map[string]interface{} `yaml:"with"` // config passed to step
	// TimeoutSeconds caps wall time for this step only (subprocess + I/O). 0 = inherit pipeline ctx.
	TimeoutSeconds int `yaml:"timeout_seconds,omitempty"`
}

// StepName returns the step's effective name (With.name override or Uses value).
func (s Step) StepName() string {
	if s.Name != "" {
		return s.Name
	}
	return s.Uses
}

// OnFail specifies routing when a stage's pass_if conditions are not met. (Fix 6)
// Canonical form: then + optional goto/retry. "abort: true" shorthand is rejected at validation.
type OnFail struct {
	Then  string `yaml:"then"`  // "abort" | "continue" | "goto" (required)
	Goto  string `yaml:"goto"`  // required when then="goto"
	Retry Retry  `yaml:"retry"` // optional
}

// Retry controls re-execution of a failing stage.
type Retry struct {
	MaxAttempts  int `yaml:"max_attempts"`  // default 1 (no retry)
	DelaySeconds int `yaml:"delay_seconds"` // default 0
}

// NotifyConfig specifies notification channels.
type NotifyConfig struct {
	On    []string `yaml:"on"`    // "failure" | "success" | "always"
	Slack string   `yaml:"slack"` // webhook URL or env var reference
	Email string   `yaml:"email"` // email address or env var reference
}

// ServerConfig is the kyklos-server.yaml representation. (Fix 2, 3, 10)
type ServerConfig struct {
	Server ServerSettings `yaml:"server"`
	Repos  []RepoConfig   `yaml:"repos"`
}

// ServerSettings holds server-level knobs. (Fix 10: bind defaults to 127.0.0.1)
type ServerSettings struct {
	Bind          string     `yaml:"bind"`           // default "127.0.0.1:8080"
	WorkspaceRoot string     `yaml:"workspace_root"` // where repos are checked out
	PythonVenv    string     `yaml:"python_venv"`    // pre-built venv path; skip bootstrap if set
}

// BindAddr returns the effective bind address.
func (s ServerSettings) BindAddr() string {
	if s.Bind == "" {
		return "127.0.0.1:8080"
	}
	return s.Bind
}

// WorkspaceDir returns the effective workspace root.
func (s ServerSettings) WorkspaceDir() string {
	if s.WorkspaceRoot == "" {
		return "/var/kyklos/workspaces"
	}
	return s.WorkspaceRoot
}

// RepoConfig registers an agent repository. (Fix 2)
type RepoConfig struct {
	Name             string   `yaml:"name"`
	Remote           string   `yaml:"remote"`
	Branch           string   `yaml:"branch,omitempty"` // default branch for manual/cron runs (default main)
	Auth             RepoAuth `yaml:"auth"`
	WebhookSecretEnv string   `yaml:"webhook_secret_env"`
}

// RepoAuth holds credentials for cloning a repo.
type RepoAuth struct {
	Type string `yaml:"type"` // "none" | "token" | "ssh"
	Env  string `yaml:"env"`  // env var name holding the token; only for type="token"
}
