// ── Workspace (dashboard Git repo; pipelines scoped with workspace_id) ─────

export interface Workspace {
  id: string;
  name: string;
  repo_url: string;
  default_branch: string;
  branches: string[];
  branches_updated_at?: string;
  created_at: string;
  updated_at: string;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export interface Pipeline {
  id: string;
  name: string;
  /** Dashboard workspace — engine clones repo_url and checks out run branch */
  workspace_id?: string;
  repo_name: string;
  yaml_path: string;
  config: PipelineConfig;
  /** Canonical kyklos.yaml from server (GET/POST/PUT); use to pre-fill edit form */
  yaml?: string;
  /** Pinned “Run A” for compare; set from run or pipeline UI */
  baseline_run_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineConfig {
  version: string;
  name: string;
  agent?: AgentConfig;
  triggers?: Trigger[];
  pipeline?: Stage[];
  notify?: NotifyConfig;
  /** Clone this Git remote + branch into the run workspace (no kyklos-server repo list needed) */
  repository?: RepositoryConfig;
  /** Pinned eval artifacts — fingerprint stored on each run */
  eval_bundle?: EvalBundleConfig;
}

export interface RepositoryConfig {
  url: string;
  branch?: string;
  /** Env var name for HTTPS token (GitHub PAT). Falls back to GITHUB_TOKEN / KYKLOS_GIT_TOKEN. */
  token_env?: string;
}

export interface EvalBundleConfig {
  id?: string;
  prompt?: string;
  dataset?: string;
  rubric?: string;
  schema?: string;
  /** Overrides agent.model for fingerprinting */
  model?: string;
}

export interface AgentConfig {
  model: string;
  prompt?: string;
  tools?: string[];
  temperature?: number;
  max_tokens?: number;
  /** anthropic | openai | gemini | script — see sdk/python/kyklos/sdk/agent.py */
  runner?: { type?: string; script?: string };
}

export interface Trigger {
  on: "push" | "schedule" | "manual";
  branch?: string;
  cron?: string;
}

export interface Stage {
  name: string;
  steps: Step[];
  pass_if?: Record<string, string>;
  on_fail?: OnFail;
}

export interface Step {
  uses: string;
  name?: string;
  with?: Record<string, unknown>;
}

export interface OnFail {
  then: "abort" | "continue" | "goto";
  goto?: string;
  retry?: { max_attempts: number; delay_seconds: number };
}

export interface NotifyConfig {
  on?: string[];
  slack?: string;
  email?: string;
}

// ── Run ───────────────────────────────────────────────────────────────────────

export type RunStatus = "pending" | "running" | "passed" | "failed" | "cancelled";
export type TriggerKind = "push" | "schedule" | "manual";

export interface Run {
  id: string;
  pipeline_id: string;
  status: RunStatus;
  trigger: TriggerKind;
  git_sha?: string;
  git_branch?: string;
  error_msg?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  eval_bundle_id?: string;
  eval_bundle_fingerprint?: string;
  /** Present when listing runs with enrich=1 (for score history charts). */
  chart_metrics?: Record<string, number>;
}

/** Run row from GET /runs (global explorer). */
export interface RunSummary extends Run {
  pipeline_name: string;
  pipeline_repo_name: string;
}

export interface RunDetail {
  run: Run;
  stages: StageResult[];
  artifacts?: RunArtifact[];
}

export interface RunArtifact {
  id: string;
  run_id: string;
  stage_name: string;
  step_name: string;
  logical_name: string;
  size_bytes: number;
  created_at: string;
}

/** Row from GET /artifacts (global explorer). */
export interface ArtifactListItem extends RunArtifact {
  pipeline_id: string;
  pipeline_name: string;
  pipeline_repo_name: string;
  run_status: RunStatus;
}

export interface RunCompareResponse {
  run_a: Run;
  run_b: Run;
  score_diff: Record<string, { a: number; b: number; delta: number }>;
  meta: {
    git_sha: { a: string; b: string };
    eval_bundle_fingerprint: { a: string; b: string };
    eval_bundle_id: { a: string; b: string };
  };
}

// ── Stage / Step results ──────────────────────────────────────────────────────

export type StageStatus = "passed" | "failed" | "skipped" | "running";

export interface StageResult {
  id: string;
  run_id: string;
  stage_name: string;
  iteration: number;
  status: StageStatus;
  retry_count: number;
  steps: StepResult[];
  gate_results: GateResult[];
  started_at?: string;
  finished_at?: string;
}

export interface StepResult {
  name: string;
  uses: string;
  status: StageStatus;
  scores: Record<string, number>;
  passed: boolean;
  metadata: Record<string, unknown>;
  artifacts: string[];
  logs: string[];
}

export interface GateResult {
  key: string;
  value: number;
  expr: string;
  passed: boolean;
}

// ── Log stream ────────────────────────────────────────────────────────────────

export interface LogLine {
  line: string;
  stage: string;
  step: string;
  ts: string;
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export interface StepMeta {
  path: string;
  category: string;
  name: string;
  description: string;
  size_bytes: number;
}
