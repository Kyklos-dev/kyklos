# How pipeline YAML is structured

Use this page when you **open a `kyklos.yaml`** and want to know **what each block is for** and **in what order to read it**—concepts first, then field-by-field lookup in the [YAML reference](./pipelines/yaml-reference).

---

## Top of the file (who, what, when)

Read **top to bottom**:

1. **`version` / `name`** — File format and display name.
2. **`agent`** — Default **model**, **prompt**, and **runner** for steps that call an LLM (unless a step overrides).
3. **`eval_bundle`** (optional) — Files included in the **fingerprint** for this pipeline’s runs.
4. **`repository`** (optional) — Git **URL** + **branch** for cloning into the **workspace**.
5. **`triggers`** — **When** runs start (`manual`, `push`, `schedule`).
6. **`pipeline:`** — The **body**: ordered **stages**.

::: tip
If you only care about **behavior**, skip straight to **`pipeline:`** after **`triggers`**. Everything above configures **context** (agent, git, audit).
:::

---

## The `pipeline:` list (the workflow body)

`pipeline` is a **YAML list**. **Each list item is one stage.**

```yaml
pipeline:
  - name: build        # ← stage 1
    steps: [ ... ]

  - name: test         # ← stage 2
    steps: [ ... ]
    pass_if: { ... }
    on_fail: { ... }
```

- **Order matters** — stages run **first → last** unless **`on_fail`** uses **`goto`** to jump.
- Each stage has its own **`steps`**, optional **`pass_if`**, optional **`on_fail`**.

---

## Inside a stage

| Key | Required? | Purpose |
|-----|-----------|---------|
| **`name`** | Yes | Stable id for logs, **`goto`**, and your mental map. |
| **`steps`** | Yes | Ordered list of **step** objects. |
| **`pass_if`** | No | After all steps finish, conditions on **scores** must pass. |
| **`on_fail`** | No | If the stage fails or `pass_if` fails, what to do next. |

---

## Inside a step

| Key | Required? | Purpose |
|-----|-----------|---------|
| **`uses`** | Yes | Which built-in or custom step to run (`kyklos/run-dataset`, …). |
| **`name`** | No | **Logical name** for scores and `from:` references. Strongly recommended for clarity. |
| **`with`** | No | Parameters (paths, thresholds, **`from:`** pointers). |
| **`timeout_seconds`** | No | Cap wall time for this step only. |

---

## Optional tail of the file

- **`notify`** — Hints for Slack/email-style notifications (exact wiring depends on server).
- **`env`** — Extra environment variables for the **run**.
- **`max_goto`** — Safety cap on **`goto`** hops across the whole run.

---

## How this maps to a run in the UI

When you open **Run detail**, you see **stages** in order, **steps** inside each stage, and **scores** that **`pass_if`** evaluated. That layout matches the **YAML structure**—if the file is hard to follow, rename **stages** and **`name:`** your steps until it matches how you think.

---

## See also

- [Understanding Kyklos](./understanding-kyklos) — big picture  
- [Scores, `from:`, and `pass_if`](./scores-from-and-pass-if) — wiring between steps  
- [YAML reference](./pipelines/yaml-reference) — exhaustive field list  
