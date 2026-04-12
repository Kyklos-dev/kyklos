# Evaluate steps

Evaluate steps **score or validate** outputs produced by upstream steps (typically `run-dataset`). They read JSONL rows keyed by `_case_id` / `id`, join to an optional **dataset** file for gold labels, and emit **scores** you can gate on with `pass_if`. Many steps support **slice** metrics (subgroup averages) when you set `slice_field` to a dataset column.

---

## Semantic similarity {#step-semantic-similarity}

**`kyklos/semantic-similarity`**

Compares each agent **response** to the dataset field `expected_output_contains` using **embedding cosine similarity** (DeepEval’s OpenAI embedding model + `deepeval.utils.cosine_similarity`) when possible. If embeddings are unavailable (`method: auto` and no API key, or failures), it falls back to a deterministic **token-overlap** similarity.

| Option | Default | Description |
|--------|---------|-------------|
| `from` | `run-dataset` | Upstream step reference. |
| `dataset` | _required_ | JSONL with `expected_output_contains` per case id. |
| `threshold` | `0.85` | Minimum similarity to count as pass for pass-rate. |
| `method` | `auto` | `auto` \| `embedding` \| `token`. |
| `embedding_model` | `text-embedding-3-small` | OpenAI embedding model name when using embeddings. |
| `slice_field` | _optional_ | Dataset column; emits `slice_<slug>` scores for gates. |

**Environment:** `OPENAI_API_KEY` for the embedding path.

---

## Exact match {#step-exact-match}

**`kyklos/exact-match`**

Case-insensitive string equality on a configurable field (e.g. structured `intent`) between dataset `expected_<field>` and the output row.

| Option | Default | Description |
|--------|---------|-------------|
| `from` | `run-dataset` | Upstream outputs. |
| `dataset` | _required_ | JSONL with `expected_<field>`. |
| `field` | `intent` | Field name on output and `expected_<field>` in dataset. |
| `slice_field` | _optional_ | Per-slice accuracy keys. |

---

## LLM judge {#step-llm-judge}

**`kyklos/llm-judge`**

Uses **DeepEval G-Eval** with **LiteLLM** to score each response against a **rubric** (markdown file or built-in default). Provider-agnostic: set `model` as `provider/model` (e.g. `openai/gpt-4o-mini`, `anthropic/claude-3-5-sonnet-20241022`). Bare legacy ids are normalized (e.g. `claude-…` → `anthropic/…`).

| Option | Default | Description |
|--------|---------|-------------|
| `from` | `run-dataset` | Upstream JSONL. |
| `rubric` | _optional_ | Path to rubric file under workspace. |
| `model` | `openai/gpt-4o-mini` | LiteLLM model id. |
| `threshold` | `0.7` | G-Eval threshold; drives average pass and `pass_rate`. |
| `base_url` | _optional_ | Custom API base for LiteLLM. |
| `temperature` | _optional_ | Judge sampling temperature. |

**Artifacts:** `judgements.jsonl` with per-case scores and reasons.  
**Environment:** provider API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.).

---

## HTTP judge {#step-http-judge}

**`kyklos/http-judge`**

Sends **all** upstream outputs in one POST to **your** HTTP service. The service returns JSON with a numeric **score** (configurable key). Use for custom judges, batch APIs, or internal scoring services.

| Option | Default | Description |
|--------|---------|-------------|
| `url` | _required_ | Endpoint URL. |
| `from` | `run-dataset` | Upstream step. |
| `method` | `POST` | HTTP method. |
| `timeout_seconds` | `120` | Request timeout. |
| `score_key` | `score` | JSON key for the float score. |
| `pass_threshold` | `0.7` | Step pass if score ≥ this. |
| `headers` | _optional_ | Extra headers (e.g. auth). |

---

## Safety check {#step-safety-check}

**`kyklos/safety-check`**

Regex-based scans for **harmful patterns**, **PII-like** strings, and **prompt-injection** phrases in outputs (and user input for injection checks).

| Option | Default | Description |
|--------|---------|-------------|
| `from` | `run-dataset` | Upstream outputs. |
| `checks` | `harmful_content`, `pii`, `prompt_injection` | Subset to enable. |

**Scores:** `violation_rate`; pass when zero violations.

---

## Cost check {#step-cost-check}

**`kyklos/cost-check`**

Aggregates **USD cost** from token usage on each output row (using built-in pricing tables) and fails if the **average cost per run** exceeds `max_usd`.

| Option | Default | Description |
|--------|---------|-------------|
| `from` | `run-dataset` | Upstream outputs with `usage` / `model`. |
| `max_usd` | `0.05` | Average cost cap per row. |

---

## Latency check {#step-latency-check}

**`kyklos/latency-check`**

Computes **p50 / p95 / p99** latency from `latency_ms` on upstream rows (errors skipped) and fails if **p95** exceeds the limit.

| Option | Default | Description |
|--------|---------|-------------|
| `from` | `run-dataset` | Upstream outputs. |
| `max_p95_ms` | `5000` | Maximum allowed p95 in milliseconds. |

---

## Regression {#step-regression}

**`kyklos/regression`**

Loads **baseline scores** from the artifact store and compares **current** scores from previous steps in this run. Uses a small **DSL** per metric: `drops > 0.03`, `increases > 0.20`, or absolute `>= 0.8`.

| Option | Default | Description |
|--------|---------|-------------|
| `fail_if` | _optional_ | Map of `step-name.score-name` → rule string. |

First run may have no baseline; the step often passes with a warning.

---

## JSON schema {#step-json-schema}

**`kyklos/json-schema`**

Validates each upstream row (or a JSON sub-object) against a **JSON Schema** file. Requires the `jsonschema` Python package.

| Option | Default | Description |
|--------|---------|-------------|
| `from` | `run-dataset` | Upstream outputs. |
| `schema` | _required_ | Path to JSON Schema under workspace. |
| `field` | _optional_ | If set, validate only this key (or parse string as JSON). |

**Scores:** `valid_ratio`; pass when all checked rows validate.
