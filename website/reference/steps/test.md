# Test steps

Test steps **drive the agent** against data or scripts and produce **JSONL-style outputs** that evaluate steps consume. They are the usual “upstream” of `from: test.<stage>/run-dataset` (or your step’s `name`).

---

## Run dataset {#step-run-dataset}

**`kyklos/run-dataset`**

Loads a **JSONL dataset** (one JSON object per line). For each row, invokes [`run_agent()`](/guides/pipelines/yaml-reference) using the pipeline `agent:` config and the workspace. Writes **outputs** (responses, usage, latency, errors) to a run artifact so later stages can score them.

| Option | Default | Description |
|--------|---------|-------------|
| `dataset` | _required_ | Path to JSONL relative to the workspace; each row should include at least `input` (and often `id`). |
| `runs` | `1` | Repeat each case this many times (e.g. flaky detection). |
| `concurrency` | `1` | Parallel worker threads for independent cases. |
| `timeout_per_run` | `60` | Wall-clock budget per case (seconds). |

**Scores:** total runs, failure counts; step may pass with a small allowed failure rate. Tune concurrency vs provider rate limits.

---

## Simulate conversation {#step-simulate-conversation}

**`kyklos/simulate-conversation`**

Runs **multi-turn** scenarios from a JSONL file: each scenario describes personas, goals, and success criteria; the step drives turns until success or `max_turns`. Uses the same agent configuration as other test steps.

| Option | Default | Description |
|--------|---------|-------------|
| `scenarios` | _required_ | JSONL path under the workspace. |
| `max_turns` | `8` | Upper bound on conversation length. |
| `runs` | `1` | Repetitions per scenario. |

**Scores:** goal completion rate, average turns.

---

## Check tool calls {#step-check-tool-calls}

**`kyklos/check-tool-calls`**

Compares **tool traces** from a previous step (usually run-dataset) against dataset expectations: which tool was selected, parameters, and order for multi-tool flows.

| Option | Default | Description |
|--------|---------|-------------|
| `dataset` | _required_ | JSONL with expected tool metadata aligned by case id. |
| `from` | `run-dataset` | Logical reference to the step that produced traces. |

**Scores:** `tool_selection_accuracy`, `param_accuracy`, `order_accuracy`.

---

## Wait {#step-wait}

**`kyklos/wait`**

Sleeps for a fixed duration to **soak-test** the dashboard, timeouts, or scheduling. Not for production agent validation.

| Option | Default | Description |
|--------|---------|-------------|
| `seconds` | `65` | Sleep duration (capped by the step for safety, e.g. 7200 max). |

**Scores:** minimal; use sparingly in demos only.
