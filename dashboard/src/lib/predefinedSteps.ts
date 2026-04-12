/**
 * Built-in kyklos steps (mirrors internal/engine/resolver.go builtinSteps).
 * Used by the visual pipeline builder palette.
 */

export type StepCategory = "build" | "test" | "evaluate" | "register" | "deploy";

export interface PredefinedStep {
  uses: string;
  title: string;
  description: string;
  category: StepCategory;
  /** Shown when the step row is expanded */
  withHint?: string;
  /** Default `with:` block (omit step.with in YAML if empty) */
  defaultWith?: Record<string, unknown>;
  /**
   * Full `with:` options for the Step catalog example (all known keys).
   * When set, the catalog prefers this over defaultWith for the YAML preview.
   */
  fullWith?: Record<string, unknown>;
  /** Path on the docs site (path + hash), e.g. `/reference/steps/build#step-lint` */
  docPath: string;
}

export const STEP_CATEGORIES: { id: StepCategory; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "test", label: "Test" },
  { id: "evaluate", label: "Evaluate" },
  { id: "register", label: "Register" },
  { id: "deploy", label: "Deploy" },
];

export const PREDEFINED_STEPS: PredefinedStep[] = [
  // Build
  {
    uses: "kyklos/lint",
    title: "Lint",
    description: "Validate agent config before running costly steps.",
    category: "build",
    docPath: "/reference/steps/build#step-lint",
  },
  {
    uses: "kyklos/snapshot",
    title: "Snapshot",
    description: "Hash agent definition for drift detection.",
    category: "build",
    docPath: "/reference/steps/build#step-snapshot",
  },
  {
    uses: "kyklos/diff",
    title: "Diff",
    description: "Compare agent outputs or configs across revisions.",
    category: "build",
    withHint: "Configure paths in with: per your repo layout.",
    fullWith: {
      compare_to: "last_passing",
    },
    docPath: "/reference/steps/build#step-diff",
  },
  // Test
  {
    uses: "kyklos/run-dataset",
    title: "Run dataset",
    description: "Run the agent on every row in a JSONL dataset.",
    category: "test",
    withHint: "dataset: path to JSONL (relative to repo workspace)",
    defaultWith: {
      dataset: "./datasets/hello.jsonl",
      concurrency: 4,
    },
    fullWith: {
      dataset: "./datasets/eval.jsonl",
      runs: 1,
      concurrency: 4,
      timeout_per_run: 60,
    },
    docPath: "/reference/steps/test#step-run-dataset",
  },
  {
    uses: "kyklos/simulate-conversation",
    title: "Simulate conversation",
    description: "Multi-turn scripted dialog tests.",
    category: "test",
    fullWith: {
      scenarios: "./scenarios.jsonl",
      max_turns: 8,
      runs: 1,
    },
    docPath: "/reference/steps/test#step-simulate-conversation",
  },
  {
    uses: "kyklos/check-tool-calls",
    title: "Check tool calls",
    description: "Assert expected tool usage from runs.",
    category: "test",
    fullWith: {
      dataset: "./datasets/tool_eval.jsonl",
      from: "run-dataset",
    },
    docPath: "/reference/steps/test#step-check-tool-calls",
  },
  {
    uses: "kyklos/wait",
    title: "Wait (soak test)",
    description:
      "Sleep for with.seconds (default 65) to simulate a long run — for dashboard/timing tests only.",
    category: "test",
    withHint: "seconds: 70 — capped at 7200 for safety.",
    defaultWith: { seconds: 70 },
    fullWith: { seconds: 70 },
    docPath: "/reference/steps/test#step-wait",
  },
  // Evaluate
  {
    uses: "kyklos/semantic-similarity",
    title: "Semantic similarity",
    description:
      "DeepEval embedding cosine vs expected_output_contains; token fallback when needed.",
    category: "evaluate",
    withHint:
      "method: auto|embedding|token — embedding_model (OpenAI) — dataset + slice_field for slices",
    defaultWith: {
      from: "test.kyklos/run-dataset",
      dataset: "./dataset.jsonl",
      threshold: 0.85,
      method: "auto",
    },
    fullWith: {
      from: "test.kyklos/run-dataset",
      dataset: "./dataset.jsonl",
      threshold: 0.85,
      method: "auto",
      embedding_model: "text-embedding-3-small",
      slice_field: "region",
    },
    docPath: "/reference/steps/evaluate#step-semantic-similarity",
  },
  {
    uses: "kyklos/exact-match",
    title: "Exact match",
    description: "String-equality checks on outputs.",
    category: "evaluate",
    withHint:
      "optional slice_field (dataset column) emits per-slice accuracy as slice_<slug> for gates",
    fullWith: {
      from: "test.kyklos/run-dataset",
      dataset: "./dataset.jsonl",
      field: "intent",
      slice_field: "locale",
    },
    docPath: "/reference/steps/evaluate#step-exact-match",
  },
  {
    uses: "kyklos/llm-judge",
    title: "LLM judge",
    description: "Score outputs with an LLM rubric.",
    category: "evaluate",
    defaultWith: {
      from: "test.kyklos/run-dataset",
      rubric: "./rubric.md",
      model: "openai/gpt-4o-mini",
      threshold: 0.7,
    },
    fullWith: {
      from: "test.kyklos/run-dataset",
      rubric: "./eval/rubric.md",
      model: "openai/gpt-4o-mini",
      threshold: 0.7,
      temperature: 0.2,
    },
    docPath: "/reference/steps/evaluate#step-llm-judge",
  },
  {
    uses: "kyklos/http-judge",
    title: "HTTP judge",
    description:
      "POST dataset outputs to your service; JSON response must include a score (external / batch wrappers).",
    category: "evaluate",
    withHint: "url: https://… — optional score_key, headers, pass_threshold",
    defaultWith: {
      from: "test.kyklos/run-dataset",
      url: "https://example.com/judge",
    },
    fullWith: {
      from: "test.kyklos/run-dataset",
      url: "https://example.com/judge",
      method: "POST",
      timeout_seconds: 120,
      score_key: "score",
      pass_threshold: 0.7,
      headers: { Authorization: "Bearer <token>" },
    },
    docPath: "/reference/steps/evaluate#step-http-judge",
  },
  {
    uses: "kyklos/safety-check",
    title: "Safety check",
    description: "Policy / safety validation on outputs.",
    category: "evaluate",
    defaultWith: { from: "test.kyklos/run-dataset" },
    fullWith: {
      from: "test.kyklos/run-dataset",
      checks: ["harmful_content", "pii", "prompt_injection"],
    },
    docPath: "/reference/steps/evaluate#step-safety-check",
  },
  {
    uses: "kyklos/cost-check",
    title: "Cost check",
    description: "Fail if run cost exceeds a USD cap.",
    category: "evaluate",
    defaultWith: { from: "test.kyklos/run-dataset", max_usd: 0.1 },
    fullWith: { from: "test.kyklos/run-dataset", max_usd: 0.05 },
    docPath: "/reference/steps/evaluate#step-cost-check",
  },
  {
    uses: "kyklos/latency-check",
    title: "Latency check",
    description: "Fail if p95 latency exceeds a threshold.",
    category: "evaluate",
    defaultWith: { from: "test.kyklos/run-dataset", max_p95_ms: 5000 },
    fullWith: { from: "test.kyklos/run-dataset", max_p95_ms: 5000 },
    docPath: "/reference/steps/evaluate#step-latency-check",
  },
  {
    uses: "kyklos/regression",
    title: "Regression",
    description: "Compare metrics against a baseline.",
    category: "evaluate",
    fullWith: {
      fail_if: {
        "llm-judge.score": "drops > 0.03",
        "cost-check.avg_cost_per_run": "increases > 0.02",
      },
    },
    docPath: "/reference/steps/evaluate#step-regression",
  },
  {
    uses: "kyklos/json-schema",
    title: "JSON schema",
    description: "Validate upstream JSONL rows against a JSON Schema file.",
    category: "evaluate",
    withHint: "schema: path under repo — optional field: key to validate (else whole row)",
    defaultWith: {
      from: "test.kyklos/run-dataset",
      schema: "./schemas/output.schema.json",
    },
    fullWith: {
      from: "test.kyklos/run-dataset",
      schema: "./schemas/output.schema.json",
      field: "response",
    },
    docPath: "/reference/steps/evaluate#step-json-schema",
  },
  // Register
  {
    uses: "kyklos/tag",
    title: "Tag",
    description: "Tag the artifact (e.g. latest).",
    category: "register",
    defaultWith: { tag: "latest" },
    fullWith: { tag: "v1.0.0" },
    docPath: "/reference/steps/register-and-deploy#step-tag",
  },
  {
    uses: "kyklos/push",
    title: "Push",
    description: "Push registered artifacts to a remote.",
    category: "register",
    fullWith: {
      registry: "local",
      path: "./registry",
      bucket: "my-artifact-bucket",
    },
    docPath: "/reference/steps/register-and-deploy#step-push",
  },
  // Deploy
  {
    uses: "kyklos/deploy-endpoint",
    title: "Deploy endpoint",
    description: "Deploy or update an inference endpoint.",
    category: "deploy",
    fullWith: {
      platform: "local",
      endpoint: "/agents/default",
      langserve_url: "https://langserve.example.com",
      script: "./scripts/deploy.sh",
    },
    docPath: "/reference/steps/register-and-deploy#step-deploy-endpoint",
  },
  {
    uses: "kyklos/canary",
    title: "Canary",
    description: "Gradual traffic shift with health gates.",
    category: "deploy",
    fullWith: {
      traffic_percent: 10,
      duration_minutes: 30,
      on_local: "warn",
    },
    docPath: "/reference/steps/register-and-deploy#step-canary",
  },
  {
    uses: "kyklos/health-check",
    title: "Health check",
    description: "Probe a deployed endpoint after release.",
    category: "deploy",
    fullWith: {
      probe: "hello, are you working?",
      expected_contains: "ok",
      timeout_ms: 5000,
    },
    docPath: "/reference/steps/register-and-deploy#step-health-check",
  },
];

export function getStepMeta(uses: string): PredefinedStep | undefined {
  return PREDEFINED_STEPS.find((s) => s.uses === uses);
}
