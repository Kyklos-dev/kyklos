# Kyklos documentation site (VitePress)

Product-focused static docs (deploy e.g. on **Vercel** with root **`website/`**).

**Branding:** Nav uses **`public/logo.svg`** / **`logo-dark.svg`** (wordmark + “DOCUMENTATION”). Styling uses neutral surfaces, blue links, and system fonts (see `.vitepress/theme/custom.css`). Favicon: **`public/favicon.svg`**.

**How docs are written:** **Understanding** pages explain components and flow; **structure** pages show how YAML is read top-to-bottom; **reference** pages are lookup tables; **best practices** pages are short, scannable rules (see [ADK Artifacts best practices](https://adk.dev/artifacts/#best-practices) for the pattern). Use **`::: tip`** / **`::: warning`** for reading order and caveats. Prefer **Kyklos-specific behavior** over comparisons to other CI products.

## What this site is for

- **Product**: what Kyklos is, features, concepts, pipelines, configuration, dashboard/API.
- **Users of releases**: short **[Use a release](/getting-started)** page (binary + `KYKLOS_STEPS_DIR`).
- **Contributors**: **[Contributing](/contributing/)** — clone, `make build-ui`, `make run`, tests (not required to *use* Kyklos).

## Local preview

```bash
npm ci
npm run dev
```

## Build

```bash
npm ci
npm run build
```

Output: `.vitepress/dist/`

## Vercel

Set project **Root Directory** to **`website`**. `vercel.json` runs `npm run build` and publishes `.vitepress/dist`.

Longer narrative docs also live in the repo **`docs/`** folder for GitHub-only readers; keep product truth in sync when behavior changes.
