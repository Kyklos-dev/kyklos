#!/usr/bin/env sh
# Install kyklos from GitHub Releases (Linux/macOS, amd64/arm64).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Kyklos-dev/kyklos/main/scripts/install.sh | sh
#
# If that URL 404s, clone the repo and run: sh scripts/install.sh
#
# Fork:
#   REPO=your-org/kyklos curl -fsSL ... | sh
#
# Optional:
#   VERSION=v0.1.0          # default: latest release
#   PREFIX=~/.local/bin   # install directory (default: /usr/local/bin)

set -e

REPO="${REPO:-Kyklos-dev/kyklos}"
VERSION="${VERSION:-latest}"
PREFIX="${PREFIX:-/usr/local/bin}"

case "$(uname -s)" in
  Linux*) OS=linux ;;
  Darwin*) OS=darwin ;;
  *)
    echo "install.sh: unsupported OS $(uname -s). Download a release asset manually from GitHub."
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) ARCH=amd64 ;;
  arm64 | aarch64) ARCH=arm64 ;;
  *)
    echo "install.sh: unsupported CPU $(uname -m). Download a release asset manually from GitHub."
    exit 1
    ;;
esac

fetch_latest_tag() {
  _json=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest") || return 1
  _tag=$(printf '%s' "$_json" | tr -d '\n' | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  if [ -z "$_tag" ]; then
    return 1
  fi
  printf '%s\n' "$_tag"
}

if [ "$VERSION" = "latest" ]; then
  if ! TAG=$(fetch_latest_tag); then
    echo "install.sh: could not read latest release from https://api.github.com/repos/${REPO}/releases/latest"
    echo "  Set VERSION explicitly:  VERSION=v0.1.0 sh $0"
    exit 1
  fi
else
  TAG="${VERSION}"
fi

case "$TAG" in
  v*) ;;
  *) TAG="v${TAG}" ;;
esac

# Reject empty, bare "v", or API error bodies where tag never resolved
case "$TAG" in
  v?*) ;;
  *)
    echo "install.sh: could not resolve a release tag for https://github.com/${REPO}/releases"
    echo "  (got '${TAG}'). Check REPO, network, and GitHub API rate limits."
    echo "  Or set an explicit tag:  VERSION=v0.1.0 sh install.sh"
    exit 1
    ;;
esac

NAME="kyklos-${OS}-${ARCH}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${TAG}/${NAME}"

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

echo "Downloading ${URL}"
curl -fL --retry 3 --retry-delay 1 -o "$TMP" "$URL"

EX=$(mktemp -d)
trap 'rm -rf "$EX"; rm -f "$TMP"' EXIT
tar xzf "$TMP" -C "$EX"

mkdir -p "$PREFIX"
if [ -w "$PREFIX" ]; then
  install -m 0755 "$EX/kyklos" "${PREFIX}/kyklos"
else
  echo "install.sh: ${PREFIX} is not writable; try PREFIX=\$HOME/.local/bin or use sudo PREFIX=${PREFIX}"
  exit 1
fi

echo "Installed kyklos ${TAG} to ${PREFIX}/kyklos"
echo "Ensure ${PREFIX} is on your PATH."
