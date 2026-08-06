#!/bin/bash
set -euo pipefail
echo "=== DEPLOY DIR ==="
ls -la /opt/docker/pre-sale/deploy
echo "=== APP ENV ==="
cat /opt/docker/pre-sale/deploy/.env
echo "=== PELIAS ENV ==="
cat /opt/docker/pre-sale/deploy/.env.pelias 2>/dev/null || true
echo "=== DOCKER PS ==="
docker ps -a
echo "=== DOCKER IMAGES ==="
docker images
echo "=== ARTIFACTS ==="
ls -la /opt/docker/pre-sale/deploy/artifacts 2>/dev/null || true
echo "=== RECENT FILES ==="
ls -lt /opt/docker/pre-sale/deploy | head -15
echo "=== COMPOSE FILES ==="
ls -la /opt/docker/pre-sale/deploy/*.yml
