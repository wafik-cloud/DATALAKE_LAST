# Installation MinIO — DATALAKE_LAST

## Prérequis

- Docker et Docker Compose
- Fichier `.env` copié depuis `.env.example`

## Démarrage

```bash
cd /Users/M.WAFIK/CSID_projects/DATALAKE_LAST
cp .env.example .env
# Éditer MINIO_ROOT_PASSWORD, POSTGRES_PASSWORD, ADMIN_API_KEY

docker compose up -d postgres minio minio-init api
docker compose ps
docker compose logs -f minio
```

## Ports

| Service | URL |
|---------|-----|
| API S3 | http://localhost:9000 |
| Console MinIO | http://localhost:9001 |
| API applicative | http://localhost:5001 |

## Vérification

```bash
curl http://localhost:5001/health

curl -H "X-Admin-Key: VOTRE_ADMIN_API_KEY" \
  http://localhost:5001/api/admin/storage/test

curl -H "X-Admin-Key: VOTRE_ADMIN_API_KEY" \
  http://localhost:5001/api/admin/storage/status
```

## Bucket

Le service `minio-init` crée automatiquement le bucket défini dans `MINIO_BUCKET` (défaut : `pelagic-data`).

## Sauvegarde

Volume Docker : `datalake-last_minio_data`

```bash
docker run --rm -v datalake-last_minio_data:/data -v $(pwd)/backups:/backup alpine \
  tar czf /backup/minio-$(date +%Y%m%d).tar.gz -C /data .
```

## Arrêt

```bash
docker compose down
```

Pour supprimer les données : `docker compose down -v` (destructif).
