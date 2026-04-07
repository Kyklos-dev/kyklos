# Getting started

New to Kyklos? Read the **[User guide](user-guide.md)** for features and how pipelines work — this page is the **hands-on install and run** checklist.

## Prerequisites

- **Go** (see `go.mod` for the toolchain version)
- **Node.js** and **npm** (for building the dashboard)
- **Python 3** on `PATH`, or a venv configured in `kyklos-server.yaml` (`server.python_venv`)

To run a **prebuilt binary** instead of building from source, see **Install from GitHub Releases** in the repository [README](../README.md).

## Run the server

From the repository root:

```bash
make run
```

This sets `KYKLOS_STEPS_DIR` to `./steps` and runs `go run ./cmd/kyklos`.

If `kyklos-server.yaml` is missing, defaults apply (see `kyklos-server.yaml.example`). The HTTP server listens on **127.0.0.1:8080** by default.

If you see **`mkdir /var/kyklos: permission denied`** (or similar) on first use of Git-backed features, either set **`server.workspace_root`** in `kyklos-server.yaml` to a directory you own or rely on the automatic fallback to **`~/.kyklos/workspaces`** (the server logs a warning when it switches). See [Configuration](configuration.md).

### Command-line flags

| Flag | Meaning |
|------|---------|
| `-config` | Path to `kyklos-server.yaml` (default: `kyklos-server.yaml`) |
| `-db` | SQLite file path (overrides `DATABASE_URL`) |

### Database location

If neither `-db` nor `DATABASE_URL` is set, SQLite is stored under:

`~/.kyklos/kyklos.db` (on Unix; the directory is created if needed).

## Build the dashboard (embedded UI)

The Go binary serves the prebuilt SPA from `web/dist` (embedded at compile time). After editing `dashboard/`:

```bash
make build-ui
```

Or full release:

```bash
make build   # build-ui + go build -o bin/kyklos ./cmd/kyklos
```

Run `bin/kyklos` with the same env and config as `go run`.

## Python environment for steps

Many steps expect the SDK and dependencies in a venv:

```bash
make setup
```

Then copy `kyklos-server.yaml.example` to `kyklos-server.yaml` and set `server.python_venv` to the path printed by `make setup` (typically `~/.kyklos/venv`).

## Smoke test

With a server running:

```bash
./scripts/smoke.sh http://127.0.0.1:8080
```

## Next steps

- [Configuration](configuration.md) — bind address, repos, SQLite
- [Dashboard](dashboard.md) — local dev with Vite
- Browse `examples/` for pipeline YAML samples
