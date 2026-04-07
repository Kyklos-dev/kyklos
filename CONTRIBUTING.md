# Contributing

Thanks for helping improve Kyklos.

## Development

From the repository root:

```bash
make setup          # optional: Python venv for steps
make build-ui       # dashboard → web/dist (required before go build)
make run            # or: go run ./cmd/kyklos with KYKLOS_STEPS_DIR=./steps
```

Run tests:

```bash
go test ./...
cd dashboard && npm ci && npm run build
```

## Pull requests

- Keep changes focused and described in the PR text.
- Ensure `go test ./...` passes and the dashboard still builds (`npm run build` in `dashboard/`).
- For UI changes, confirm `make build` (or CI’s release-build job) succeeds so `web/dist` embed stays valid.

## Licensing

By contributing, you agree your contributions are under the same license as the project (see `LICENSE`).
