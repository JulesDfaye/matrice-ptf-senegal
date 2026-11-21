# MATRICE PARTENAIRE ET PTF SÉNÉGAL — Full-stack Cloudflare

Version structurée pour VS Code, GitHub et Cloudflare Workers + D1. Le front-end conserve l'interface de la plateforme (Accueil Sénégal, Tableau de bord, Matrice, Partenaires, Activités, Indicateurs, Recherche, Sauvegarde et Paramètres). Le serveur Hono sécurise l'accès par session et enregistre les données utilisateur dans D1.

## 1. Arborescence

```text
matrice-ptf-cloudflare/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD GitHub Actions facultatif
├── migrations/
│   ├── 0001_initial_schema.sql # Schéma D1 + compte initial
│   └── 0002_roles_publication.sql # Profils, permissions et vitrine
├── public/
│   ├── index.html              # Accueil Sénégal + application privée
│   ├── vitrine.html            # Espace visiteur public
│   └── assets/
│       ├── css/styles.css      # Styles modulaires de l'interface
│       └── js/app.js           # Interactions et synchronisation D1
├── api/
│   └── index.js                # API Hono exécutée dans Cloudflare Workers
├── .dev.vars.example           # Exemple de variables locales (aucun secret réel)
├── .gitignore
├── README.md                   # Guide complet d'installation et de déploiement
├── README_FIRST_STEPS.txt      # Démarrage rapide
├── package.json
├── jsconfig.json
├── tests/
│   ├── api-smoke.http          # Requêtes de test API
│   └── roles-smoke.http        # Tests des rôles et de la vitrine
└── wrangler.toml               # Worker, actifs statiques et binding D1
```

## 2. Prérequis

- Node.js 22 LTS ou une version Active/Maintenance prise en charge par Wrangler.
- npm, Visual Studio Code, un compte Cloudflare et un compte GitHub.
- Une connexion Internet pour installer les dépendances et utiliser les bibliothèques Excel/Chart.js chargées par CDN.

## 3. Ouverture dans VS Code

1. Décompressez le ZIP dans un dossier de travail.
2. Dans VS Code, faites **Fichier → Ouvrir le dossier** et sélectionnez `matrice-ptf-cloudflare`.
3. Ouvrez le terminal intégré et exécutez :

```bash
npm install
npm run check
```

## 4. Créer la base Cloudflare D1

Connectez Wrangler à votre compte Cloudflare :

```bash
npx wrangler login
```

Créez la base :

```bash
npm run db:create
```

Wrangler retourne un identifiant `database_id`. Ouvrez `wrangler.toml` et remplacez :

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

par l'identifiant retourné. Conservez exactement le nom de base `matrice-ptf-senegal` et le binding `DB`.

Appliquez le schéma, le compte initial, puis les rôles et la vitrine :

```bash
npm run db:migrate:remote
```

Pour le développement local, préparez la base locale :

```bash
npm run db:migrate:local
```

Les migrations sont versionnées dans `migrations/`. Après une évolution du schéma, ajoutez une migration SQL supplémentaire au lieu de modifier une migration déjà appliquée.

## 5. Identifiants initiaux et sécurité

Après la migration initiale, le compte de première connexion est :

- Nom d'utilisateur : `admin`
- Mot de passe temporaire : `admin123`

Le mot de passe n'est pas stocké en clair : la migration insère un hash PBKDF2-SHA-256 (310 000 itérations, sel propre au compte initial). Le premier accès impose un changement de mot de passe avant d'ouvrir la plateforme. Le nouveau mot de passe doit comporter au moins 10 caractères et sa confirmation est demandée.

Les sessions utilisent un jeton aléatoire opaque, dont seul le hash est stocké dans D1, avec un cookie `HttpOnly`, `SameSite=Strict` et `Secure` en HTTPS. Les routes de modification vérifient l'origine de la requête. Les tentatives de connexion sont limitées après cinq échecs sur une fenêtre de 15 minutes.

## 6. Démarrer en local

```bash
npm run dev
```

Ouvrez l'URL locale donnée par Wrangler (par défaut `http://localhost:8787`). La connexion locale utilise la base D1 simulée de Wrangler. Connectez-vous avec les identifiants initiaux. Les données sont conservées dans la D1 locale pendant le développement.

Le fichier HTML peut aussi être ouvert directement, mais dans ce cas l'application fonctionne en **mode local navigateur** avec `localStorage` et les routes API/D1 ne sont pas utilisées. Pour tester l'API, utilisez toujours `npm run dev`.

## 7. Déployer manuellement

Après avoir créé la D1 distante et appliqué les migrations :

```bash
npm run check
npm run deploy
```

Wrangler publie le Worker et le dossier `public/` dans la même application. Les actifs statiques sont servis par Cloudflare et `/api/*` est routé vers Hono.

## 8. Déploiement continu GitHub

### Option A — Cloudflare Workers Builds (intégration native)

1. Créez un dépôt GitHub, par exemple `matrice-ptf-senegal`.
2. Depuis la racine du dossier dans le terminal :

```bash
git init
git add .
git commit -m "Initialisation plateforme MATRICE PTF Sénégal"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/matrice-ptf-senegal.git
git push -u origin main
```

3. Ouvrez le tableau de bord Cloudflare → **Workers & Pages** → **Create application** → **Connect to Git** / **GitHub**.
4. Autorisez Cloudflare à accéder au dépôt puis sélectionnez le dépôt et la branche `main`.
5. Vérifiez que le projet utilise `wrangler.toml` à la racine et que le nom Worker reste `matrice-ptf-senegal`.
6. Configurez la commande de build `npm install && npm run check` et la commande de déploiement `npm run deploy`.
7. Enregistrez et lancez le premier déploiement. Les prochains `git push` sur `main` déclencheront automatiquement une nouvelle publication.

