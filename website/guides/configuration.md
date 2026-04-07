# Configuration

## Server (`kyklos-server.yaml`)

Optional file beside the binary (default name **`kyklos-server.yaml`**, override with **`-config`**). Typical reasons to use it:

| Concern | What you set |
|---------|----------------|
| **Listen address** | `server.bind` — default loopback; use `0.0.0.0` only with a plan for access control |
| **Git & workspace disk** | `server.workspace_root` — root for **per-run worktrees**, **inline** clones for pipeline `repository:`, and the **same git cache** the dashboard uses when **loading a file from a branch** |
| **Python for steps** | `server.python_venv` — venv whose `python` executes steps |
| **Git remotes** | `repos:` — register clone URLs + webhook secrets for **push** triggers |

### `server.workspace_root` and artifacts

- If **`workspace_root` is omitted** from `kyklos-server.yaml`, the built-in default is **`/var/kyklos/workspaces`**. On startup Kyklos tries to create it; if that fails (for example **permission denied** when running as a normal user), it **falls back** to **`~/.kyklos/workspaces`** and logs a warning.
- The **artifact store** (files steps persist for API download) normally lives at **`{workspace_root}/artifact_store`**. If that path cannot be created, Kyklos uses **`~/.kyklos/artifact_store`** instead and logs a warning.

Set `workspace_root` explicitly in production to a path your service user owns (for example under `/var/kyklos` after creating directories with correct permissions).

**Important:** Kyklos does **not** authenticate the HTTP API or dashboard. Treat **TLS + proxy auth** or **network isolation** as required for non-local deployments.

## Pipeline (`kyklos.yaml`)

Lives in your **agent repo** or is pasted in the UI — defines **agent**, **triggers**, **stages**, optional **`repository:`** for clone, and **`eval_bundle`** for fingerprints.

## Data & SQLite

- Default DB path: **`~/.kyklos/kyklos.db`**
- Override: **`-db`** or **`DATABASE_URL`** (filesystem path to the SQLite file)

## Notifications

Pipeline **`notify`** plus server-side hooks (e.g. **`SLACK_WEBHOOK`**) can surface run outcomes to chat — see the repo for current behavior.
