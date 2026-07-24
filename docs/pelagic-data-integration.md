# Intégration Pelagic Data — DATALAKE_LAST

## Configuration

Variables dans `.env` :

- `PELAGIC_API_TOKEN` / `PELAGIC_API_SECRET`
- `PELAGIC_SYNC_*` pour la planification (phase 6)
- `DATABASE_URL` pour le suivi des jobs

## Endpoints admin (header `X-Admin-Key`)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/admin/pelagic/settings` | Config masquée |
| POST | `/api/admin/pelagic/test` | Test API (hier, non persisté) |
| POST | `/api/admin/pelagic/sync` | Import manuel trips/points |
| GET | `/api/admin/pelagic/jobs` | Historique des traitements |
| GET | `/api/admin/pelagic/jobs/:id` | Détail |
| POST | `/api/admin/pelagic/jobs/:id/retry` | Relance forcée |
| POST | `/api/admin/pelagic/jobs/:id/cancel` | Annulation |

## Exemple sync manuelle

```bash
curl -X POST http://localhost:5001/api/admin/pelagic/sync \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: VOTRE_CLE" \
  -d '{
    "dateFrom": "2026-07-20",
    "dateTo": "2026-07-22",
    "exportTypes": ["trips", "points"],
    "force": false,
    "intervalDays": 1
  }'
```

## Flux

1. Création job `PENDING` en base  
2. Téléchargement CSV Pelagic (retries, validation)  
3. Upload MinIO `pelagic-data/trips|points/YYYY/MM/...`  
4. Manifeste JSON dans `manifests/`  
5. Job `SUCCESS` ou `FAILED` (+ fichier `errors/` si échec)

## Migrations

```bash
cd apps/api
npm install
npx prisma migrate deploy
```

## Tests

```bash
cd apps/api
npm test
```
