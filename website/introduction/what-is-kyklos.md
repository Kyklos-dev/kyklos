# What is Kyklos?

**Kyklos** is a **self-hosted orchestrator** for **AI agent pipelines**. You describe workflows in **`kyklos.yaml`**: ordered **stages**, Python **steps**, **quality gates** on structured **scores**, and explicit **failure handling** (abort, retry, jump to another stage).

The product gives you:

- **Runs** you can inspect — logs, per-step results, metrics, **artifacts**.
- A **dashboard** and **REST API** to define pipelines, trigger runs, and compare outcomes.
- Optional **eval bundle fingerprints** so runs are tied to **which** prompt, dataset, and model configuration was evaluated.

![Kyklos dashboard: pipelines list](/screenshots/pipelines-list.png)

*The **Pipelines** view lists registered workflows and their latest status.*

## Mental model

Kyklos is **eval and test orchestration** for agents—not a substitute for your existing **build, lint, or deploy** pipelines. You might still use **GitHub Actions** (or similar) for those; Kyklos fits where you need **repeatable eval runs**, **thresholds on metrics**, **comparison across runs**, and **artifacts** from dataset or judge steps.

Think: not only “did the job finish?” but **what scores did we get**, **did we regress**, and **what files did steps produce** — with a **single run ID** tying it together.

## Core ideas

| Idea | Meaning |
|------|---------|
| **Pipeline** | Named workflow: agent config, triggers, and a list of **stages**. |
| **Stage** | Group of **steps** + optional **`pass_if`** on step scores + **`on_fail`** policy. |
| **Step** | Python module (`uses: kyklos/...`) — returns scores, pass/fail, artifact paths. |
| **Run** | One execution: status, logs, stage results, optional eval fingerprint, artifacts. |
| **Run workspace** | Isolated directory for that run — often a **git checkout** of your agent repo (or a local path for dev). |
| **Git workspace (UI)** | Saved remote + branches in the dashboard — **load YAML from a branch**, **run on a branch**; uses server disk under **`workspace_root`**. |

## Relationship to “just running scripts”

You *could* script evals in bash or generic CI. Kyklos standardizes the **contract**: every step speaks the same **result format**, the engine applies **gates** consistently, and the **UI** understands **runs** — so teams don’t reinvent glue in every repository.

## Next

- **[Understanding Kyklos](/guides/understanding-kyklos)** — components, run flow, Kyklos-specific features (**start here** for pipeline clarity)  
- [Features](./features) — capability map  
- [Who it’s for](./who-its-for) — fit and boundaries  
- [Pipelines](/guides/pipelines/) — overview, reference, gates, examples  
