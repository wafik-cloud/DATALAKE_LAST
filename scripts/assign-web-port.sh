#!/usr/bin/env bash
# Trouve le premier port TCP libre dans une plage et met à jour .env (WEB_PORT, APP_URL)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
START_PORT="${1:-5174}"
END_PORT="${2:-5300}"

find_free_port() {
  local p
  for ((p=START_PORT; p<=END_PORT; p++)); do
    if ! lsof -iTCP:"$p" -sTCP:LISTEN -P -n >/dev/null 2>&1; then
      echo "$p"
      return 0
    fi
  done
  echo "Aucun port libre entre ${START_PORT} et ${END_PORT}" >&2
  return 1
}

PORT="$(find_free_port)"
echo "Port libre détecté : ${PORT}"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "${ROOT_DIR}/.env.example" "$ENV_FILE"
  echo "Fichier .env créé depuis .env.example"
fi

if grep -q '^WEB_PORT=' "$ENV_FILE"; then
  sed -i '' "s/^WEB_PORT=.*/WEB_PORT=${PORT}/" "$ENV_FILE"
else
  echo "WEB_PORT=${PORT}" >> "$ENV_FILE"
fi

if grep -q '^APP_URL=' "$ENV_FILE"; then
  sed -i '' "s|^APP_URL=.*|APP_URL=http://localhost:${PORT}|" "$ENV_FILE"
else
  echo "APP_URL=http://localhost:${PORT}" >> "$ENV_FILE"
fi

echo "WEB_PORT=${PORT} et APP_URL=http://localhost:${PORT} enregistrés dans .env"
echo "Lancez : docker compose up -d web"
