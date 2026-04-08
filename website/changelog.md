# Changelog

High-level notes for **documentation and packaging**. For the full commit history, see the [GitHub repository](https://github.com/Kyklos-dev/kyklos).

## v0.1.1

- **Install script:** `scripts/install.sh` defaults to repo **`Kyklos-dev/kyklos`**, validates the release tag from the GitHub API (avoids broken `…/download/v/…` URLs), and fails with a clear message if the latest release cannot be resolved.
- **Docs:** README and this site emphasize **using a [GitHub Release](https://github.com/Kyklos-dev/kyklos/releases)** first; **clone + build** is documented for **[contributors](/contributing/)** only.
- **Binary version:** Server reports **`0.1.1`** in `/health` and run context (see release assets for prebuilt binaries).

## v0.1.0

- First public **GitHub Release** with cross-platform archives (Linux amd64/arm64, macOS amd64/arm64, Windows amd64) and `checksums-sha256.txt`.
- **Use a release** flow: install binary, set **`KYKLOS_STEPS_DIR`** to a checkout of the repo’s **`steps/`** at the **same tag** as the binary (or your own compatible tree).

---

Older development history lives in git; this page is updated when releases or user-facing install/docs behavior change in a meaningful way.
