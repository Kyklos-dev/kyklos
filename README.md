# Kyklos

**CI/CD-style orchestration for AI agent pipelines:** define `kyklos.yaml` workflows with stages and Python steps, run them in isolated workspaces, stream logs, and operate everything from a web dashboard or REST API.

---

## Use a release (recommended)

**Most people should run Kyklos from a [GitHub Release](https://github.com/Kyklos-dev/kyklos/releases).** Those builds ship a single binary with the embedded dashboard already bundled—no need to compile anything.

### Linux / macOS (amd64 or arm64)

```bash
curl -fsSL https://raw.githubusercontent.com/Kyklos-dev/kyklos/main/scripts/install.sh | sh
```

Optional: `VERSION=v0.1.1` (default is latest), `PREFIX=$HOME/.local/bin`, or for a fork `REPO=your-org/kyklos` — see [`scripts/install.sh`](scripts/install.sh).

If **`raw.githubusercontent.com` returns 404**, the script is not on `main` yet or you are offline—clone the repo and run `sh scripts/install.sh` from the root, or download **`kyklos-linux-*.tar.gz`** manually from [Releases](https://github.com/Kyklos-dev/kyklos/releases).

### Windows

Download **`kyklos-windows-amd64.zip`** from the [latest release](https://github.com/Kyklos-dev/kyklos/releases/latest), extract `kyklos.exe`, and run it from a terminal.

### After install

Follow **[Getting started](docs/getting-started.md)** for environment variables (e.g. `KYKLOS_STEPS_DIR`), the default database path, and a smoke test. Broader product docs live on the **[live documentation site](https://kyklos-mroa2pbl8-kyklos-devs-projects.vercel.app/)** (same content as [`website/`](website/)).

---

## Documentation (live site)

| | |
|--|--|
| **Browse online** | **[Live documentation (Vercel)](https://kyklos-mroa2pbl8-kyklos-devs-projects.vercel.app/)** — concepts, guides, pipelines, configuration, dashboard & API. |
| **Repository** | **[github.com/Kyklos-dev/kyklos](https://github.com/Kyklos-dev/kyklos)** |
| **Docs site source** | [`website/`](website/) — `cd website && npm ci && npm run build`. Deploy on **Vercel** with root **`website/`** (see [`website/README.md`](website/README.md)). |

---

## Documentation in this repo

| Doc | Audience |
|-----|----------|
| **[VitePress docs site](website/)** | Same content as the live site; edit Markdown under `website/`. |
| **[User guide](docs/user-guide.md)** | Full narrative guide. |
| [Getting started](docs/getting-started.md) | Commands, database, smoke test **after you install a release** |
| [Configuration](docs/configuration.md) | Server YAML, SQLite |
| [Dashboard](docs/dashboard.md) | Web UI and local dev with Vite |

---

## Develop from source (contributors)

**If you want to contribute** — fix bugs, change the server or UI, or run unreleased code — **clone the repository** and build locally. This path is for working on Kyklos itself, not required for normal use.

```bash
git clone https://github.com/Kyklos-dev/kyklos.git
cd kyklos

# Optional: Python venv for pipeline steps (SDK + dependencies)
make setup

make build-ui
make run
```

Open **http://127.0.0.1:8080** — the API and UI have **no authentication** (use a reverse proxy if you need it).

```bash
# Production-style local binary
make build    # produces bin/kyklos
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [contributing docs](website/contributing/) for pull requests and development expectations.

---

## Publishing releases (maintainers)

1. Ensure `main` passes CI.
2. Create and push a version tag, e.g. `git tag v0.1.1 && git push origin v0.1.1`.
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
