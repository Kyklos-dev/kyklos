# Use a release

These docs assume you run a **published binary** from [GitHub Releases](https://github.com/Kyklos-dev/kyklos/releases). You need the **`kyklos`** executable plus a **`steps/`** tree (built-in steps from the same release tag in the repo, or your own).

Recent packaging and doc changes are summarized on the **[Changelog](/changelog)** page.

## 1. Download

Pick the archive for your OS/arch (`kyklos-linux-amd64.tar.gz`, `kyklos-darwin-arm64.tar.gz`, etc.), or use the install script on Linux/macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/Kyklos-dev/kyklos/main/scripts/install.sh | sh
```

Optional:

- **`PREFIX=$HOME/.local/bin`** — install without `sudo` (then add that directory to **`PATH`**).
- **`VERSION=v0.1.1`** — pin a specific tag (default is **latest** release).
- **`REPO=owner/kyklos`** — if you use a fork.

If the `curl` to `raw.githubusercontent.com` fails (**404**), clone the repo and run **`sh scripts/install.sh`** from the root, or download **`kyklos-linux-*.tar.gz`** from Releases and extract **`kyklos`** manually.

Windows: download **`kyklos-windows-amd64.zip`**, extract `kyklos.exe`.

### After install

```bash
export PATH="$HOME/.local/bin:$PATH"   # if you used PREFIX under your home
kyklos -h
```

## 2. Steps directory

Pipeline steps are Python files resolved from `uses: kyklos/...`. Point **`KYKLOS_STEPS_DIR`** at a checkout of the repo’s **`steps/`** folder **at the same tag** as your binary (or maintain your own compatible tree).

```bash
git clone --depth 1 --branch v0.1.1 https://github.com/Kyklos-dev/kyklos.git ~/kyklos-src
export KYKLOS_STEPS_DIR="$HOME/kyklos-src/steps"
```

## 3. Run

```bash
kyklos
```

If the binary is not on `PATH`, invoke it with the full path (for example **`~/.local/bin/kyklos`**).

Open **http://127.0.0.1:8080** (default). API and UI share the same origin (`/api/v1/...`).

Optional: copy **`kyklos-server.yaml.example`** from the repo to **`kyklos-server.yaml`** next to the binary (or your working directory) to set bind address, **`workspace_root`**, Python venv, or registered Git repos.

If Git-backed features fail with **`mkdir /var/kyklos: permission denied`**, set **`server.workspace_root`** to a directory you can write (the example uses `/tmp/kyklos-workspaces`), or rely on the automatic fallback to **`~/.kyklos/workspaces`** — see [Configuration](/guides/configuration).

## 4. Smoke check

```bash
curl -s http://127.0.0.1:8080/health
```

Default database: **`~/.kyklos/kyklos.db`** — override with `-db` or `DATABASE_URL`.

**Upgrading the binary** (new release install) does **not** delete this file. The dashboard will still show **pipelines and workspaces** you created earlier until you remove or point away from that database — see [FAQ](/faq#why-do-i-still-see-old-pipelines-after-installing-or-upgrading).

---

**Developing or changing Kyklos itself** (clone, build UI, `make run`) lives under [Contributing](/contributing/) — not required to use a release.
