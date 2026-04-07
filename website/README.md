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

## GitHub Pages

The workflow **`.github/workflows/pages.yml`** builds the site with `VITEPRESS_BASE=/<repo>/` and **pushes the result to the `gh-pages` branch** (branch-based publishing — avoids the separate “GitHub Actions” Pages deployment API that can return **404** if Pages isn’t provisioned that way).

### One-time setup

1. **Settings → Actions → General → Workflow permissions**: set **Read and write permissions** for workflows (the job must be allowed to push to `gh-pages` with `GITHUB_TOKEN`).
2. Run the workflow once (**Actions → Deploy docs (GitHub Pages) → Run workflow**) or push to **`main`** under `website/`.
3. **Settings → Pages → Build and deployment**: set **Source** to **Deploy from a branch**, **Branch** = **`gh-pages`**, folder **`/ (root)`**, then Save.

The site URL is **`https://<owner>.github.io/<repo>/`** (e.g. `https://kyklos-dev.github.io/kyklos/`).

### Private repositories

On **GitHub Free**, **GitHub Pages does not serve private repos**. Use a **public** repo, or deploy elsewhere (e.g. Vercel above).

Local preview always uses **`/`** as base; no extra env needed for `npm run dev`.

### GitHub Pages URL

Open the site at **`https://<owner>.github.io/<repo>/`** (include the **repository name** in the path).  
`https://<owner>.github.io/` alone is a **different** site and will not show this project.

If the page looks **unstyled** or the layout is wrong, the usual cause is opening the wrong URL (missing `/<repo>/`), or raw HTML links in Markdown that start with `/…` (domain root) instead of paths relative to the site base — the home page Explore cards use **relative** `href="guides/…"` so they work on GitHub Pages.

Longer narrative docs also live in the repo **`docs/`** folder for GitHub-only readers; keep product truth in sync when behavior changes.
