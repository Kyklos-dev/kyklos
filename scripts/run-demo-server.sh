#!/usr/bin/env bash
# Start Kyklos with a dedicated SQLite DB and workspace dir under the repo (for demos / screenshots).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export KYKLOS_STEPS_DIR="${KYKLOS_STEPS_DIR:-$ROOT/steps}"

DATA="$ROOT/.demo-screenshots"
mkdir -p "$DATA/workspaces"

CFG="$DATA/kyklos-server.generated.yaml"
cat > "$CFG" <<EOF
server:
  bind: "127.0.0.1:8080"
  workspace_root: "$DATA/workspaces"
  python_venv: "${KYKLOS_PYTHON_VENV:-}"
EOF

DB="$DATA/kyklos.db"
rm -f "$DB"

echo "KYKLOS_STEPS_DIR=$KYKLOS_STEPS_DIR"
echo "config=$CFG"
echo "db=$DB"
echo "Dashboard: http://127.0.0.1:8080/"
echo "In another terminal: python3 scripts/seed-demo-data.py"
exec go run ./cmd/kyklos -config "$CFG" -db "$DB"
