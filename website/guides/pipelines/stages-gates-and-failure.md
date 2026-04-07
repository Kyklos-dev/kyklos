# Stages, gates & failure handling

This page is the **behavioral core** of Kyklos pipelines: how **steps** chain together, how **scores** become **gates**, and what happens when something breaks.

::: tip Prerequisites
Read **[Understanding Kyklos](../understanding-kyklos)** and **[Scores, `from:`, and `pass_if`](../scores-from-and-pass-if)** first—this page goes deeper on **`on_fail`** only.
:::

---

## Stages run in order

The **`pipeline:`** list is **ordered**. By default the engine runs **stage 1**, then **stage 2**, and so on — unless **`on_fail`** jumps with **`goto`**.

Each **stage** is a named unit:

- **`name`** — stable identifier (use **lowercase, no spaces** for clarity: `build`, `test`, `policy`).
- **`steps`** — executed **sequentially** within the stage.
- **`pass_if`** — optional; if present, evaluated **after** all steps in the stage finish.
- **`on_fail`** — evaluated when the stage **errors** or **`pass_if`** fails.

---

## Steps: `uses`, `name`, and `with`

### `uses`

Format **`kyklos/<logical-path>`** — maps to a Python file under your **`steps/`** tree (e.g. `kyklos/run-dataset` → `steps/.../run_dataset.py` depending on resolver rules). Custom steps can use other patterns if your resolver supports them.

### `name`

If you set **`name:`**, that string becomes the **prefix** for this step’s **scores** in `pass_if` and for **`from:`** references in later steps.

If omitted, the engine derives a name from **`uses`** (often the last path segment).

**Example:** `name: golden-set` produces score keys like **`golden-set.success_rate`**.

### `with`

Step-specific **configuration**: dataset paths, thresholds, **`from:`** pointers to another step’s output.

### `from:` (cross-step wiring)

Many steps need **outputs** from an earlier step (e.g. judge after dataset run). The usual pattern is:

```yaml
from: <stage>.<step-name>
```

Example: `from: test.kyklos/run-dataset` or `from: benchmark.golden-set` — the exact string depends on how your **stage** and **step** names are set. Use **`stage.stepname`** so the engine can resolve the right **artifact / score bundle**.

---

## `pass_if` — quality gates

After steps complete, **`pass_if`** is a **map** of **metric key → expression string**.

- **Keys** usually look like **`stepname.metric`** (e.g. `sim.avg_similarity`, `safety.passed`).
- **Expressions** are compared by the engine — common patterns include:
  - **Numeric:** `">= 0.72"`, `"<= 0.35"`, `"> 0"`
  - **Boolean:** `"== true"`, `"== false"`

**All** conditions must pass for the stage to be treated as **passed** for downstream routing. If any fails, the stage is **logically failed** → **`on_fail`** applies.

### Tips

- Name steps with **`name:`** so `pass_if` stays readable (`golden-set` not `kyklos/run-dataset`).
- Keep thresholds **aligned** with what steps actually emit (check step docs / examples).
- Start **strict** in prod-like pipelines; relax in sandboxes.

---

## `on_fail` — routing

| `then` | Meaning |
|--------|---------|
| **`abort`** | Stop the **entire run** with failure. |
| **`continue`** | Move to the **next** stage (dangerous if you expect a hard gate). |
| **`goto`** | Jump to the stage named in **`goto:`** (must exist). Subject to **`max_goto`** cap. |

### `retry` (optional)

You can retry the **same stage** before applying `then`:

```yaml
on_fail:
  retry:
    max_attempts: 1
    delay_seconds: 30
  then: abort
```

Use for **transient** failures (API rate limits, flaky network) — pair with **observability** so you don’t hide systemic bugs.

---

## `max_goto` (pipeline level)

Prevents infinite **`goto`** loops. Set in the **root** of the YAML:

```yaml
max_goto: 8
```

Default is engine-defined (often **10**). If you don’t use `goto`, this rarely matters.

---

## Execution order (summary)

1. Start **run** → create **workspace** (clone if `repository:` / repo config).
2. For each **stage** in order:
   - Run each **step** in order; stream logs; collect **scores + artifacts**.
   - If a step **hard-errors** (process crash), stage typically fails → **`on_fail`**.
   - If **`pass_if`** exists and **fails** → **`on_fail`**.
3. If run completes all stages without abort → **passed** (subject to final bookkeeping).

---

## Anti-patterns

- **Huge stages** — harder to see what failed; prefer **smaller stages** with clear names.
- **`continue` after real failures** — can skip gates; use only when you explicitly want “best effort.”
- **Missing `name:`** on steps you reference — makes **`from:`** and **`pass_if`** brittle.

For **copy-paste YAML**, see [Code examples](./code-examples).
