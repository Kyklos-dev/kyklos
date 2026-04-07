# Kyklos User Guide

This guide is for **people who install Kyklos and run pipelines**: operators, ML engineers, and anyone defining `kyklos.yaml` workflows for AI agents.

---

## 1. What is Kyklos?

**Kyklos** is a self-hosted orchestrator for **testing and evaluating** AI agents. You describe work in a **`kyklos.yaml`** file: stages, steps, **score-based** gates (`pass_if`), and failure routing. It is **not** meant to replace general-purpose CI (e.g. GitHub Actions for build/deploy); it focuses on **eval runs**, **metrics**, and **artifacts** from agent workflows. The server executes Python **steps**, tracks **runs**, streams **logs**, and serves a **web dashboard** so you can create pipelines, trigger runs, and inspect results without using the command line for everything.

Typical uses:

- **Test and evaluate** an LLM agent (datasets, judges, safety checks, cost/latency limits).
- **Automate** build → test → evaluate → register flows on a schedule or from Git.
- **Record** reproducible **eval fingerprints** when you pin prompts, datasets, and models.

---

## 2. Features at a glance

| Area | What you can do |
|------|------------------|
| **Pipelines** | Define multi-**stage** workflows in YAML; each stage has **steps** (`uses: kyklos/...`). |
| **Agent config** | Set model, prompt, tools, temperature; run via **Anthropic**, **OpenAI**, **Gemini** / **Google**, or a **custom Python script** runner. |
| **Triggers** | **Manual**, **Git push** (with webhooks), or **cron** schedules (when repos are registered on the server). |
| **Run workspace** | Each run gets an isolated **directory**; optional **Git clone** from `repository:` in YAML, from server **repos**, or a **local path** via manual trigger `workspace_path` (skips git). |
| **Git workspaces (dashboard)** | Register a **remote + credentials** in the UI, **scan branches**, attach pipelines to a workspace, **load `kyklos.yaml` from a branch** into the editor, and **run on a chosen branch** — using the server’s git cache under `server.workspace_root`. |
| **Quality gates** | Per-stage **`pass_if`** conditions on step **scores** (e.g. similarity thresholds). |
| **Failure routing** | **`on_fail`**: abort, continue, **jump to another stage** (`goto`), or **retry** the stage with backoff. |
| **Eval bundles** | Optional **`eval_bundle`** pins prompt, dataset, rubric, schema, model — stored as a **fingerprint** on each run for traceability. |
| **Built-in steps** | Lint, snapshots, dataset runs, semantic similarity, LLM judge, safety/cost/latency checks, tagging, deploy helpers, and more (see `steps/` in the repo). |
| **Dashboard** | List/create/edit pipelines (including **from repository** vs freestyle), **Workspaces** page for Git remotes and branches, **trigger runs** (with branch selection when applicable), watch **live logs**, open **run detail** (stages, steps, metrics). |
| **API** | REST API under `/api/v1` for automation (no built-in auth; protect with a reverse proxy if needed). |
| **Notifications** | Pipeline **`notify`** config; server can forward to **Slack** when `SLACK_WEBHOOK` is set. |

---

## 3. What you need before installing

- **Go** (version compatible with the project’s `go.mod`).
- **Python 3** on your `PATH`, **or** a dedicated **virtual environment** (recommended) with the Kyklos SDK and step dependencies installed.
- **Node.js** (only if you **build** the web UI from source; prebuilt assets can be embedded via `make build-ui`).
- For provider examples: **Anthropic** (`ANTHROPIC_API_KEY`), **OpenAI** (`OPENAI_API_KEY`), or **Gemini** (`GOOGLE_API_KEY` and `pip install google-generativeai` in the step venv). Use a **`env:`** block in `kyklos.yaml` with values like `GOOGLE_API_KEY: $GOOGLE_API_KEY` so the **server process** substitutes from its environment when the pipeline is created or updated (keep keys out of git).

---

## 4. Installation overview

1. **Get the code** (clone or unpack the release).
2. **Create a Python venv** and install the SDK + deps (the project includes a `make setup` target — see [Getting started](getting-started.md)).
3. **Optional:** copy **`kyklos-server.yaml.example`** to **`kyklos-server.yaml`** and set `server.python_venv` to your venv path, `server.workspace_root`, `server.bind`, etc.
4. **Build the dashboard** once so the binary can embed the UI: `make build-ui` (or `make build` for the `kyklos` binary too).
5. **Run the server** from the repo root, e.g. `make run`, which sets `KYKLOS_STEPS_DIR` to the bundled **`steps/`** directory.

Detailed commands and flags (`-config`, `-db`) are in [Getting started](getting-started.md).

Default SQLite database location: **`~/.kyklos/kyklos.db`** unless you override it.

---

## 5. First run: open the dashboard

With default settings, the server listens on **http://127.0.0.1:8080** and **does not require login** for the API.

- Open the URL in a browser.
- You should see the **Pipelines** view.
- You can **create a pipeline** (paste YAML), **save**, **trigger a run**, and open **run details** to stream logs.

---

## 6. Pipeline file (`kyklos.yaml`)

A pipeline file is usually named **`kyklos.yaml`** (or stored as YAML in the server). Top-level sections:

