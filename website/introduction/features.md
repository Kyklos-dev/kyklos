# Features

## Workflow & quality

- **Multi-stage pipelines** — order work (e.g. build → test → evaluate → register).
- **`pass_if` gates** — expressions over **named scores** from steps (not only process exit codes).
- **`on_fail` routing** — abort, continue, **goto** a named stage, or **retry** with backoff (within global limits).
- **Built-in step library** — lint, dataset runs, semantic / LLM judges, safety, cost & latency checks, deploy helpers — see the repo `steps/` tree for `uses:` names.

## Agent execution

- **Agent block** in YAML — model, prompts, tools; runners include **Anthropic**, **OpenAI**, **Gemini / Google** (`GOOGLE_API_KEY`), or a **custom Python script** for full control.
- **Run workspace** — each run gets its own directory; optional **Git clone** from pipeline **`repository:`** or server **`repos:`**, or a **local path** on manual triggers via API **`workspace_path`**.
- **Git workspaces (dashboard)** — save remotes in the UI, **scan branches**, **load YAML from a branch**, and **run on a branch** using the server’s git cache (see [Configuration](/guides/configuration) for `workspace_root` and disk fallbacks).

## Triggers & automation

- **Manual** — dashboard or API.
- **Git push** — with registered remotes and webhook configuration on the server.
- **Schedule** — **cron**-based triggers where supported by your deployment.

## Observability & comparison

- **Live logs** streamed to storage and the UI.
- **Run explorer** — filter and open any run.
- **Compare runs** — diff scores and metadata across two runs.
- **Artifacts** — step-emitted files persisted and listed (global **Artifacts** view + per-run).

## Eval traceability

- **`eval_bundle`** — optional pinning of prompt/dataset/rubric/schema/model with a stored **fingerprint** per run for auditability.

## Operations

- **Self-hosted** — single **Go** binary with **embedded** web UI; **SQLite** by default.
- **REST API** under `/api/v1` for automation.

**Security:** HTTP API and dashboard are **not authenticated** by default — use a **reverse proxy** or private network for anything beyond local use.
