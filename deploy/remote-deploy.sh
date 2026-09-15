#!/bin/bash
set -euo pipefail

TAG="${1:-20260629-5ad4561}"
APP_ROOT="/opt/docker/pre-sale"
SRC_ROOT="${APP_ROOT}/src/MicroGrid-homerpro"
DEPLOY_DIR="${APP_ROOT}/deploy"
ARTIFACTS_DIR="${DEPLOY_DIR}/artifacts"

echo "=== Deploy tag: ${TAG} ==="
cd "${SRC_ROOT}"

echo "=== Build backend image ==="
sudo docker build -t "microgrid-backend:${TAG}" ./backend

echo "=== Build frontend image ==="
sudo docker build -t "microgrid-frontend:${TAG}" ./frontend

echo "=== Export image archives ==="
mkdir -p "${ARTIFACTS_DIR}"
sudo docker save -o "${ARTIFACTS_DIR}/microgrid-backend_${TAG}.tar" "microgrid-backend:${TAG}"
sudo docker save -o "${ARTIFACTS_DIR}/microgrid-frontend_${TAG}.tar" "microgrid-frontend:${TAG}"

echo "=== Update app env ==="
cat > "${DEPLOY_DIR}/.env" <<EOF
BACKEND_IMAGE=microgrid-backend:${TAG}
FRONTEND_IMAGE=microgrid-frontend:${TAG}

BACKEND_PORT=6001
FRONTEND_PORT=8081

CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
REPORT_TEMPLATE_DIR=/opt/docker/pre-sale/report_templates

GEOCODER_DEFAULT_REGION=us
GEOCODER_API_URL=http://172.31.21.149:4000/v1/search
GEOCODER_REVERSE_API_URL=http://172.31.21.149:4000/v1/reverse
GEOCODER_API_URL_CN=http://172.31.21.149:4000/v1/search
GEOCODER_REVERSE_API_URL_CN=http://172.31.21.149:4000/v1/reverse
GEOCODER_API_URL_US=http://172.31.21.149:4000/v1/search
GEOCODER_REVERSE_API_URL_US=http://172.31.21.149:4000/v1/reverse

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
INTERNAL_REPORT_EMAIL_DOMAINS=voltageenergy.com
INTERNAL_REPORT_EMAILS=
EOF

echo "=== Sync deploy configs ==="
cp -f "${SRC_ROOT}/deploy/nginx.frontend.conf" "${DEPLOY_DIR}/nginx.frontend.conf"
cp -f "${SRC_ROOT}/deploy/docker-compose.app.yml" "${DEPLOY_DIR}/docker-compose.app.yml"
cp -f "${SRC_ROOT}/deploy/docker-compose.pelias.yml" "${DEPLOY_DIR}/docker-compose.pelias.yml"
if [ -f "${SRC_ROOT}/deploy/docker-compose.app.override.yml" ]; then
  cp -f "${SRC_ROOT}/deploy/docker-compose.app.override.yml" "${DEPLOY_DIR}/docker-compose.app.override.yml"
fi
if [ -f "${SRC_ROOT}/deploy/pelias/pelias.json" ]; then
  mkdir -p "${DEPLOY_DIR}/pelias"
  cp -f "${SRC_ROOT}/deploy/pelias/pelias.json" "${DEPLOY_DIR}/pelias/pelias.json"
fi

echo "=== Restart app stack ==="
cd "${DEPLOY_DIR}"
sudo docker compose --env-file .env -f docker-compose.app.yml -f docker-compose.app.override.yml up -d --force-recreate backend frontend

echo "=== Restart Pelias stack ==="
sudo docker compose --env-file .env.pelias -f docker-compose.pelias.yml up -d

echo "=== Health checks ==="
sleep 8
curl -fsS http://127.0.0.1:6001/api/health
curl -fsS "http://127.0.0.1:4000/v1/search?text=Ohio&size=1" >/dev/null
curl -fsS http://127.0.0.1:8081/ >/dev/null
curl -fsS http://127.0.0.1:8081/product-config >/dev/null

echo "=== Deploy complete: ${TAG} ==="
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | sed -n '1,20p'
