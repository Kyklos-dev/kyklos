# Best practices

This page collects **operational and authoring** habits that keep Kyklos pipelines **clear, safe, and maintainable**. It follows the same idea as focused “best practices” sections in technical product docs: **short rules**, **bold leads**, easy to scan.

---

## Pipelines and YAML

- **Name stages for behavior** — Use **`build`**, **`test`**, **`policy`**, not `stage1`. Names appear in logs, **`goto`**, and mental models.
- **Set `name:` on important steps** — Makes **`pass_if`** and **`from:`** keys readable (`golden-set.success_rate` vs a default derived from `uses:`).
- **Keep stages small** — One failure domain per stage when possible; easier to see what broke.
- **Match `from:` to real stage.step ids** — Typos fail downstream steps silently or with obscure errors.

---

## Scores and gates

- **Align thresholds with reality** — Start from measured baselines; tighten gradually in production.
- **Prefer explicit `pass_if`** — If a stage must enforce quality, say so in YAML instead of relying on implicit defaults.
- **Do not use `continue` casually** — Skipping ahead can bypass gates; only use when you explicitly accept partial success.

---

## Eval bundles and traceability

- **Use `eval_bundle` when audits matter** — The fingerprint ties runs to **which** prompt/dataset/model inputs were evaluated.
- **Keep paths stable** — Moving files changes fingerprints; treat moves as **config changes**.

---

## Security and access

- **Treat the server as trusted-network only** — Kyklos does not authenticate the HTTP API by default. Use a **reverse proxy** or **private network** for remote access.
- **Never commit secrets** — Use environment variables and your platform’s secret store; reference them from **`token_env`** or server config.

---

## Artifacts and disk

- **Monitor artifact disk** — Large or frequent runs can grow storage without rotation policies.
- **Avoid secrets in artifact files** — Same as logs: assume files may be downloaded by anyone with UI access.

---

## Operations

- **Pin `KYKLOS_STEPS_DIR` to a known tree** — Same binary + matching **`steps/`** revision avoids “step not found” surprises.
- **Back up SQLite** — Default DB lives under the user home unless you override **`-db`**; include it in backup policy.
- **Probe with `/health`** — Use for load balancers and automation checks.

---

## When you adopt new product features

When you start using a **Kyklos-specific** feature (for example **compare runs**, **baseline**, **global artifact list**, or **webhooks**):

- Read the **guide** for that feature first, then the **YAML reference** for exact keys.
- Validate on a **manual run** before wiring **schedule** or **push** triggers.

---

## See also

- [Understanding Kyklos](./understanding-kyklos) — components and flow  
- [Artifacts](./artifacts) — files produced by runs  
- [Configuration](./configuration) — server YAML  
