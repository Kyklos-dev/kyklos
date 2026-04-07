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
  },
  {
    uses: "kyklos/snapshot",
    title: "Snapshot",
    description: "Hash agent definition for drift detection.",
    category: "build",
  },
  {
    uses: "kyklos/diff",
    title: "Diff",
    description: "Compare agent outputs or configs across revisions.",
    category: "build",
    withHint: "Configure paths in with: per your repo layout.",
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
  },
  {
    uses: "kyklos/simulate-conversation",
    title: "Simulate conversation",
    description: "Multi-turn scripted dialog tests.",
    category: "test",
  },
  {
    uses: "kyklos/check-tool-calls",
    title: "Check tool calls",
    description: "Assert expected tool usage from runs.",
    category: "test",
  },
  {
    uses: "kyklos/wait",
    title: "Wait (soak test)",
    description:
      "Sleep for with.seconds (default 65) to simulate a long run — for dashboard/timing tests only.",
    category: "test",
    withHint: "seconds: 70 — capped at 7200 for safety.",
    defaultWith: { seconds: 70 },
  },
  // Evaluate
  {
    uses: "kyklos/semantic-similarity",
    title: "Semantic similarity",
    description: "Score outputs vs expected with embeddings or overlap.",
    category: "evaluate",
    withHint:
      'from: "stage.kyklos/step" — optional slice_field on dataset rows → slice_<name> scores for pass_if',
    defaultWith: {
      from: "test.kyklos/run-dataset",
      threshold: 0.7,
    },
  },
  {
    uses: "kyklos/exact-match",
    title: "Exact match",
    description: "String-equality checks on outputs.",
    category: "evaluate",
    withHint:
      "optional slice_field (dataset column) emits per-slice accuracy as slice_<slug> for gates",
  },
  {
    uses: "kyklos/llm-judge",
    title: "LLM judge",
    description: "Score outputs with an LLM rubric.",
    category: "evaluate",
    defaultWith: {
      from: "test.kyklos/run-dataset",
      rubric: "./rubric.md",
    },
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
  },
  {
    uses: "kyklos/safety-check",
    title: "Safety check",
    description: "Policy / safety validation on outputs.",
    category: "evaluate",
    defaultWith: { from: "test.kyklos/run-dataset" },
  },
  {
    uses: "kyklos/cost-check",
    title: "Cost check",
    description: "Fail if run cost exceeds a USD cap.",
    category: "evaluate",
    defaultWith: { from: "test.kyklos/run-dataset", max_usd: 0.1 },
  },
  {
    uses: "kyklos/latency-check",
    title: "Latency check",
    description: "Fail if p95 latency exceeds a threshold.",
    category: "evaluate",
    defaultWith: { from: "test.kyklos/run-dataset", p95_ms: 5000 },
  },
  {
    uses: "kyklos/regression",
    title: "Regression",
    description: "Compare metrics against a baseline.",
    category: "evaluate",
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
  },
  // Register
  {
    uses: "kyklos/tag",
    title: "Tag",
    description: "Tag the artifact (e.g. latest).",
    category: "register",
    defaultWith: { tag: "latest" },
  },
  {
    uses: "kyklos/push",
    title: "Push",
    description: "Push registered artifacts to a remote.",
    category: "register",
  },
  // Deploy
  {
    uses: "kyklos/deploy-endpoint",
    title: "Deploy endpoint",
    description: "Deploy or update an inference endpoint.",
    category: "deploy",
  },
  {
    uses: "kyklos/canary",
    title: "Canary",
    description: "Gradual traffic shift with health gates.",
    category: "deploy",
  },
  {
    uses: "kyklos/health-check",
    title: "Health check",
    description: "Probe a deployed endpoint after release.",
    category: "deploy",
  },
];

export function getStepMeta(uses: string): PredefinedStep | undefined {
  return PREDEFINED_STEPS.find((s) => s.uses === uses);
}
