#!/bin/bash
set -euo pipefail
TAG="${1:-20260629-5ad4561}"
SRC_URL="${2:?SRC_URL is required}"
APP_ROOT="/opt/docker/pre-sale"
SRC_ROOT="${APP_ROOT}/src/MicroGrid-homerpro"
ARCHIVE="/tmp/microgrid-src-${TAG}.tgz"

echo "=== Download source archive ==="
curl -fsSL "${SRC_URL}" -o "${ARCHIVE}"
sudo mkdir -p "${APP_ROOT}/src"
sudo rm -rf "${SRC_ROOT}"
sudo tar -xzf "${ARCHIVE}" -C "${APP_ROOT}/src"
find "${SRC_ROOT}" -name '*.sh' -exec sed -i 's/\r$//' {} +
sudo chmod +x "${SRC_ROOT}/deploy/remote-deploy.sh"
sudo bash "${SRC_ROOT}/deploy/remote-deploy.sh" "${TAG}"
