#!/usr/bin/env bash
# Déploiement DATALAKE_LAST sur Ubuntu (172.16.10.101)
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/DATALAKE_LAST}"
REPO_URL="${REPO_URL:-https://github.com/wafik-cloud/DATALAKE_LAST.git}"

echo "=== DATALAKE_LAST — déploiement production ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker absent. Installation requise (sudo) :"
  echo "  sudo apt-get update"
  echo "  sudo apt-get install -y docker.io docker-compose-v2"
  echo "  sudo usermod -aG docker \$USER"
  echo "  # puis déconnectez-vous et reconnectez-vous"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker installé mais inaccessible. Essayez :"
  echo "  sudo systemctl start docker"
  echo "  newgrp docker"
  exit 1
fi

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Clone du dépôt dans $REPO_DIR ..."
  git clone "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR"
git pull origin main

if [ ! -f .env ]; then
  echo "Création de .env depuis .env.example — RENSEIGNEZ LES SECRETS avant prod !"
  cp .env.example .env
fi

if ! grep -q '^WEB_PORT=' .env; then
  echo 'WEB_PORT=5174' >> .env
fi

echo "Build et démarrage des conteneurs..."
docker compose up -d --build

echo "Migrations Prisma..."
docker compose exec -T api npx prisma migrate deploy

echo ""
echo "=== Vérification locale ==="
curl -sf "http://127.0.0.1:5001/health" && echo " API OK" || echo " API KO"
curl -sf -o /dev/null "http://127.0.0.1:${WEB_PORT:-5174}/" && echo " Web OK" || echo " Web KO"

WEB_PORT=$(grep '^WEB_PORT=' .env | cut -d= -f2- || echo 5174)
echo ""
echo "URLs (si firewall ouvert) :"
echo "  Web : http://$(hostname -I | awk '{print $1}'):${WEB_PORT}"
echo "  API : http://$(hostname -I | awk '{print $1}'):5001/health"
echo ""
docker compose ps
