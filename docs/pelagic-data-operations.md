# Exploitation Pelagic / MinIO — DATALAKE_LAST

## Interface admin

URL : http://localhost:5180 (ou la valeur de `WEB_PORT` dans `.env`)

Connexion avec la clé `ADMIN_API_KEY` définie dans `.env`.

Menu **Administration → Stockage et synchronisation** :

- Tableau de bord
- Configuration MinIO / Pelagic
- Imports manuels et sync quotidienne
- Historique des jobs
- Fichiers MinIO

## Synchronisation automatique

- CRON configurable en base (`pelagic_integration_settings`)
- Fuseau par défaut : `Africa/Casablanca`
- Chaque exécution importe **la veille** (trips + points)
- Anti-doublon : pas de re-import SUCCESS identique sans `force`

## Commandes

```bash
docker compose up -d --build
docker compose logs -f api
cd apps/api && npm test
```

## API utiles

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:5001/api/admin/dashboard
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:5001/api/admin/pelagic/sync/now
```

## Sauvegarde

- Volume Postgres : `datalake-last_postgres_data`
- Volume MinIO : `datalake-last_minio_data`
