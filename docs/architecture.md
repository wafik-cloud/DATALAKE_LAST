# Architecture — DATALAKE_LAST (Phase 1)

## Objectif

Centraliser les exports CSV Pelagic (trips / points) dans MinIO, avec traçabilité des traitements, relance en erreur, et console admin protégée.

## Schéma logique

```text
┌─────────────┐     HTTPS/JWT      ┌──────────────┐
│  apps/web   │ ◄────────────────► │   apps/api   │
│  (React)    │                    │  (Express)   │
└─────────────┘                    └──────┬───────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              ┌──────────┐         ┌──────────┐         ┌─────────────┐
              │ Postgres │         │  MinIO   │         │ Pelagic API │
              │  jobs    │         │ pelagic- │         │  (externe)  │
              │ settings │         │   data   │         └─────────────┘
              └──────────┘         └──────────┘
```

## Arborescence MinIO (bucket `pelagic-data`)

```text
pelagic-data/
├── trips/YYYY/MM/trips_{from}_{to}_{timestamp}.csv
├── points/YYYY/MM/points_{from}_{to}_{timestamp}.csv
├── manifests/YYYY/MM/manifest_{timestamp}.json
└── errors/YYYY/MM/error_{timestamp}.json
```

## Modèle `pelagic_import_jobs` (PostgreSQL)

Statuts : `PENDING` | `RUNNING` | `SUCCESS` | `FAILED` | `CANCELLED`

Champs principaux : période, type d’export, filtres (IMEI, tags), clé objet MinIO, checksum SHA-256, tentatives, message d’erreur (sans secrets).

## API admin (préfixe cible)

- `GET/POST /api/admin/storage/*` — statut MinIO, objets, URL pré-signée
- `GET/PUT/POST /api/admin/pelagic/*` — settings (masqués), test, sync, jobs

Toutes les routes admin : authentification + rôle **admin** + rate limit sur test/sync.

## Services backend (à créer)

| Service | Responsabilité |
|---------|----------------|
| `MinioStorageService` | upload stream, list, presign, testConnection |
| `PelagicDataService` | GET trips/points, retries, validation CSV |
| `PelagicImportOrchestrator` | job lifecycle, manifest, déduplication |
| `PelagicSyncScheduler` | cron `PELAGIC_SYNC_CRON`, veille (Casablanca) |

## Différences avec l’ancien projet INRH

| Sujet | Ancien (`inrh_data_platform-last`) | Nouveau (`DATALAKE_LAST`) |
|-------|--------------------------------------|---------------------------|
| BDD jobs | Mongo `History` / `Schedule` | PostgreSQL + Prisma |
| Secrets | En dur dans le code | `.env` uniquement |
| Init MinIO | Manuel | `minio-init` + utilisateur app |
| UI | Onglet unique dans `App.tsx` | Menu Administration structuré |
| Chemins MinIO | `inrh-raw/suivi-navires/...` | `pelagic-data/trips|points/...` |

## Prochaine étape (Phase 2 — validée par vous)

1. Tester `docker compose up` MinIO + Postgres  
2. Créer `apps/api` (squelette TypeScript + healthcheck)  
3. Implémenter `MinioStorageService` + test de connexion  

## Fichiers prévus (phases 3–8)

```text
apps/api/src/
  config/env.ts
  services/minioStorageService.ts
  services/pelagicDataService.ts
  services/pelagicImportOrchestrator.ts
  jobs/pelagicSyncScheduler.ts
  routes/admin/storageRoutes.ts
  routes/admin/pelagicRoutes.ts
  middleware/auth.ts
  middleware/requireAdmin.ts
prisma/schema.prisma

apps/web/src/
  pages/admin/storage/
  layouts/AdminLayout.tsx
  api/adminClient.ts

docs/minio-installation.md
docs/pelagic-data-integration.md
docs/pelagic-data-operations.md
```
