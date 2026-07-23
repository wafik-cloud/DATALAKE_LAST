# DATALAKE_LAST

Plateforme de stockage objet (**MinIO**) et synchronisation automatisée des exports **Pelagic Data** (trajets et points GPS), avec interface d’administration et suivi des imports.

Projet créé **from scratch** — indépendant de `inrh_data_platform-last`.

## Stack prévue

| Couche | Choix |
|--------|--------|
| API | Node.js 22 + Express + TypeScript |
| Web | React 19 + Vite + TypeScript |
| Base | PostgreSQL 16 + Prisma (migrations, `pelagic_import_jobs`) |
| Objet | MinIO (S3-compatible) |
| Planification | `node-cron` + fuseau `Africa/Casablanca` |
| Auth admin | JWT session/API (Keycloak optionnel plus tard) |

## Démarrage rapide (infrastructure + API)

```bash
cd /Users/M.WAFIK/CSID_projects/DATALAKE_LAST
cp .env.example .env
# Éditer .env : mots de passe + ADMIN_API_KEY

docker compose up -d postgres minio minio-init api
docker compose ps
```

Test :

```bash
curl http://localhost:5001/health
curl -H "X-Admin-Key: VOTRE_CLE" http://localhost:5001/api/admin/storage/test
```

Développement local API :

```bash
cd apps/api && npm install && npm run dev
```

## Structure du dépôt (cible)

```text
DATALAKE_LAST/
├── apps/
│   ├── api/          # Backend REST + jobs Pelagic
│   └── web/          # Interface (menu Administration)
├── docs/             # Installation, intégration, exploitation
├── docker-compose.yml
├── .env.example
└── README.md
```

## Phases de réalisation

1. **Analyse** — `docs/architecture.md`
2. **Docker / MinIO** — `docker-compose.yml`, `.env.example`
3. **Backend MinIO** — service S3, routes `/api/admin/storage/*`
4. **Client Pelagic** — trips, points, validation CSV
5. **BDD** — Prisma, jobs, settings
6. **Automatisation** — cron quotidien, anti-doublons, verrous
7. **UI Administration** — tableau de bord, historique, fichiers
8. **Sécurité, tests, documentation**

## Commandes utiles

```bash
docker compose up -d minio minio-init
docker compose logs -f minio
docker compose down
```

## Sécurité

- Ne jamais committer `.env`
- Ne pas utiliser les valeurs `CHANGE_ME` en production
- Bucket `pelagic-data` privé ; téléchargements via URL pré-signées uniquement
