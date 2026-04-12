# Built-in steps

Kyklos ships Python **steps** under the `steps/` directory. The engine resolves `uses: kyklos/<name>` to a script (see the [pipeline YAML reference](/guides/pipelines/yaml-reference)). Steps run in the server’s configured Python environment (`python_venv` in `kyklos-server.yaml`); install extra packages there when a step needs them (for example `deepeval`, `litellm`, `jsonschema`).

## How steps work

- Each step receives a **Kyklos context** (workspace path, pipeline config, upstream results) and returns **scores**, **pass/fail**, **metadata**, and optional **artifact** paths.
- Downstream steps reference outputs with `from: <stage>.<step>` or logical names like `run-dataset`. See [Scores, `from` & `pass_if`](/guides/scores-from-and-pass-if).
- Built-in steps are **not** HTTP microservices by default: they run as subprocesses. The exception is [`kyklos/http-judge`](/reference/steps/evaluate#step-http-judge), which calls **your** URL.

## Documentation map

| Category | Page |
|----------|------|
| Build (lint, snapshot, diff) | [Build steps](/reference/steps/build) |
| Test (dataset, simulation, tools, wait) | [Test steps](/reference/steps/test) |
| Evaluate (judges, checks, schema, regression) | [Evaluate steps](/reference/steps/evaluate) |
| Register & deploy | [Register & deploy steps](/reference/steps/register-and-deploy) |

Use the **Docs** link next to each step in the dashboard **Step catalog** or **Predefined steps** palette to jump to the matching section.

## Environment variables (common)

| Variable | Used by |
|----------|---------|
| `OPENAI_API_KEY` | Semantic similarity (embeddings), LLM judge (LiteLLM / OpenAI models) |
| `ANTHROPIC_API_KEY` | Agent runner (`anthropic`), LLM judge when `model` is Anthropic via LiteLLM |
| `KYKLOS_STEPS_DIR` | Server: directory containing `steps/` (required to discover scripts) |
| `KYKLOS_ARTIFACTS_DIR` | Regression / diff baselines (default under `~/.kyklos`) |

For provider-specific keys, follow [LiteLLM](https://docs.litellm.ai/) and your cloud provider’s docs.
