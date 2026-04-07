#!/usr/bin/env sh
# Install kyklos from GitHub Releases (Linux/macOS, amd64/arm64).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/scripts/install.sh | sh
# Or with a fork:
#   REPO=myfork/kyklos curl -fsSL ... | sh
#
# Optional:
#   VERSION=v0.1.0   # default: latest release
#   PREFIX=~/.local/bin   # install directory (default: /usr/local/bin)

set -e

REPO="${REPO:-kyklos/kyklos}"
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

if [ "$VERSION" = "latest" ]; then
  TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
else
  TAG="${VERSION}"
fi

case "$TAG" in
  v*) ;;
  *) TAG="v${TAG}" ;;
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