### Option B — GitHub Actions (alternative)

Le fichier `.github/workflows/deploy.yml` est inclus. Choisissez cette option si vous préférez gérer le pipeline dans GitHub Actions. Dans GitHub → Settings → Secrets and variables → Actions, ajoutez :

- `CLOUDFLARE_API_TOKEN` : jeton avec les droits de déploiement Workers et d'accès nécessaire aux ressources D1.
- `CLOUDFLARE_ACCOUNT_ID` : identifiant du compte Cloudflare.

Poussez ensuite sur `main`. **N'activez pas en même temps les deux mécanismes** pour éviter deux déploiements concurrents du même Worker.

## 9. API disponible

Toutes les routes de données ci-dessous exigent une session authentifiée, sauf `/api/health` et `/api/auth/login`.

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | Santé du Worker |
| POST | `/api/auth/login` | Ouvrir une session |
| GET | `/api/auth/me` | Utilisateur courant |
| POST | `/api/auth/logout` | Fermer la session |
| POST | `/api/auth/change-password` | Modifier le mot de passe |
| GET / PUT | `/api/state` | Charger ou synchroniser l'état complet de l'application |
| GET / POST | `/api/collections/partners` | Lire/créer les partenaires de la matrice |
| GET / POST | `/api/collections/partner-profiles` | Lire/créer les fiches partenaires via la collection `partenairesFiches` dans l'état |
| GET / POST | `/api/collections/activities` | Lire/créer les activités |
| GET / PUT | `/api/collections/indicators` | Lire/enregistrer les indicateurs |
| GET / PUT | `/api/collections/settings` | Lire/enregistrer la configuration |
| PUT /api/profile | Modifier les informations utilisateur |

Les routes de collection REST sont génériques ; le front-end actuel synchronise l'état complet par `/api/state` pour préserver le modèle de données historique, tandis que les opérations CRUD ciblées sont disponibles pour les intégrations futures.

## 10. Base de données

- `users` : identifiants et profil utilisateur.
- `sessions` : sessions utilisateur, jeton hashé et expiration.
- `platform_records` : enregistrements JSON par collection, indexés par utilisateur.
- `login_attempts` : limitation des tentatives de connexion.
- `audit_log` : événements de connexion, déconnexion, changement de profil et mot de passe.

`platform_records` conserve les structures métiers déjà utilisées par l'interface afin de faciliter la migration de la version HTML historique. Les champs de mot de passe ne sont jamais synchronisés dans cette table.

## 11. Points d'attention

- Remplacez le `database_id` fictif dans `wrangler.toml` par celui de votre D1.
- Ne versionnez jamais `.dev.vars`, jetons Cloudflare, mots de passe ou autres secrets.
- Le compte temporaire `admin/admin123` doit être sécurisé immédiatement après le premier accès.
- L'application conserve une copie locale de confort dans `localStorage` et synchronise les modifications vers D1 lorsqu'une session Cloudflare est active. La sauvegarde JSON et l'export Excel restent disponibles.
- Faites une sauvegarde JSON avant toute opération de migration ou de réinitialisation importante.

## 10. Profils Admin, Utilisateur et Visiteur

La migration `0002_roles_publication.sql` ajoute les rôles, permissions, publications publiques et journaux d'audit. Exécutez-la avec :

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

- **Admin** : compte principal `admin` et comptes explicitement promus ; gestion des utilisateurs, permissions, paramètres et publications.
- **Utilisateur** : compte créé par l'Admin ; droits de lecture/écriture attribués par module. Le serveur vérifie les droits à chaque API métier.
- **Visiteur** : aucun compte requis ; accès à `/vitrine.html` et uniquement aux éléments explicitement publiés par l'Admin.

Les enregistrements métiers existants du compte principal restent dans D1 et sont partagés aux utilisateurs autorisés. Les données ne sont pas copiées dans un espace individuel par utilisateur. Les réglages de la plateforme restent réservés à l'Admin.

### Gestion depuis l'interface
Après connexion en Admin, ouvrez **Gestion des utilisateurs** pour créer un compte utilisateur, définir ses permissions, l'activer ou le désactiver. Dans la même page, utilisez **Publier sur la vitrine publique** pour diffuser un résumé, un partenaire, une activité, un plan d'action, une réalisation ou un chiffre clé. Une publication peut être masquée sans être supprimée.

La vitrine publique est accessible à `/vitrine.html`. Le lien « Découvrir la vitrine publique » est également présent sur l'écran de connexion.

### Points de sécurité
- Le rôle visiteur n'est jamais authentifié et ne dispose d'aucune API de lecture interne.
- Les permissions sont vérifiées côté Worker ; masquer un bouton dans l'interface n'est pas considéré comme une protection.
- Les paramètres et les sauvegardes globales restent réservés à l'Admin.
- Les champs publiés sont filtrés par liste blanche ; ne saisissez pas de données personnelles ou confidentielles dans une publication.
- Le mot de passe initial `admin123` est temporaire et doit être remplacé à la première connexion.

### Migration des anciennes données
Le projet D1 de départ stocke les données du compte `admin-root-001`. La nouvelle version lit et écrit dans cet espace partagé afin de conserver les données déjà saisies par le compte principal. Si votre déploiement utilise un autre identifiant administrateur ou si des données ont été saisies depuis plusieurs comptes, faites une sauvegarde D1 avant migration et demandez une adaptation de `DATA_OWNER_ID` avant la mise en production.
