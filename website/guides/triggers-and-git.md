# Triggers & Git

## Trigger types

| Trigger | Behavior |
|---------|----------|
| **manual** | Start runs from the dashboard or API when you choose. The API may include **`workspace_path`** to use a **local directory** and skip git (development shortcut). |
| **push** | After you register repos and webhook secrets on the server, pushes matching your branch rules can start runs. |
| **schedule** | **Cron** expressions under `triggers` for periodic runs (with registered repos / workspace rules as applicable). |

## Where code comes from

- **Server `repos:`** — registered in `kyklos-server.yaml` for shared checkout + webhook identity.
- **Pipeline `repository:`** — per-pipeline Git URL + branch + token env for cloning into the **run workspace**.

Kyklos ties **runs** to **git refs** (SHA/branch) when the workspace is populated from Git, so you can relate scores to **code state**.

## Dashboard Git workspaces

The **Workspaces** screen in the UI is for **named Git remotes** you configure once (URL + token environment variable, same as the server process). From there you can:

- **Scan branches** to refresh the list from the remote.
- **Attach pipelines** to a workspace so runs use that repo context.
- **Load `kyklos.yaml` from a branch** into the pipeline editor (uses the server git cache under **`server.workspace_root`** — if the branch list is empty, run **Scan branches** first).
- **Run on a selected branch** when starting a manual run from the dashboard.

This is separate from the **filesystem workspace directory** each run uses; see [Runs & workspaces](/concepts/runs-and-workspaces).

## Path filters

Finer-grained path-based push filters are a natural extension; check the release notes and repo for current behavior on **`paths`** under triggers.

## See also

- [Pipelines](/guides/pipelines/) — YAML reference and [code examples](/guides/pipelines/code-examples)
- [Configuration](/guides/configuration) — `kyklos-server.yaml` and `repository:`
