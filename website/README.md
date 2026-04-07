# Kyklos documentation site (VitePress)

Product-focused static docs. **Recommended hosting: [Vercel](https://vercel.com)** (see below). The site is built from this **`website/`** directory only.

**Branding:** Nav uses **`public/logo.svg`** / **`logo-dark.svg`** (wordmark + “DOCUMENTATION”). Styling uses neutral surfaces, blue links, and system fonts (see `.vitepress/theme/custom.css`). Favicon: **`public/favicon.svg`**.

**How docs are written:** **Understanding** pages explain components and flow; **structure** pages show how YAML is read top-to-bottom; **reference** pages are lookup tables; **best practices** pages are short, scannable rules. Use **`::: tip`** / **`::: warning`** where helpful.

## What this site is for

- **Product**: what Kyklos is, features, concepts, pipelines, configuration, dashboard/API.
- **Users of releases**: short **[Use a release](/getting-started)** page (binary + `KYKLOS_STEPS_DIR`).
- **Contributors**: **[Contributing](/contributing/)** — clone, `make build-ui`, `make run`, tests.

## Local preview

```bash
npm ci
npm run dev
```

Open the URL VitePress prints (usually `http://localhost:5173`).

## Production build

```bash
npm ci
npm run build
```

Output: **`.vitepress/dist/`**

On Vercel you do **not** set `VITEPRESS_BASE` — the site is served at the **root** of your deployment URL (e.g. `https://your-project.vercel.app/`), so the default VitePress **`base: "/"`** is correct.

---

## Deploy on Vercel

`vercel.json` in this folder tells Vercel to run **`npm ci`**, **`npm run build`**, and publish **`.vitepress/dist`**.

### 1. Push your repo to GitHub (or GitLab / Bitbucket)

Vercel will pull from the remote on each push to the branch you select.

### 2. Import the project

1. Go to [vercel.com/new](https://vercel.com/new) and sign in.
2. **Add New… → Project** and import your repository.

### 3. Configure the project (important for a monorepo)

| Setting | Value |
|--------|--------|
| **Root Directory** | **`website`** (click “Edit” and set to the `website` folder) |
| **Framework Preset** | Other / Vite (optional; `vercel.json` already defines build) |
| **Build Command** | `npm run build` (default from `vercel.json`) |
| **Output Directory** | `.vitepress/dist` (default from `vercel.json`) |
| **Install Command** | `npm ci` (default from `vercel.json`) |

Leave **Environment Variables** empty unless you add something custom later.

### 4. Deploy

Click **Deploy**. After the first build succeeds, your docs live at **`https://<project-name>.vercel.app`** (or your team’s default domain).

### 5. Optional

- **Custom domain:** Project → **Settings → Domains** — add your DNS records as prompted.
- **Production branch:** Project → **Settings → Git** — usually **`main`**.
- **Preview deployments:** Every PR gets a preview URL automatically.

---

## Repo `docs/` folder

Longer narrative Markdown also lives in the repository **`docs/`** folder (for editors who browse the repo on GitHub). Keep product behavior in sync with this VitePress site when you change features.
