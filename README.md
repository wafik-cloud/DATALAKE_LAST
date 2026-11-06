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


### Utilisateurs et sécurité

L’accès utilise des comptes nominatifs et des cookies de session HttpOnly (12 h maximum, 30 min d’inactivité). Les mots de passe sont hachés avec scrypt ; les jetons de session et de récupération sont stockés sous forme de SHA-256. L’ancienne clé ne donne plus accès aux API métier. Lorsque la base ne contient aucun utilisateur, elle sert uniquement à initialiser le premier administrateur depuis la connexion. Un changement du mot de passe initial est imposé.

Le menu **Administration → Utilisateurs & accès** permet de créer et désactiver les comptes, d’attribuer les écrans et les actions, de révoquer les sessions et de consulter le journal d’activité. Les changements d’accès ferment les sessions de l’utilisateur. Le dernier administrateur actif est protégé. Les droits sont vérifiés côté API ; masquer un bouton ne constitue pas la protection. **Mon compte & sécurité** permet de changer son mot de passe et fermer ses sessions. Le journal conserve les accès aux écrans et API ainsi que les paramètres métier sélectionnés, sans mots de passe ni jetons.

Configurer `APP_PUBLIC_URL` avec l’URL exacte du frontend, et `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD` pour les emails. SMTP exige TLS (465 ou STARTTLS). Les liens de récupération expirent après 30 minutes et sont à usage unique ; la récupération ferme les sessions existantes. En HTTPS, activer `COOKIE_SECURE=true`. Sans SMTP, la page Administration signale que les envois ne sont pas configurés.

Vérification des parcours d’authentification avec une **base isolée vide** : appliquer les migrations sur cette base, puis exécuter les tests API avec `DATABASE_URL` et `AUTH_TEST_DATABASE_URL` désignant cette même base. Ces tests créent leurs propres comptes et ne doivent jamais viser la production. L’envoi SMTP y est simulé ; le reste du parcours utilise PostgreSQL et HTTP réels.


### Logo institutionnel INRH

Les images `apps/web/public/inrh-logo.png` et `inrh-logo-white.png` sont les fichiers originaux utilisés dans l’en-tête du site officiel https://inrh.ma/, récupérés le 6 novembre 2026 sans modification :

- https://inrh.ma/storage/2025/02/logo-inrh-new-black.png
- https://inrh.ma/storage/2025/02/inrh_white_logo.png

Leurs proportions et leurs textes sont conservés. La variante blanche est utilisée sur les fonds bleus.


### Afficher un disque supplémentaire dans Maintenance

La supervision distingue le stockage actif (`/datalake`) du disque supplémentaire, qui reste en lecture seule. Configurer `DATALAKE_OBSERVED_DISK_DIR` avec le point de montage hôte, `OBSERVED_DISK_SOURCE` avec le périphérique attendu (ex. `/dev/sdb1`) et `OBSERVED_DISK_LABEL` avec son libellé (ex. `Disque de 7 To`). Monter le disque sur l’hôte avant de recréer le conteneur API depuis Git ; l’interface affichera aussi sa capacité et son mode d’accès. Ne pas réorienter les services de données vers ce volume pour une simple observation.

L’API vérifie la source du montage avant d’afficher sa capacité : un répertoire vide sur le disque système ne doit pas être présenté comme le disque supplémentaire. Si le montage est absent ou incorrect, le disque apparaît comme indisponible et les métriques des autres volumes restent visibles. Ce réglage ne rend pas le montage hôte persistant au redémarrage.
