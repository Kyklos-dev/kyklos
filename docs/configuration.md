# Configuration

## Server config file

Copy the example and edit:

```bash
cp kyklos-server.yaml.example kyklos-server.yaml
```

Kyklos reads **`kyklos-server.yaml`** from the working directory by default (override with `-config`).

All keys under `server:` are optional; defaults match the example file.

| Field | Purpose |
|-------|---------|
| `server.bind` | Listen address (default `127.0.0.1:8080`; use `0.0.0.0:8080` to listen on all interfaces) |
| `server.workspace_root` | Root directory for **git checkouts**: per-run worktrees, **inline clones** for `repository:` in pipeline YAML, and the **same cache** the dashboard uses when loading a file from a branch (see below) |
| `server.python_venv` | Path to a venv whose `bin/python` runs steps |
| `repos` | Registered Git repos for webhooks and scheduled runs (see example comments) |

### Workspace and artifact directories

- **`server.workspace_root`**
  - If **omitted** in `kyklos-server.yaml`, the effective default is **`/var/kyklos/workspaces`** (see `internal/config`).
  - On startup, Kyklos tries to create that directory. If creation fails (for example **permission denied** on `/var/kyklos` when running as a normal user), it **falls back** to **`~/.kyklos/workspaces`**, logs a warning, and continues. Set `workspace_root` explicitly if you want a fixed path (for example under `/var/kyklos` in production, with permissions prepared in advance).
- **Artifact store** (run outputs downloadable from the API) normally lives at **`{workspace_root}/artifact_store`**. If that path cannot be created, Kyklos uses **`~/.kyklos/artifact_store`** instead and logs a warning.

The REST API and dashboard are **not** authenticated by Kyklos. Run behind a reverse proxy or VPN if you need access control. For **Git clone** credentials, use `repository.token_env` in pipeline YAML or `repos[].auth` in this file — that is separate from HTTP API access.

## SQLite

- Default path: `~/.kyklos/kyklos.db` unless `-db` or `DATABASE_URL` is set.
- `DATABASE_URL` should be a filesystem path to the SQLite file (same as `-db`).

## Health check

`GET /health` returns JSON with status and version — useful for load balancers and probes.
