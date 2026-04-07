# Scores, `from:`, and `pass_if`

This page explains **how data moves between steps** and how **stage-level gates** work. Kyklos uses **named scores** (structured numbers and booleans from each step), **`from:`** to wire one step’s outputs into another, and **`pass_if`** on the **stage** after scores are collected—not only process exit codes.

---

## Scores (what steps produce)

Each step returns a structured result that includes **scores**: a map of **string keys → numbers or booleans**.

Examples (names vary by step):

- `avg_similarity` — average semantic similarity vs reference.
- `passed` — boolean safety check.
- `success_rate` — fraction of dataset rows that succeeded.
- `p95_ms` — latency percentile.

You reference scores in **`pass_if`** using **`stepname.metric`** (or the step’s **`name:`** if you set one).

::: tip
Always set **`name:`** on steps you gate on or reference—`golden-set.success_rate` is clearer than a default derived from `uses:`.
:::

In the dashboard, satisfied gates appear on the run detail with the **condition** and **observed value**:

![Run detail: pass_if gate on step scores](/screenshots/run-detail-passed-gates.png)

*Example: stage **evaluate** after `kyklos/wait` — gate `mock-eval-harness.waited_seconds >= 0`.*

---

## `from:` (feeding one step another’s output)

Many steps need **inputs produced by an earlier step** (e.g. judges that read dataset run outputs). Use **`from:`** inside **`with:`**:

```yaml
- uses: kyklos/semantic-similarity
  name: sim
  with:
    from: test.kyklos/run-dataset
    dataset: ./data/hello.jsonl
```

**Pattern:** `from: <stage>.<step-name>`

- **`<stage>`** — the **`name:`** of the stage that contained the producer step.
- **`<step-name>`** — the producer’s **`name:`**, or the default derived from **`uses:`** (harder to read).

If `from:` is wrong, downstream steps fail or score empty—double-check **stage** and **step** names against your YAML.

---

## `pass_if` (gates on scores)

After **all steps in a stage** complete, Kyklos evaluates **`pass_if`**: a map of **score key → expression string**.

```yaml
pass_if:
  sim.avg_similarity: ">= 0.72"
  safety.passed: "== true"
```

- **All** conditions must pass for the stage to be treated as **passed** for routing.
- Expressions include comparisons like `">= 0.88"`, `"<= 12000"`, `"== true"`.

::: warning
`pass_if` runs **after** steps—it does not skip steps. Put expensive steps **after** cheap gates in **earlier stages** when possible.
:::

---

## Relationship to stage failure

- If a **step process crashes**, the stage typically **fails** → **`on_fail`** applies.
- If steps succeed but **`pass_if`** fails, the stage **fails logically** → **`on_fail`** applies the same way.

So **`pass_if`** is the **quality bar**; **`on_fail`** is **what to do when the bar isn’t met** (abort, retry, goto, etc.).

---

## Mental checklist

1. Producer step runs and emits scores **under its `name:`**.  
2. Consumer steps use **`from:`** to point at the right **stage.step**.  
3. **`pass_if`** references **`stepname.metric`** that actually exist in the result.  
4. **`on_fail`** matches your ops policy (don’t `continue` past real safety failures).

---

## See also

- [Stages, gates & failure](./pipelines/stages-gates-and-failure) — `on_fail`, `retry`, `goto`  
- [Pipeline YAML structure](./pipeline-yaml-structure) — where `pass_if` sits in the file  
- [Code examples](./pipelines/code-examples) — end-to-end wiring  
