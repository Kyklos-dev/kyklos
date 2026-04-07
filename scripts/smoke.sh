#!/usr/bin/env bash
# Quick smoke test against a running Kyklos server (default http://127.0.0.1:8080).
# Usage: ./scripts/smoke.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://127.0.0.1:8080}"

echo "GET ${BASE}/health"
curl -sfS "${BASE}/health" | head -c 400
echo
echo
echo "GET ${BASE}/api/v1/pipelines"
curl -sfS "${BASE}/api/v1/pipelines" | head -c 400
echo
echo
echo "smoke OK"
