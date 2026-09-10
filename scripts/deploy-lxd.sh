#!/usr/bin/env bash
# Déploiement DATALAKE_LAST via LXD (sans sudo sur l'hôte)
set -euo pipefail

CONTAINER="${CONTAINER:-datalake}"
PROJECT="${PROJECT:-$HOME/DATALAKE_LAST}"

echo "=== DATALAKE — déploiement LXD ==="

if ! command -v lxc >/dev/null 2>&1; then
  echo "LXC absent"; exit 1
fi

if [ ! -d "$PROJECT" ]; then
  echo "Projet absent: $PROJECT"; exit 1
fi

if lxc info "$CONTAINER" >/dev/null 2>&1; then
  echo ">>> Conteneur existant — redémarrage"
  lxc start "$CONTAINER" 2>/dev/null || true
else
  echo ">>> Création conteneur $CONTAINER"
  lxc launch ubuntu:24.04 "$CONTAINER" \
    -c security.nesting=true \
    -c security.privileged=true \
    -c limits.cpu=4 \
    -c limits.memory=8GB
fi

echo ">>> Attente démarrage..."
for _ in $(seq 1 60); do
  lxc exec "$CONTAINER" -- true 2>/dev/null && break
  sleep 2
done

echo ">>> Montage projet"
lxc config device remove "$CONTAINER" datalake-src 2>/dev/null || true
lxc config device add "$CONTAINER" datalake-src disk source="$PROJECT" path=/opt/DATALAKE_LAST

echo ">>> Installation Docker (dans le conteneur)"
lxc exec "$CONTAINER" -- bash -c '
  set -e
  export DEBIAN_FRONTEND=noninteractive
  if ! command -v docker >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y docker.io docker-compose-v2 curl
  fi
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker 2>/dev/null || service docker start
  else
    service docker start
  fi
  docker --version
  docker compose version
'

echo ">>> Redirection des ports vers l hôte"
lxc config device remove "$CONTAINER" api 2>/dev/null || true
lxc config device remove "$CONTAINER" web 2>/dev/null || true
lxc config device add "$CONTAINER" api proxy listen=tcp:0.0.0.0:5001 connect=tcp:127.0.0.1:5001
lxc config device add "$CONTAINER" web proxy listen=tcp:0.0.0.0:5174 connect=tcp:127.0.0.1:5174

echo ">>> Build et démarrage"
lxc exec "$CONTAINER" -- bash -c '
  set -e
  cd /opt/DATALAKE_LAST
  grep -q "^WEB_PORT=" .env || echo "WEB_PORT=5174" >> .env
  docker compose down 2>/dev/null || true
  docker compose up -d --build
  echo "Attente postgres..."
  sleep 15
  docker compose exec -T api npx prisma migrate deploy
'

echo ">>> Vérification"
lxc exec "$CONTAINER" -- bash -c '
  curl -sf http://127.0.0.1:5001/health && echo " API OK" || echo " API KO"
  curl -sf -o /dev/null http://127.0.0.1:5174/ && echo " Web OK" || echo " Web KO"
  docker compose -f /opt/DATALAKE_LAST/docker-compose.yml ps
'

IP=$(hostname -I | awk "{print \$1}")
echo ""
echo "=== Déployé ==="
echo "  Web : http://${IP}:5174"
echo "  API : http://${IP}:5001/health"
