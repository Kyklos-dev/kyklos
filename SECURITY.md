# Security

## Supported versions

Security fixes are applied to the default branch (`main` / `master`) and released as new tagged versions when appropriate. Use the [latest release](https://github.com/kyklos/kyklos/releases) for production.

## Reporting a vulnerability

Please **do not** open a public issue for security reports.

- Use **GitHub → Security → Report a vulnerability** on this repository (if available), or
- Contact the maintainers privately with a clear description, affected versions, and reproduction steps.

## Deployment note

The Kyklos HTTP API and dashboard **do not include authentication** by default. Run behind a reverse proxy with auth/TLS, or on trusted networks only.
