# Understanding Kyklos

This page is the **mental model** for the rest of the documentation: **what the parts are**, **how they connect**, and **where to read next**.

---

## The big picture

Kyklos runs **pipelines** defined in **YAML** (`kyklos.yaml`). Each execution produces a **run**: one record with **logs**, **stage results**, **scores**, and optional **artifacts**.

You **self-host** a **server** that schedules work, runs **Python steps** in isolated **workspaces**, and exposes a **dashboard** and **REST API**. All state stays on **your** infrastructure.

**What Kyklos is not:** a drop-in replacement for **GitHub Actions**, **GitLab CI**, or other **general-purpose CI/CD**. Those tools still own **build, matrix, deploy, and infra** for many teams. Kyklos is **purpose-built for testing and evaluation** of AI agents: **structured scores**, **quality gates**, **eval fingerprints**, and **run artifacts**—the layer where “did the model behave well?” matters more than “did the process exit 0?”.

---

## What are the main parts?

| Component | Definition |
|-----------|------------|
| **Pipeline** | A named workflow: **triggers**, **agent defaults**, and an ordered list of **stages**. |
| **Stage** | A named group of **steps**, optional **`pass_if`** (gates on scores), and optional **`on_fail`**. |
| **Step** | One unit of work: a Python module selected with **`uses: kyklos/...`** (or your own resolver path). |
| **Run** | A single execution of a pipeline from start to terminal status. |
| **Workspace** | Isolated directory for that run—often a **Git checkout** of your agent repository. |
| **Scores** | Named numbers or booleans returned by a step (for example `avg_similarity`, `passed`). |
| **`pass_if`** | Expressions on those scores; all must pass for the stage to succeed logically. |
| **`eval_bundle`** | Optional block listing files that contribute to an **`eval_bundle_fingerprint`** on each run. |

---

## Why scores and gates?

Generic automation often stops at **process exit codes**. Kyklos is built for **agent evaluation**: steps emit **structured scores**, and stages declare **`pass_if`** so “green” means your **thresholds** on those metrics—not only that the process finished.

That is a **product choice**, not a requirement of every CI system.

---

## Features beyond plain “run a script”

These capabilities are **first-class in Kyklos** (whether or not your other tools expose them the same way):

| Capability | Role |
|------------|------|
| **Structured scores** | Steps return metrics the engine stores and the UI can show. |
| **Stage-level `pass_if`** | Gate on **multiple** metrics after steps complete. |
| **`from:` wiring** | Pass one step’s outputs into another by **`stage.step`** reference. |
| **`eval_bundle` fingerprint** | Tie a run to hashed prompt/dataset/model inputs for audits. |
| **Persisted run artifacts** | Files listed by steps can be stored and downloaded from the UI. |
| **Run comparison** | Compare two runs’ scores and metadata in the dashboard. |

---

## How a run flows (order of operations)

1. **Trigger** — Manual, **Git push** (webhook), or **schedule** (`cron`), per your YAML and server configuration.
2. **Workspace** — Engine prepares a directory; may **clone** from **`repository:`** or a server-registered repo.
3. **Stages** — For each stage **in order**:
   - Run each **step** in order.
   - Collect **scores** and **artifact paths** from each step.
   - If **`pass_if`** is set, evaluate it against those scores.
   - On failure, apply **`on_fail`** (`abort`, `continue`, `goto`, `retry` as configured).
4. **Result** — Run ends **passed** or **failed**; logs and artifacts remain queryable.

Stages are **sequential** by default. Use **`goto`** only when you intentionally jump; respect **`max_goto`**. Heavy parallelism usually lives **inside** a step (for example dataset concurrency), not as parallel stages in one file.

---

## What to read next

| Goal | Page |
|------|------|
| Map YAML top-to-bottom | [Pipeline YAML structure](./pipeline-yaml-structure) |
| Scores, `from:`, and `pass_if` | [Scores, `from:`, and `pass_if`](./scores-from-and-pass-if) |
| Run artifacts (files) | [Artifacts](./artifacts) |
| Operational habits | [Best practices](./best-practices) |
| Field-by-field lookup | [YAML reference](./pipelines/yaml-reference) |
| Examples | [Code examples](./pipelines/code-examples) |

---

## Summary

**Kyklos** ties together **YAML pipelines**, **sequential stages**, **scored steps**, **optional quality gates**, and **self-hosted runs**. Reference pages list **keys**; guides explain **behavior**.
