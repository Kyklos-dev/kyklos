# Runs & workspaces

## Run (the unit of “did we ship quality?”)

A **run** is one end-to-end execution of a **pipeline**. It has:

- **Identity** — unique id, pipeline id, trigger type (manual, push, schedule, …).
- **Git context** — branch and SHA when the workspace comes from a clone.
- **Status** — pending → running → terminal (passed / failed / cancelled).
- **Stage results** — per-step **scores**, pass/fail, optional **metadata** and **artifacts**.
- **Eval fingerprint** — when `eval_bundle` is used, a stable hash of the eval inputs.

Runs are what you **compare**, **audit**, and **gate releases** on.

## Run workspace (directory)

Each run gets an isolated **workspace directory**. Steps read and write paths **relative to that root** unless you pass absolute paths.

If the pipeline declares **`repository:`** (or the server provides a registered repo), the engine **clones** that ref into the workspace so steps execute against **real code** for that commit. A **manual** API trigger can set **`workspace_path`** to skip cloning and use a local checkout.

## Git workspaces (dashboard)

**Workspaces** in the web UI are a **saved Git remote** (plus credentials) used to list branches, **attach pipelines**, **load `kyklos.yaml` from a branch**, and **run on a branch**. Server-side clones and fetches live under **`server.workspace_root`** (with an automatic fallback to **`~/.kyklos/workspaces`** if the default path is not writable — see [Configuration](/guides/configuration)).

Do not confuse this with the **per-run directory** above: the dashboard workspace is **configuration + git cache**; each run still materializes its own working tree or uses your chosen path.

## Scores & gates

Steps return **named scores** (numbers or booleans). Stages declare **`pass_if`** — logical conditions on those names. That lets you express **quality policy** (“similarity ≥ 0.9”, “safety.passed == true”) in one place.

## Artifacts

Steps can declare output **file paths**; Kyklos may **persist** them to durable storage and attach **metadata** so the UI can download files and show a **global artifact library** across runs.
