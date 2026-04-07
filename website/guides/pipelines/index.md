# Pipelines

A **pipeline** is the YAML document (`kyklos.yaml`) that defines **what** Kyklos runs: **when** to start, **which** agent defaults apply, and an ordered list of **stages**—each with **steps**, optional **quality gates** (`pass_if`), and **failure routing** (`on_fail`).

::: tip Reading order (recommended)
If you are new here, read **[Understanding Kyklos](../understanding-kyklos)** first, then **[How pipeline YAML is structured](../pipeline-yaml-structure)** and **[Scores, `from:`, and `pass_if`](../scores-from-and-pass-if)**. After that, use the reference and examples as **lookups**, not front-to-back reading.
:::

---

## How the docs are organized

| Layer | Purpose |
|-------|---------|
| **Understand** | Components, run flow, Kyklos-specific features → [Understanding Kyklos](../understanding-kyklos) |
| **Structure** | How `kyklos.yaml` is read top-to-bottom → [Pipeline YAML structure](../pipeline-yaml-structure) |
| **Data flow** | Scores, `from:`, stage gates → [Scores, `from:`, and `pass_if`](../scores-from-and-pass-if) |
| **Artifacts** | Persisted files from runs → [Artifacts](../artifacts) |
| **Behavior** | Gates, retries, jumps → [Stages, gates & failure](./stages-gates-and-failure) |
| **Reference** | Every key in tables → [YAML reference](./yaml-reference) |
| **Examples** | Full files and snippets → [Code examples](./code-examples) |
| **Practices** | Naming, thresholds, security, disk → [Best practices](../best-practices) |

**Reference** pages answer *“what keys exist?”* **Guides** answer *“how does it behave?”*—use both.

---

## Mental model (30 seconds)

1. **`pipeline:`** is a **list of stages** executed **in order** (unless **`on_fail`** uses **`goto`**).
2. Each **stage** runs its **steps** one after another; each step is a Python module chosen with **`uses: kyklos/...`**.
3. Steps emit **scores**. **`pass_if`** checks those scores—that is your **quality bar** for the stage.
4. If the bar fails (or a step crashes), **`on_fail`** decides: stop, continue, retry, or jump to another stage.

---

## In this section (pipelines)

| Page | Use when you need… |
|------|-------------------|
| [YAML reference](./yaml-reference) | Every top-level and nested field in one place. |
| [Stages, gates & failure](./stages-gates-and-failure) | Deep detail on `on_fail`, `retry`, `goto`, anti-patterns. |
| [Code examples](./code-examples) | Copy-paste YAML and annotated snippets. |

---

## Where files live

- In the **repository** that gets cloned into the **workspace** (paths relative to workspace root), or  
- Pasted in the **dashboard** when there is no Git checkout—Kyklos stores that YAML **server-side**.

---

## See also

- [Triggers & Git](../triggers-and-git) — `manual`, `push`, `schedule`, `repository:`  
- [Eval bundles & fingerprints](/concepts/eval-bundles) — audit fingerprints  
- [Configuration](../configuration) — `kyklos-server.yaml` vs pipeline YAML  
