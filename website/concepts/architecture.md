# Architecture

Kyklos is delivered as a **single server process** that combines four responsibilities end users care about:

## 1. Control plane (HTTP)

- Serves the **embedded dashboard** (static SPA + client-side routing).
- Exposes a **versioned REST API** (`/api/v1`) for pipelines, runs, artifacts, and catalog data.
- Exposes **`/health`** for readiness/liveness.

## 2. Scheduler

- Loads **pipeline definitions** from storage.
- Honors **triggers**: manual, **Git webhooks** (when configured), and **cron** schedules.

## 3. Execution engine

- Prepares a **workspace** (temporary directory, optionally populated from Git).
- Resolves each **`uses:`** step to a **Python** entrypoint.
- Streams **stdout/stderr** to logs and collects **structured results** (scores, pass/fail, artifact paths).
- Applies **stage gates** and **on_fail** policies.

## 4. Persistence

- **SQLite** stores pipelines, runs, logs, and artifact **metadata** by default.
- **Artifact blobs** live on disk under a configurable **artifact root** (see server startup logs).

## Why a single binary?

Operators get **one artifact** to deploy, one version line, and **no separate static host** for the UI — the dashboard is **embedded** at build time.

For source layout (`cmd/kyklos`, `internal/engine`, `dashboard/`), see the GitHub repository.
