# Dashboard

The web UI is a React SPA located in `dashboard/`. It is **embedded** in the `kyklos` binary via `go:embed` (`web/dist`).

## Production (embedded)

After `make build-ui` or `make build`, open the server URL (e.g. **http://127.0.0.1:8080**). The UI is served from the same origin as the API (`/api/v1/...`). No login or API token is required.

## Local development (Vite)

```bash
cd dashboard
npm install
npm run dev
```

Vite proxies `/api`, `/webhooks`, and `/health` to the Go server (default **http://localhost:8080** in `vite.config.ts`). Start Kyklos separately (`make run`).

## Build

```bash
cd dashboard && npm run build
```

Output goes to `dashboard/dist`; `make build-ui` copies it to `web/dist` for embedding.
