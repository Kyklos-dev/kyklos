# Minimal Gemini agent (Kyklos)

This folder is a **small agent project** you can copy to its own Git repository and run with [Kyklos](https://github.com/kyklos/kyklos): one **Gemini** model (Google AI Studio / free-tier API key), a **prompt** file, and a tiny **JSONL** dataset.

The **`kyklos.yaml`** pipeline is intentionally **small but not trivial**: it exercises common Kyklos features beyond “call the model once.”

| Stage | Kyklos features |
|-------|------------------|
| **build** | **`kyklos/lint`** — validate `agent:` before API spend; **`kyklos/snapshot`** — hash agent config + emit a small artifact |
| **test** | **`kyklos/run-dataset`** — one Gemini call per JSONL row; **`kyklos/semantic-similarity`** with **`from: test.ds`** — score replies vs `expected_output_contains`; **`pass_if`** on **`success_rate`** and **`avg_similarity`** |
| **evaluate** | **`kyklos/cost-check`** / **`kyklos/latency-check`** with **`from: test.ds`** — gates on estimated **cost** and **p95 latency** from the same traces |

You can trim the YAML back to a single **`run-dataset`** stage if you only want the bare minimum.

## What you need

1. **Google AI Studio API key** (free tier): [Get API key](https://aistudio.google.com/apikey)  
   Export it where the Kyklos server can see it:

   ```bash
   export GOOGLE_API_KEY="your-key"
   ```

   **What this key is used for:** only **Google Gemini** HTTP requests. The step `kyklos/run-dataset` calls the Kyklos SDK’s Gemini runner (`google.generativeai`); it runs `genai.configure(api_key=...)` and sends each dataset row’s `input` (plus your `prompt.md` as system instruction) to the **Gemini API** so the model can reply. Kyklos does **not** use this key for the dashboard, Git, or webhooks—it is passed into the step environment (see `env:` in `kyklos.yaml`) so those API calls can authenticate.

2. **Python dependency** for the Kyklos step runtime (the same venv you set as `python_venv` in `kyklos-server.yaml`, or the interpreter that runs steps):

   ```bash
   pip install google-generativeai
   ```

3. **Kyklos** with `KYKLOS_STEPS_DIR` pointing at a checkout that includes the `steps/` tree (see main Kyklos docs).

## Layout

| File | Role |
|------|------|
| `kyklos.yaml` | Multi-stage pipeline: lint → snapshot → dataset run → semantic gate → cost/latency gates |
| `prompt.md` | System-style instructions (loaded by the SDK Gemini runner) |
| `data/hello.jsonl` | Two tiny test cases (`input` + optional `id`) |

## What exactly are **prompt** and **dataset**?

They answer two different questions: *how should the model behave?* vs *what do we ask it on each test?*

| Piece | File here | What it is | How Kyklos / Gemini use it |
|--------|-----------|------------|----------------------------|
| **Prompt** | `prompt.md` | Fixed **instructions** (like a system message): tone, rules, “answer briefly,” etc. | `kyklos.yaml` sets `agent.prompt: ./prompt.md`. The SDK **reads that file once per model config** and passes its text to Gemini as **system instruction** (same idea for every row). |
| **Dataset** | `data/hello.jsonl` | A **JSONL** file: one **JSON object per line**, each line = one **test case**. | The step `kyklos/run-dataset` reads every line. For **each** line it takes the **`input`** field (required) and sends it as the **user message** to Gemini, together with the system prompt above. Optional fields like **`id`** are only for your logs/results—they are not sent as the main user text unless your tooling uses them. |

**End-to-end for one line of the dataset:**  
Gemini receives **system** = contents of `prompt.md`, **user** = that line’s `"input"`. The model returns text → Kyklos stores it in the run’s outputs (and scores like `success_rate` come from whether any calls errored).

**`eval_bundle` in `kyklos.yaml`:** lists the same prompt + dataset paths so Kyklos can **hash** them into an **eval fingerprint** on each run (useful for “which prompt/data version was this?”). It does not change how a single request is built—that still comes from `agent.prompt` + each row’s `input`.

## Model

`kyklos.yaml` uses **`gemini-2.0-flash`**. If your key or region rejects it, change `agent.model` to **`gemini-1.5-flash`** and re-run.

## Run in Kyklos

### Option A — Git repository registered on the server

1. Push this project to GitHub/GitLab.
2. In `kyklos.yaml`, set `repository:` to your clone URL and branch (see commented block in the file), **or** register the repo in `kyklos-server.yaml` and set `repo_name` when creating the pipeline in the UI.
3. Ensure **`GOOGLE_API_KEY`** is set in the environment of the `kyklos` process (recommended), or rely on the `env:` mapping in `kyklos.yaml` which passes `$GOOGLE_API_KEY` from the host into the run.
4. Create the pipeline in the dashboard (paste YAML or sync from repo), then **Run** (branch/SHA optional).

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `google-generativeai not installed` | `pip install google-generativeai` in the step Python environment. |
| `API key not valid` / 400 from Google | Key, billing/quotas in AI Studio, and model name. |
| `dataset not found` | Run from a workspace whose root contains `data/hello.jsonl` (clone path or manual workspace). |

## License

Same as the parent Kyklos repository unless you replace this file in your own repo.
