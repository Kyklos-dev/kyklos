# FAQ

## Is Kyklos a hosted SaaS?

**No.** You run the **server** (release binary or from source). Data stays on **your** machine or cluster.

## How do I install it?

Use a **[GitHub Release](https://github.com/Kyklos-dev/kyklos/releases)** binary and follow **[Use a release](/getting-started)**. Building from Git clone is for **[contributors](/contributing/)**.

## Does the API require authentication?

**Not by default.** Assume **anyone who can reach the port** can use the API and UI. Use a **reverse proxy**, **VPN**, or **localhost-only** binding for real deployments.

## What Git providers work for webhooks?

**GitHub** and **GitLab** push hooks are supported when repos and secrets are configured. See server examples in the repo.

## Do I need Node.js to run Kyklos?

**No** for a **release binary** — Node is only needed to **build** the dashboard when developing the UI.

## Where is state stored?

**SQLite** by default (`~/.kyklos/kyklos.db`). Artifact **files** are stored under the server’s artifact directory (see logs on startup).

## Why do I still see old pipelines after installing or upgrading?

The **release binary** only replaces the **`kyklos` executable**. Your **database file** (pipelines, runs metadata, etc.) and **workspace directories** stay on disk. As long as the server opens the **same** SQLite path (default `~/.kyklos/kyklos.db`), the **dashboard shows the same history** as before.

To start fresh: stop Kyklos, **back up** the DB if you need it, then use a **new** database path, e.g. `kyklos -db ~/.kyklos/kyklos-clean.db`, or remove the old file after backup. You can also change **`workspace_root`** in `kyklos-server.yaml` so new Git workspaces do not reuse old folders.

## Security reports

See **[SECURITY.md](https://github.com/Kyklos-dev/kyklos/blob/main/SECURITY.md)** in the repository.
