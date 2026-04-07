# Kyklos

**CI/CD-style orchestration for AI agent pipelines:** define `kyklos.yaml` workflows with stages and Python steps, run them in isolated workspaces, stream logs, and operate everything from a web dashboard or REST API.

---

## Documentation (live site)

| | |
|--|--|
| **Browse online** | **[Live documentation (Vercel)](https://kyklos-mroa2pbl8-kyklos-devs-projects.vercel.app/)** — product docs: concepts, guides, pipelines, configuration, dashboard & API. |
| **Repository** | **[github.com/Kyklos-dev/kyklos](https://github.com/Kyklos-dev/kyklos)** |
| **Build / deploy** | Source: [`website/`](website/) — `cd website && npm ci && npm run build`. Host on **Vercel** with root **`website/`** (see [`website/README.md`](website/README.md)). |

---

## Documentation for users

| Doc | Audience |
|-----|----------|
| **[VitePress docs site](website/)** | Same content as the live site above; edit Markdown under `website/`, build locally, or deploy to Vercel. |
| **[User guide](docs/user-guide.md)** | Full narrative guide in-repo (Markdown). |
| [Getting started](docs/getting-started.md) | Commands, build, database, smoke test |
| [Configuration](docs/configuration.md) | Server YAML, SQLite |
| [Dashboard](docs/dashboard.md) | Web UI and local dev with Vite |

---

## Quick start

```bash
# Optional: Python venv for steps (SDK + dependencies)
make setup

# Build the embedded UI, then run (or: make run if web/dist already exists)
make build-ui
make run
```

Open **http://127.0.0.1:8080** — the API and UI have **no authentication** (use a reverse proxy if you need it).

```bash
# Production binary
make build    # produces bin/kyklos
```

---

## Install from GitHub Releases

After [releases](https://github.com/kyklos/kyklos/releases) are published (see **Publishing** below), you can install a prebuilt binary on **Linux** or **macOS** (amd64/arm64):

```bash
# Replace OWNER/REPO if you use a fork (default: kyklos/kyklos)
curl -fsSL https://raw.githubusercontent.com/kyklos/kyklos/main/scripts/install.sh | sh
```

Optional: `VERSION=v0.1.0` or `PREFIX=$HOME/.local/bin` — see `scripts/install.sh`.

Windows: download `kyklos-windows-amd64.zip` from the release, extract `kyklos.exe`, and run it from a terminal.

---

## Publishing (maintainers)

1. Ensure `main` (or your default branch) passes CI.
2. Create and push a version tag, e.g. `git tag v0.1.0 && git push origin v0.1.0`.
3. The **Release** workflow builds the dashboard, cross-compiles `kyklos`, uploads `kyklos-<os>-<arch>.tar.gz` / `.zip` plus `checksums-sha256.txt`, and creates a GitHub Release with notes.

First-time setup: enable **Actions** on the repository and allow **Read and write** for `GITHUB_TOKEN` on workflow releases (default for `softprops/action-gh-release`).

---

## Repository layout

| Path | Purpose |
|------|---------|
| `cmd/kyklos` | HTTP server, scheduler, engine |
| `dashboard/` | React web UI |
| `web/` | Embedded static assets (`web/dist`) |
| `steps/` | Built-in Python steps (`kyklos/...` in YAML) |
| `sdk/python/` | Kyklos Python SDK |
| `examples/` | Sample `kyklos.yaml` pipelines |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reporting: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).
