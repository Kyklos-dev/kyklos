# Screenshots for the documentation site

Use a **1280–1600px wide** viewport (or your target doc width). Prefer **light theme** unless the site documents dark mode. **Hide bookmarks bar** and crop to the app chrome if needed.

After `scripts/run-demo-server.sh` and `python3 scripts/seed-demo-data.py`, you should see **three pipelines** and **several runs** (including one **failed** gate).

---

## Committed assets (under `website/public/screenshots/`)

| File | Content |
|------|---------|
| `pipelines-list.png` | Pipelines home |
| `pipeline-detail.png` | Pipeline detail (Git / Run) |
| `pipeline-run-history.png` | Chart + run history on pipeline |
| `run-detail-passed-workflow.png` | Run detail — early stages |
| `run-detail-passed-gates.png` | Run detail — `pass_if` gates |
| `compare-runs.png` | Compare runs picker |
| `artifacts-library.png` | Artifacts library (empty state) |
| `steps-catalog.png` | Built-in steps catalog |

Optional captures not yet in the set: **failed run** (gate error), **All runs** explorer-only screenshot.

---

## Optional

- **Logs panel** expanded on a run with streaming lines.
- **Mobile** narrow width (only if the docs call it out).

---

## What we will do with these

Place images in **`website/public/screenshots/`** and reference them from VitePress pages (e.g. dashboard guide, introduction) with `![…](/screenshots/…png)`.
