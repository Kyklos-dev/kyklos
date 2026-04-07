# FAQ

## Is Kyklos a hosted SaaS?

**No.** You run the **server** (release binary or from source). Data stays on **your** machine or cluster.

## How do I install it?

Use a **[GitHub Release](https://github.com/kyklos/kyklos/releases)** binary and follow **[Use a release](/getting-started)**. Building from Git clone is for **[contributors](/contributing/)**.

## Does the API require authentication?

**Not by default.** Assume **anyone who can reach the port** can use the API and UI. Use a **reverse proxy**, **VPN**, or **localhost-only** binding for real deployments.

## What Git providers work for webhooks?

**GitHub** and **GitLab** push hooks are supported when repos and secrets are configured. See server examples in the repo.

## Do I need Node.js to run Kyklos?

**No** for a **release binary** — Node is only needed to **build** the dashboard when developing the UI.

## Where is state stored?

**SQLite** by default (`~/.kyklos/kyklos.db`). Artifact **files** are stored under the server’s artifact directory (see logs on startup).

## Security reports

See **[SECURITY.md](https://github.com/kyklos/kyklos/blob/main/SECURITY.md)** in the repository.
