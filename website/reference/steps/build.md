# Build steps

Build steps prepare or validate your **agent definition** before you spend tokens on dataset runs. They typically read `agent:` from the pipeline (model, prompt path, temperature) and files in the **workspace** (the checked-out repo for the run).

---

## Lint {#step-lint}

**`kyklos/lint`**

Validates the pipeline’s `agent` block: required fields (`model`, `prompt`), that the prompt file exists on disk, sensible model name prefixes, and temperature in range. Fails fast with a clear list of errors so you do not run expensive steps on a broken config.

**`with:`** none — configuration comes from top-level `agent:` in `kyklos.yaml`.

**Scores:** reflects whether validation passed; use in `pass_if` if you gate the rest of the pipeline on lint.

---

## Snapshot {#step-snapshot}

**`kyklos/snapshot`**

Computes a **stable hash** over the agent definition (model, prompt content, tools, temperature, max tokens) and writes a JSON artifact. Used for **drift detection** and as an input to the diff step.

**`with:`** none.

**Artifacts:** snapshot JSON path appears in step results for downstream consumption.

---

## Diff {#step-diff}

**`kyklos/diff`**

Compares the **current** snapshot from an earlier step in the same run to a **baseline** snapshot stored from a previous passing run (under the artifact store). Helps answer “did the agent definition change since we last shipped?”

| Option | Default | Description |
|--------|---------|-------------|
| `compare_to` | `last_passing` | How to pick the baseline (v1 supports looking up the last passing run’s snapshot). |

**Scores:** indicate whether meaningful fields changed.
