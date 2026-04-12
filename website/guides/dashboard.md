# Dashboard & API

## Dashboard (product UX)

The **web UI** is the day-to-day surface for:

- **Pipelines** — create, edit, delete; paste YAML (**freestyle**) or start from a **Git workspace** and **load `kyklos.yaml` from a branch** (see [Triggers & Git — Dashboard Git workspaces](/guides/triggers-and-git#dashboard-git-workspaces)).
- **Workspaces** — register a remote, scan branches, link pipelines, and drive branch-based runs and YAML load.
- **Runs** — trigger manually (with branch selection when applicable), open **run detail**, stream **logs**, inspect **stages** and **scores**.
- **Explorer** — browse **all runs**, filter, jump to a pipeline or run.
- **Artifacts** — cross-run list of persisted files with download links.
- **Steps catalog** — discover built-in **`uses:`** entries (when the server scans `KYKLOS_STEPS_DIR`). Each card can show a **YAML example**, **Copy**, **Pin**, and **Docs** (opens the matching section on the [Built-in steps](/reference/steps/) reference). The pipeline builder’s **Predefined steps** palette also has a **Documentation** link per step.

There is **no login** in the product — treat the bind address and network as your security boundary, or front the server with a **reverse proxy** and **auth**.

### Pipelines list

Registered pipelines show recent status and quick **Run** / **Delete** actions.

![Pipelines list with three pipelines and status badges](/screenshots/pipelines-list.png)

*Pipelines home: status per pipeline (passed / failed) and last run age.*

### Pipeline detail

Open a pipeline to edit YAML, export, clone, **compare runs**, or **run** with optional branch/SHA. The **Git source** panel explains how runs resolve a workspace (temporary vs cloned repo).

![Pipeline detail: Git source, branch/SHA, Run Now](/screenshots/pipeline-detail.png)

*Pipeline detail: manual run controls and repository hints.*

### Run history & metrics

On a pipeline, **Run history** lists recent runs; when metrics exist, a small chart summarizes score trends (here, `wait` step `waited_seconds` across runs).

![Pipeline page: metric chart and run history table](/screenshots/pipeline-run-history.png)

*Run history with baseline hint and compare shortcuts.*

### Run detail — workflow

A **passed** run expands **stages** and **steps**, with durations and step scores (e.g. `waited_seconds` from `kyklos/wait`).

![Run detail: workflow stages build and test](/screenshots/run-detail-passed-workflow.png)

*Successful run: early stages and step scores.*

![Run detail: evaluate stage with pass_if gate](/screenshots/run-detail-passed-gates.png)

*Later stages: **`pass_if`** evaluation against step scores (`mock-eval-harness.waited_seconds >= 0`).*

### Compare runs

Choose **Run A** (reference) and **Run B**; deltas are **B − A** on scores and metadata.

![Compare runs: selecting Run A and Run B](/screenshots/compare-runs.png)

*Compare runs: pick two executions of the same pipeline.*

### Artifacts library

Cross-run **Artifact library** lists persisted files with filters. The empty state explains how files appear after steps emit artifact paths.

![Artifact library empty state](/screenshots/artifacts-library.png)

*Artifacts: global list (empty until steps persist files).*

### Step catalog

Browse built-in **`kyklos/...`** steps discovered from the server’s `steps/` tree.

![Built-in steps catalog](/screenshots/steps-catalog.png)

*Step catalog: categories and `uses:` strings for `kyklos.yaml`.*

---

## API

**REST JSON** under **`/api/v1`** mirrors what the UI uses: pipelines, runs, compare, cancel, artifacts, step catalog, etc. Same **no-auth** default — automate only over trusted paths.

## Embedded UI

In production you run a **single binary**; the UI is **baked in** (`go:embed`). You do not host a separate static site for the app shell.

**Local UI development** (hot reload) is for contributors changing React — see [Contributing](/contributing/).
