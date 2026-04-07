# Artifacts

In Kyklos, **artifacts** are **files** produced during a pipeline run that the engine can **persist** and expose for **download** and inspection. They complement **logs** and **scores**: they carry **binary or large text** outputs (reports, snapshots, exports) that should survive the run’s workspace.

---

## What are run artifacts?

- **Definition:** A path on disk (usually under the run **workspace**) that a **step** declares in its result. The server may **copy** that file into durable storage and record **metadata** (name, size, run id, stage, step).
- **Representation:** Artifacts are **files**, not chat messages. You download them via the **REST API** or the **dashboard** (per-run view or global **Artifacts** list).
- **Persistence:** Storage is **server-local** (configurable root). Artifacts are **not** embedded in SQLite as blobs—metadata points at files on disk.

---

## Why use artifacts?

1. **Keep eval outputs** — Save JSONL outputs, judge reports, or rendered charts for auditors and for **compare runs**.
2. **Debug faster** — Attach the exact file a step produced when a gate fails.
3. **Share with humans** — Exports (CSV, PDF, images) that are awkward to stuff into **scores** alone.
4. **Avoid recomputation** — Store expensive step outputs once and let downstream steps or reviewers consume them.

Session **logs** stream text; **scores** carry numbers and flags; **artifacts** carry **file-shaped** payloads.

---

## Common use cases

- **Dataset run outputs** — e.g. `outputs.jsonl` from a batch agent run.
- **Snapshot / diff results** — Files written by lint or snapshot steps.
- **Exported bundles** — Anything your step writes to a path under the workspace.

---

## Core concepts

### Logical names

Steps assign a **logical name** (via `logical_name` in the persisted record or the file basename, depending on the step). Use **clear, stable names** so the Artifacts list stays readable.

### Workspace paths

Artifact paths are almost always **relative to the workspace** (or absolute paths inside it). Keep outputs under a **known directory** (for example under `KYKLOS_ARTIFACTS_DIR` if your step uses it) so cleanup and permissions stay predictable.

### Versioning

Each **run** is its own generation of artifacts. **Compare** runs in the UI to see how outputs drift between commits or config changes—not version numbers inside a single filename, unless your step implements that.

### Namespacing

Artifacts are scoped to a **run** (and stage/step in metadata). There is no cross-run shared artifact namespace in the core product—treat each run as **isolated** unless you copy files elsewhere yourself.

---

## Interacting with artifacts

- **Dashboard — Run detail** — Lists artifacts for that run with download links.
- **Dashboard — Artifacts** — Cross-run list (when enabled) with filters.
- **API** — `GET` artifact file URLs under `/api/v1/runs/.../artifacts/.../file` (see your server version for exact paths).

![Artifact library (empty until steps persist files)](/screenshots/artifacts-library.png)

*Global **Artifacts** page: filters and empty state before any files are stored.*

**Prerequisite:** The server must have a writable **artifact store** and successful **persist** after the step (check server logs if files are missing).

---

## Best practices

To use artifacts effectively:

- **Stable paths in steps** — Write to deterministic paths your **`with:`** and downstream steps can reference.
- **Meaningful file names** — Include extensions (`.jsonl`, `.pdf`) so humans and tools recognize content; the engine still relies on correct step configuration for MIME if you add HTTP headers elsewhere.
- **Size awareness** — Very large outputs can fill disk on the artifact host; cap size in the step or split work.
- **Secrets** — Do not write tokens or raw credentials into artifact files; treat artifacts like **shared files** on the server.
- **Cleanup** — For long-lived servers, plan **disk retention** (rotation, external object storage) outside Kyklos if runs accumulate large files.
- **Error handling** — If a step lists an artifact path that does not exist, persistence may warn or skip; fix paths before relying on downloads.

---

## See also

- [Best practices](./best-practices) — pipelines and runs generally  
- [Scores, `from:`, and `pass_if`](./scores-from-and-pass-if) — structured metrics vs files  
- [Runs & workspaces](/concepts/runs-and-workspaces) — where files live during a run  
