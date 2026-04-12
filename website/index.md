---
layout: home

hero:
  name: Kyklos
  text: Test & eval orchestration for AI agents
  tagline: Scores, gates, and artifacts for agent evaluation—not a replacement for general CI. Self-hosted runs, dashboard, and API.
  actions:
    - theme: brand
      text: Understanding Kyklos
      link: /guides/understanding-kyklos
    - theme: alt
      text: What is Kyklos?
      link: /introduction/what-is-kyklos
    - theme: alt
      text: GitHub
      link: https://github.com/Kyklos-dev/kyklos
      target: _blank
      rel: "noopener noreferrer"

features:
  - title: Pipeline-native semantics
    icon: 🔄
    details: Stages, steps, score-based pass_if gates, on_fail routing — designed for agent quality, not just exit codes.
  - title: Observable by default
    icon: 📊
    details: Live logs, run history, compare runs, artifact lineage — one place to see what happened.
  - title: Traceable evals
    icon: 🔐
    details: Optional eval bundles with fingerprints tie results to prompt, data, and model choices.
  - title: Yours to run
    icon: 🖥️
    details: Single binary with embedded UI; SQLite by default. Your data stays on your infrastructure.
---

## Explore

<div class="ky-doc-cards">

<a class="ky-doc-card" href="guides/understanding-kyklos">
  <h3>Understanding Kyklos</h3>
  <p>Components, how a run flows, and Kyklos-specific features (scores, gates, artifacts).</p>
  <span class="more">Read →</span>
</a>

<a class="ky-doc-card" href="introduction/what-is-kyklos">
  <h3>Product overview</h3>
  <p>One-page pitch: orchestration, scores, artifacts, and self-hosted control plane.</p>
  <span class="more">Read →</span>
</a>

<a class="ky-doc-card" href="guides/pipelines/">
  <h3>Pipelines & YAML</h3>
  <p>Structure, reference, gates, examples — concepts plus lookup tables.</p>
  <span class="more">Read →</span>
</a>

<a class="ky-doc-card" href="reference/steps/">
  <h3>Built-in steps</h3>
  <p>Every shipped step: <code>with:</code> options, scores, env vars, and links from the dashboard.</p>
  <span class="more">Read →</span>
</a>

<a class="ky-doc-card" href="concepts/architecture">
  <h3>Architecture</h3>
  <p>Server, scheduler, engine, persistence — how the binary is organized.</p>
  <span class="more">Read →</span>
</a>

<a class="ky-doc-card" href="getting-started">
  <h3>Use a release</h3>
  <p>Download a binary, set KYKLOS_STEPS_DIR, run — minimal install path.</p>
  <span class="more">Read →</span>
</a>

</div>
