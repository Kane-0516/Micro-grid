#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$REPO_ROOT/.tools/pelias-docker/projects/microgrid-us"
PELIAS_CMD="../../pelias"

run_pelias() {
  bash "$PELIAS_CMD" "$@"
}

pull_service() {
  docker compose pull "$@"
}

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "Missing Pelias project: $PROJECT_DIR"
  echo "Run: powershell -ExecutionPolicy Bypass -File .\\pelias\\setup-windows.ps1 -Region us"
  exit 1
fi

cd "$PROJECT_DIR"

run_pelias system check
pull_service openaddresses
run_pelias elastic start
run_pelias elastic wait
run_pelias download oa
run_pelias import oa
