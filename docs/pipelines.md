# Pipeline YAML (`kyklos.yaml`)

Full explanations of stages, steps, `pass_if`, `on_fail`, triggers, `eval_bundle`, and built-in steps are in the **[User guide](user-guide.md)** (sections 6–8).

**Practical starting points in this repository:**

- `examples/hello-world.yaml` — end-to-end pipeline with multiple stages.
- `examples/multi-stage-mock.yaml` — staged flow without external services.
- Other files under `examples/` — retries, metrics, long-running tests, LLMOps-style patterns.

The YAML schema matches the types in `internal/config/schema.go` if you need field-level detail.

**Dashboard:** You can paste YAML manually or **load `kyklos.yaml` from a Git branch** after setting up a workspace on the **Workspaces** page (see **§7.1** in the [User guide](user-guide.md)).
