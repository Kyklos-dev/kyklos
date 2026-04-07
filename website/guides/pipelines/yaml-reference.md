# Pipeline YAML reference

You use this page as a **lookup table** for every supported key in **`kyklos.yaml`**. For **how the pieces fit together**, read **[Understanding Kyklos](../understanding-kyklos)** and **[Pipeline YAML structure](../pipeline-yaml-structure)** first—this page is the **field reference**, not the narrative tour.

**Scope:** field names, types, and intent. **Runtime behavior** of individual steps (exact score keys) lives with each step under `steps/` in the repository.

---

## Top-level keys

| Key | Required | Purpose |
|-----|----------|---------|
| `version` | Yes | Schema / file format version (e.g. `"1.0"`). |
| `name` | Yes | Human-readable pipeline name; shown in UI and logs. |
| `agent` | Yes* | Default **model**, **prompt**, **runner** for steps that invoke the agent. *Some minimal tests may override per step.* |
| `triggers` | Yes | When runs start: `manual`, `push`, `schedule`. |
| `pipeline` | Yes | Ordered list of **stages** — the body of the workflow. |
| `repository` | No | Git **URL** + **branch** + optional **token** env for cloning into the run workspace. |
| `eval_bundle` | No | Files + model hints hashed into **`eval_bundle_fingerprint`** per run. |
| `notify` | No | Hints for notifications (e.g. Slack) on outcomes. |
| `env` | No | Extra **environment variables** injected into the run context for steps. |
| `max_goto` | No | Cap on **`on_fail` → `goto`** hops per run (default **10** in engine). |

---

## `agent`

Defines the **default** agent under test. Steps can still override behavior via `with:`.

| Field | Purpose |
|-------|---------|
| `model` | Model id (provider-specific string). |
| `prompt` | Path to system / instruction file **relative to workspace** (or absolute). |
| `temperature`, `max_tokens` | Passed through to API runners when supported. |
| `tools` | Optional tool list for runners that support tools. |
| `runner` | How to invoke the model — see below. |

### `runner`

| `type` | Meaning |
|--------|---------|
| `anthropic` | Anthropic Messages API (default if omitted). |
| `openai` | OpenAI Chat Completions (`OPENAI_API_KEY`). |
| `gemini` / `google` | Google Generative AI (`GOOGLE_API_KEY`). |
| `script` | Local Python **script** path (`runner.script`) — advanced custom control. |

---

## `triggers`

List of trigger objects. **Multiple** entries are allowed (e.g. manual + push + schedule).

| `on` | Fields | Behavior |
|------|--------|----------|
| `manual` | — | Runs only when started from UI/API. |
| `push` | `branch` (optional, default `main`), `paths` (optional) | Fires when a configured **webhook** matches repo + branch. |
| `schedule` | `cron` | Periodic runs using a **cron** expression. |

---

## `repository`

When set, the engine **clones** this remote into the run **workspace** before steps run.

| Field | Purpose |
|-------|---------|
| `url` | HTTPS or SSH URL (HTTPS + token env is common for CI). |
| `branch` | Default branch when the trigger doesn’t pin a ref (e.g. `main`). |
| `token_env` | Name of env var holding a **Git HTTPS** token (`GITHUB_TOKEN`, etc.). |

---

## `eval_bundle`

Optional. Used for **traceability**: content is resolved and hashed into **`eval_bundle_fingerprint`** on the run record.

| Field | Purpose |
|-------|---------|
| `id` | Human label (e.g. `prod-2026q1`). |
| `prompt`, `dataset`, `rubric`, `schema` | Paths relative to workspace (or absolute). |
| `model` | If set, can override `agent.model` **for fingerprinting** only. |

Empty `eval_bundle` still allows runs; omit the block entirely if you don’t need fingerprints.

---

## `pipeline` (stages)

`pipeline` is a **YAML list** of **stage** objects:

| Field | Purpose |
|-------|---------|
| `name` | Unique stage id (string). Used by **`goto`** and logging. |
| `steps` | Ordered list of **step** objects. |
| `pass_if` | Map of **metric key → expression**; all must pass for the stage to succeed logically. |
| `on_fail` | What to do if the stage fails or `pass_if` fails — see [Stages, gates & failure](./stages-gates-and-failure). |

---

## Step object

| Field | Purpose |
|-------|---------|
| `uses` | Step id: **`kyklos/<path>`** mapping to Python under `KYKLOS_STEPS_DIR` (e.g. `kyklos/run-dataset`). |
| `name` | **Logical name** for scores and `pass_if` keys. If omitted, derived from `uses`. |
| `with` | Arbitrary **parameters** for that step (paths, thresholds, `from:` references). |
| `timeout_seconds` | Hard cap for that step’s subprocess (optional). |

---

## `notify`

Pipeline-level notification hints (exact channels depend on server config).

| Field | Purpose |
|-------|---------|
| `on` | List of events: e.g. `passed`, `failed`, `always`. |
| `slack` | Webhook URL or env-backed reference. |
| `email` | Optional email channel. |

---

## `env`

Map of **string → string**: extra environment variables for the **run context** (visible to steps and agent resolution).

Values may reference the **server process** environment: if a value looks like **`$VAR_NAME`**, Kyklos replaces it with `os.Getenv("VAR_NAME")` when the pipeline YAML is **parsed** (create/update). Use that pattern for secrets (e.g. `GOOGLE_API_KEY: $GOOGLE_API_KEY`) so you do not commit keys — ensure the variable is set in the environment that runs **`kyklos`**. For **Gemini**, install **`google-generativeai`** in the step venv and set **`GOOGLE_API_KEY`**.

---

## Validation & errors

Invalid YAML or unknown fields may fail at **load** time. Stage/step failures at **runtime** produce **failed runs** with logs — distinguish “won’t parse” from “gate failed”.

For the authoritative schema, see **`internal/config/schema.go`** in the repository.
