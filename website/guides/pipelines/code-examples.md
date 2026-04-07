# Pipeline code examples

Annotated **`kyklos.yaml`** you can adapt. Paths assume a **workspace** that contains the repo’s **`examples/`** tree (clone the Kyklos repo or mirror those files in your agent repo).

---

## 1. Minimal: hello-world (four stages)

**Story:** lint → snapshot → **run a dataset** → **semantic similarity** gate → **safety / cost / latency** → tag.

This is the best file to read first in the repository: **`examples/hello-world.yaml`**.

### Full `hello-world.yaml`

```yaml
version: "1.0"
name: hello-world

eval_bundle:
  id: hello-v1
  prompt: ./examples/long-running-test/prompt.md
  dataset: ./examples/datasets/hello.jsonl

agent:
  model: claude-haiku-4-5-20251001
  prompt: ./examples/long-running-test/prompt.md
  runner:
    type: anthropic

triggers:
  - on: manual

pipeline:
  - name: build
    steps:
      - uses: kyklos/lint
      - uses: kyklos/snapshot

  - name: test
    steps:
      - uses: kyklos/run-dataset
        with:
          dataset: ./examples/datasets/hello.jsonl
          concurrency: 4

      - uses: kyklos/semantic-similarity
        name: semantic-similarity
        with:
          from: test.kyklos/run-dataset
          dataset: ./examples/datasets/hello.jsonl
          threshold: 0.7

    pass_if:
      semantic-similarity.avg_similarity: ">= 0.70"

    on_fail:
      then: abort

  - name: evaluate
    steps:
      - uses: kyklos/safety-check
        name: safety-check
        with:
          from: test.kyklos/run-dataset

      - uses: kyklos/cost-check
        name: cost-check
        with:
          from: test.kyklos/run-dataset
          max_usd: 0.10

      - uses: kyklos/latency-check
        name: latency-check
        with:
          from: test.kyklos/run-dataset
          max_p95_ms: 5000

    pass_if:
      safety-check.passed: "== true"

    on_fail:
      then: abort

  - name: register
    steps:
      - uses: kyklos/tag
        with:
          tag: latest

notify:
  on: [passed, failed]
```

**What to notice**

- **`from: test.kyklos/run-dataset`** — wires the similarity and check steps to the **dataset runner** output in stage **`test`**. Your `from:` strings must match **stage** + **step** names.
- **`pass_if`** on **`test`** gates **average similarity** before you spend more on policy checks.
- **`evaluate`** gates **safety**; cost/latency are present but the sample `pass_if` only requires **safety** — tighten in production.

---

## 2. Snippet: `eval_bundle` + `agent`

Pin **audit** inputs and define **how** the agent is invoked:

```yaml
eval_bundle:
  id: my-eval-v2
  prompt: ./prompts/system.md
  dataset: ./data/golden.jsonl

agent:
  model: claude-sonnet-4-20250514
  prompt: ./prompts/system.md
  temperature: 0.2
  max_tokens: 4096
  runner:
    type: anthropic
```

---

## 3. Snippet: clone agent repo into the workspace

```yaml
repository:
  url: https://github.com/YOUR_ORG/your-agent-service.git
  branch: main
  # token_env: GITHUB_TOKEN   # server must expose this env for HTTPS clone
```

Use with **`triggers`** that make sense for your Git setup (push to `main`, etc.).

---

## 4. Snippet: triggers (manual + push + schedule)

```yaml
triggers:
  - on: manual
  - on: push
    branch: main
  - on: schedule
    cron: "0 6 * * *"
```

Adjust **cron** to your timezone / SRE practice.

---

## 5. Snippet: stage with retry then abort

```yaml
- name: benchmark
  steps:
    - uses: kyklos/run-dataset
      name: golden-set
      with:
        dataset: ./examples/datasets/hello.jsonl
        concurrency: 4

  pass_if:
    golden-set.success_rate: ">= 0.88"

  on_fail:
    retry:
      max_attempts: 1
      delay_seconds: 30
    then: abort
```

---

## 6. Snippet: multi-metric policy gate

```yaml
- name: policy
  steps:
    - uses: kyklos/safety-check
      name: safety
      with:
        from: benchmark.golden-set

    - uses: kyklos/cost-check
      name: cost
      with:
        from: benchmark.golden-set
        max_usd: 0.35

    - uses: kyklos/latency-check
      name: latency
      with:
        from: benchmark.golden-set
        max_p95_ms: 12000

  pass_if:
    safety.passed: "== true"
    cost.avg_cost_per_run: "<= 0.35"
    latency.p95_ms: "<= 12000"

  on_fail:
    then: abort
```

---

## 7. Production-shaped pipeline (outline)

The repository ships **`examples/production-pipeline.yaml`**: **validate → benchmark → policy → smoke → promote**, with **`max_goto`**, **`eval_bundle`**, and **notify**. Read the file top comments — they document setup (tokens, Slack, tuning thresholds).

Stages at a glance:

1. **`validate`** — fast **lint** + **snapshot** before token-heavy work.  
2. **`benchmark`** — **run-dataset** + **semantic-similarity**, **success_rate** + similarity gates, **retry** once.  
3. **`policy`** — **safety**, **cost**, **latency** on the same traced outputs.  
4. **`smoke`** — **health-check** style probe.  
5. **`promote`** — **tag** when everything is green.

Copy from the repo for the **full** YAML; keep comments — they’re part of the documentation.

---

## 8. Step families (what to put in `uses:`)

Illustrative — exact names live under **`steps/`** in the repo:

| Family | Examples (conceptual) |
|--------|------------------------|
| **Build** | lint, snapshot, diff |
| **Test** | run-dataset, simulate conversation, wait |
| **Evaluate** | semantic similarity, exact match, JSON schema, LLM judge, regression, safety, cost, latency |
| **Deploy / register** | health check, canary, tag, push |

Use the **Steps** catalog in the dashboard (when `KYKLOS_STEPS_DIR` is set) to see what your server exposes.

---

## Next

- [YAML reference](./yaml-reference) — field tables  
- [Stages, gates & failure](./stages-gates-and-failure) — `pass_if` / `on_fail` behavior  
- [Triggers & Git](../triggers-and-git) — webhooks and `repository:`  
