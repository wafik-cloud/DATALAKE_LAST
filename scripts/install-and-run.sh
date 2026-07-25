#!/usr/bin/env bash
# À exécuter SUR le serveur 172.16.10.101 après : ssh srv-datalake-prod
# Usage : bash scripts/install-and-run.sh   (demande le mot de passe sudo une fois)
set -euo pipefail

cd ~/DATALAKE_LAST || { echo "Erreur: ~/DATALAKE_LAST absent. git clone https://github.com/wafik-cloud/DATALAKE_LAST.git ~/DATALAKE_LAST"; exit 1; }

echo "=== 1/5 Docker ==="
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y docker.io docker-compose-v2 git curl
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
  echo ">>> Docker installé. Si 'permission denied' ensuite : exit puis reconnectez-vous SSH."
fi

echo "=== 2/5 Code ==="
git pull origin main
chmod +x scripts/*.sh 2>/dev/null || true

echo "=== 3/5 .env ==="
if [ ! -f .env ]; then
  cp .env.example .env
  echo "ATTENTION: éditez .env avec les vrais secrets : nano .env"
  exit 1
fi
grep -q '^WEB_PORT=' .env || echo 'WEB_PORT=5174' >> .env

echo "=== 4/5 Conteneurs ==="
docker compose up -d --build
docker compose exec -T api npx prisma migrate deploy

echo "=== 5/5 Firewall (optionnel) ==="
sudo ufw allow 5174/tcp 2>/dev/null || true
sudo ufw allow 5001/tcp 2>/dev/null || true

echo ""
echo "=== Vérification ==="
curl -sf http://127.0.0.1:5001/health && echo " API OK" || echo " API KO"
curl -sf -o /dev/null http://127.0.0.1:5174/ && echo " Web OK" || echo " Web KO"
docker compose ps
IP=$(hostname -I | awk '{print $1}')
echo ""
echo "Accès : http://${IP}:5174  et  http://${IP}:5001/health"
