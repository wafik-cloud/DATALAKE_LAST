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

## Démarrage rapide (infrastructure + API + UI)

```bash
cd /Users/M.WAFIK/CSID_projects/DATALAKE_LAST
cp .env.example .env
# Éditer .env : mots de passe + ADMIN_API_KEY + PELAGIC_API_TOKEN/SECRET

# Détecte un port libre pour l'interface web et démarre tout
bash scripts/start.sh
```

Ou manuellement :

```bash
bash scripts/assign-web-port.sh   # scanne 5174–5300, met à jour .env
docker compose up -d --build
```

L'URL de l'UI s'affiche à la fin (variable `WEB_PORT` dans `.env`).
- **API** : http://localhost:5001
- **Console MinIO** : http://localhost:9001

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

## Immatriculation des trajets Pelagic

Les imports `trips` enrichissent automatiquement chaque CSV avec
`registrationNumber`, `registrationAuthority`, `registrationExpiration`, `flag`
et `ownerName`. La jointure reprend le script fourni dans
`scripts/trip-registration/trips_with_registration.py` : appel à `boats/info`,
puis correspondance entre `Device Id` du trajet et `deviceId` du bateau.
`deviceInfo=true` est imposé pour ces imports, même si le paramètre est désactivé.
Les colonnes d'origine sont conservées et l'expiration est écrite en date UTC
`YYYY-MM-DD`. Le manifeste JSON indique `unmatchedBoatCount`.

Un appareil sans bateau correspondant laisse les cinq cellules vides.
L'affectation des appareils est celle d'aujourd'hui : un ancien trajet peut donc
recevoir l'immatriculation d'un autre bateau après un transfert d'appareil.
Les immatriculations sont recopiées telles que saisies dans Pelagic.
La période filtre la fin des trajets et une requête est limitée à 10 000 trajets.

Une période déjà importée sans ces colonnes sera réimportée lors de sa prochaine
synchronisation. Les anciens fichiers ne sont pas modifiés en place.
Les fichiers `points` gardent leur format actuel.

Validation locale : `cd apps/api && npm test && npm run build`.

## Sécurité

- Ne jamais committer `.env`
- Ne pas utiliser les valeurs `CHANGE_ME` en production
- Bucket `pelagic-data` privé ; téléchargements via URL pré-signées uniquement