| Section | Purpose |
|---------|---------|
| `version` | Schema version (e.g. `"1.0"`). |
| `name` | Human-readable pipeline name. |
| `agent` | Model, prompt path, optional **runner** (`anthropic`, `openai`, `gemini` / `google`, or `script`). |
| `triggers` | When to run: `manual`, `push`, `schedule` (with `cron`). |
| `pipeline` | Ordered **stages**; each stage has `steps`, optional `pass_if`, optional `on_fail`. |
| `repository` | Optional Git URL + branch + token env for cloning into the workspace. |
| `eval_bundle` | Optional pins for prompt/dataset/rubric/schema/model and an **id** label. |
| `notify` | Optional notification hints (see server + Slack integration). |
| `env` | Optional environment variables passed into the run context. |

**Example:** `examples/hello-world.yaml` walks through build → test → evaluate → register stages with real step names.

### 6.1 Stages and steps

- A **stage** is a named group of **steps** executed in order.
- Each **step** uses `uses: kyklos/<step-name>` (implemented under `steps/` as Python). Optional `name:` overrides the default step id for scores and `pass_if` keys.
- **`with:`** passes parameters (paths, thresholds, references to another step’s output via `from:`).

### 6.2 Pass/fail (`pass_if`)

After steps run, **`pass_if`** is a map of **metric keys** to **expressions** (e.g. `">= 0.70"`, `"== true"`). If conditions fail, the stage is treated as failed for **`on_fail`** handling.

### 6.3 When a stage fails (`on_fail`)

- **`then: abort`** — stop the run.
- **`then: continue`** — proceed to the next stage (use carefully).
- **`then: goto`** — jump to another stage by name; optional **`retry`** with `max_attempts` and `delay_seconds`.

There is a global cap on **`goto`** jumps per run (`max_goto` in YAML).

### 6.4 Built-in step families (overview)

Under `steps/` you will find categories such as:

- **Build:** lint, snapshot, diff  
- **Test:** run dataset, simulate conversation, wait, tool-call checks  
- **Evaluate:** semantic similarity, exact match, JSON schema, LLM judge, regression, safety, cost, latency  
- **Deploy / register:** health check, canary, deploy endpoint, tag, push  

Exact `uses:` names and parameters are defined by each module; **`examples/`** shows working combinations.

---

## 7. Triggers and Git

- **`manual`** — Trigger runs from the dashboard or API when you choose. The API accepts optional **`workspace_path`** on the trigger body to run against a **local directory** without cloning (useful for development).
- **`push`** — Requires registering **repos** in `kyklos-server.yaml` and configuring **webhook secrets** so Kyklos can validate GitHub/GitLab payloads.
- **`schedule`** — Use **`cron`** expressions under `triggers` for periodic runs.

**Repository checkout:** Either list repos in **`kyklos-server.yaml`** (`repos:`) or set **`repository:`** inside **`kyklos.yaml`** so the engine clones a specific URL for that pipeline.

### 7.1 Dashboard Git workspaces

The **Workspaces** page lets you define a **Git remote** (and token environment variable) shared with the server process. From there you can:

- **Scan branches** to refresh the branch list from the remote.
- **Attach pipelines** to a workspace so runs use that repo context.
- **Load `kyklos.yaml` from a branch** into the pipeline editor (same git cache as runs; if branches are empty, scan branches first).
- **Run on a selected branch** when triggering a manual run from the dashboard.

Clones and shallow fetches use the directory configured as **`server.workspace_root`** in `kyklos-server.yaml` (see [Configuration](configuration.md) for defaults and the home-directory fallback when `/var/kyklos` is not writable).

---

## 8. Eval bundles and reproducibility

If you set **`eval_bundle`**, Kyklos can hash the referenced files and model choices into an **`eval_bundle_fingerprint`** on each run. That helps you prove **which** prompt, dataset, and model version were used for a given result.

---

## 9. Notifications

Pipeline YAML may include a **`notify`** block. The server’s notification pipeline also supports a **`SLACK_WEBHOOK`** environment variable for Slack-style delivery (see server logs and `internal/notify` behavior in the repo). Tune **`on:`** in your pipeline to match success/failure/always semantics you need.

---

## 10. Security and access

Kyklos does **not** authenticate HTTP requests to the API or dashboard. For anything beyond a trusted network, run the server behind a **reverse proxy** (TLS, basic auth, OAuth, IP allowlists, etc.) or a private network.

Never commit Git or cloud provider credentials; use environment variables and a secrets manager.

---

## 11. Examples and next steps

- Browse **`examples/`** for full pipelines: hello-world, multi-stage mocks, long-running tests, retry/goto demos, metrics, etc.
- Run **`./scripts/smoke.sh`** against your server URL to verify health and API reachability.
- For **build commands**, database paths, and **Vite** dev workflow, see [Getting started](getting-started.md) and [Dashboard](dashboard.md).

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| **Run** | One execution of a pipeline, with status, logs, and stage results. |
| **Run workspace** | Filesystem directory for one run (clone, worktree, or local `workspace_path`). |
| **Git workspace (dashboard)** | Saved remote + credentials used to list branches, load YAML from a branch, and run against a branch. |
| **Step score** | Numeric or boolean outputs from a step, used in `pass_if`. |
| **Stage** | A group of steps plus optional gates and failure policy. |

Welcome to Kyklos — define your `kyklos.yaml`, trigger a run, and follow the logs in the dashboard.
