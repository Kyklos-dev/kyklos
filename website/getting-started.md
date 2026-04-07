# Use a release

These docs assume you run a **published binary** from [GitHub Releases](https://github.com/kyklos/kyklos/releases). You need the **`kyklos`** executable plus a **`steps/`** tree (built-in steps from the same release tag in the repo, or your own).

## 1. Download

Pick the archive for your OS/arch (`kyklos-linux-amd64.tar.gz`, `kyklos-darwin-arm64.tar.gz`, etc.), or use the install script on Linux/macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/kyklos/kyklos/main/scripts/install.sh | sh
```

Optional: `PREFIX=$HOME/.local/bin`, `VERSION=v0.x.y`, `REPO=owner/repo` if you use a fork.

Windows: download **`kyklos-windows-amd64.zip`**, extract `kyklos.exe`.

## 2. Steps directory

Pipeline steps are Python files resolved from `uses: kyklos/...`. Point **`KYKLOS_STEPS_DIR`** at a checkout of the repo’s **`steps/`** folder **at the same tag** as your binary (or maintain your own compatible tree).

```bash
export KYKLOS_STEPS_DIR=/path/to/kyklos/steps
```

## 3. Run

```bash
./kyklos
```

Open **http://127.0.0.1:8080** (default). API and UI share the same origin (`/api/v1/...`).

Optional: copy **`kyklos-server.yaml.example`** from the repo to **`kyklos-server.yaml`** next to the binary to set bind address, **`workspace_root`**, Python venv, or registered Git repos.

If Git-backed features fail with **`mkdir /var/kyklos: permission denied`**, set **`server.workspace_root`** to a directory you can write (the example uses `/tmp/kyklos-workspaces`), or rely on the automatic fallback to **`~/.kyklos/workspaces`** — see [Configuration](/guides/configuration).

## 4. Smoke check

```bash
curl -s http://127.0.0.1:8080/health
```

Default database: **`~/.kyklos/kyklos.db`** — override with `-db` or `DATABASE_URL`.

---

**Developing or changing Kyklos itself** (clone, build UI, `make run`) lives under [Contributing](/contributing/) — not required to use a release.
