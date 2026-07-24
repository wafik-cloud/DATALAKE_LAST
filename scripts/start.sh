#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

bash scripts/assign-web-port.sh
docker compose up -d --build "$@"

source .env 2>/dev/null || true
echo ""
echo "UI Admin : http://localhost:${WEB_PORT:-?}"
echo "API      : http://localhost:${API_PORT:-5001}"
