# Contributing

We welcome issues and pull requests on **[GitHub](https://github.com/Kyklos-dev/kyklos)**. For license and PR expectations, see the repo **[CONTRIBUTING.md](https://github.com/Kyklos-dev/kyklos/blob/main/CONTRIBUTING.md)** and **[SECURITY.md](https://github.com/Kyklos-dev/kyklos/blob/main/SECURITY.md)**.

## Run Kyklos locally (from source)

Use this when you are **changing the server, engine, dashboard, or steps** — not when you only want to run a release (see [Use a release](/getting-started)).

### Prerequisites

- **Go** (version in `go.mod`)
- **Node.js** + **npm** — to build the embedded dashboard
- **Python 3** — for executing pipeline steps (venv recommended)

### Clone and bootstrap

```bash
git clone https://github.com/Kyklos-dev/kyklos.git
cd kyklos
make setup          # optional: Python venv + SDK (see repo Makefile)
```

### Build UI + run server

```bash
make build-ui       # dashboard → web/dist (required before go build / go run)
make run            # go run; sets KYKLOS_STEPS_DIR=./steps
```

Open **http://127.0.0.1:8080**.

### Full binary build

```bash
make build          # build-ui + go build → bin/kyklos
KYKLOS_STEPS_DIR="$(pwd)/steps" ./bin/kyklos
```

### Tests

```bash
go test ./...
cd dashboard && npm ci && npm run build
```

### Dashboard dev (Vite)

```bash
cd dashboard && npm install && npm run dev
```

Run the Go server separately (`make run`). Vite proxies API routes — see repo **`docs/dashboard.md`**.

---

This documentation site is built from **`website/`** (`npm run dev` / `npm run build`). Changes to product docs should be edited here; the repo **`docs/`** folder may duplicate content for GitHub-only readers.
