# MATRICE PARTENAIRE ET PTF SÉNÉGAL — Vercel + Neon

Version adaptée à **Vercel** avec API Hono (Vercel Functions) et base PostgreSQL **Neon**. L'interface d'origine est conservée : accueil Sénégal, choix des profils, tableau de bord, matrice, partenaires, activités, indicateurs, paramètres, gestion des utilisateurs et vitrine publique.

## 1. Prérequis
- Node.js 20 ou 22 LTS
- npm
- Un compte Vercel relié au dépôt GitHub
- Un projet Neon PostgreSQL existant

## 2. Base Neon
1. Ouvrir le projet Neon et choisir **Connect**.
2. Copier la chaîne de connexion PostgreSQL **pooled** (host contenant généralement `-pooler`).
3. Dans Neon SQL Editor, exécuter intégralement `migrations/neon-schema.sql`.
4. Vérifier la présence des tables `users`, `sessions`, `platform_records`, `login_attempts`, `audit_log`, `user_roles`, `public_publications` et `access_audit_log`.

Le script crée le compte initial `admin` avec le mot de passe temporaire `admin123`. Le changement du mot de passe est imposé dès la première connexion. Remplacez-le immédiatement par un mot de passe long et unique.

## 3. Variables d'environnement Vercel
Dans **Project → Settings → Environment Variables**, ajouter :

- `DATABASE_URL` : chaîne de connexion pooled Neon complète, avec SSL.

Sélectionner Production, Preview et Development selon vos besoins, puis redéployer après toute modification. Ne jamais mettre cette valeur dans GitHub, dans le code source ou dans une capture d'écran.

Pour travailler en local, créer `.env.local` à partir de `.env.example` et y mettre la chaîne Neon. Ce fichier est ignoré par Git.

## 4. Déploiement depuis GitHub
Dans Vercel :
1. **Add New → Project**.
2. Importer le dépôt `JulesDfaye/matrice-ptf-senegal`.
3. Framework Preset : **Other**.
4. Root Directory : `./`.
5. Build Command : laisser vide (ou désactivée).
6. Output Directory : laisser vide.
7. Ajouter `DATABASE_URL`.
8. Déployer.

Pour un projet Vercel déjà lié au dépôt, pousser les nouveaux fichiers sur la branche de production déclenchera le déploiement automatique.

## 5. Développement local
```bash
npm install
cp .env.example .env.local
# Modifier .env.local et renseigner DATABASE_URL
npm run check
npm run db:check
npm run dev
```
Sur Windows PowerShell, copier le fichier avec `Copy-Item .env.example .env.local`.

## 6. Première connexion
- Profil : **Administrateur**
- Identifiant : `admin`
- Mot de passe temporaire : `admin123`

La base doit avoir reçu `migrations/neon-schema.sql` avant la connexion. La première connexion impose le changement du mot de passe. Si ce compte existe déjà dans Neon avec un autre hash, la migration ne l'écrase pas : il faut réinitialiser son mot de passe via une procédure administrateur contrôlée, pas supprimer la base.

## 7. Données déjà présentes dans le navigateur
Le navigateur conserve une copie locale sous la clé `matrice_ptf_senegal_v2`. Après le déploiement, connectez-vous avec l'administrateur. Si Neon ne contient pas encore de données et que le navigateur contient des données, l'application transfère automatiquement l'état local lors du premier chargement authentifié. Conservez une sauvegarde JSON depuis le menu **Sauvegarde / restauration** avant cette opération.

Les données localStorage sont propres à chaque navigateur et ordinateur : les données d'autres appareils doivent être exportées depuis chacun d'eux puis importées/centralisées. N'effacez pas le stockage du navigateur avant d'avoir vérifié la présence des données dans Neon.

## 8. Sécurité
- Les mots de passe sont hachés avec PBKDF2-SHA256 (310 000 itérations).
- Les sessions sont des jetons aléatoires dont seul le hash est enregistré en base.
- Le cookie de session est HttpOnly, Secure en HTTPS et SameSite=Strict.
- Les rôles et permissions sont vérifiés côté API, pas seulement dans l'interface.
- La vitrine ne lit que les publications marquées comme publiées.
- `DATABASE_URL` doit rester une variable secrète Vercel.

## 9. Tests
- `GET /api/health` doit répondre `{ ok: true }`.
- Connexion initiale administrateur, puis changement du mot de passe.
- Déconnexion/reconnexion.
- Création d'un compte utilisateur et vérification des permissions.
- Vérification de la vitrine `/vitrine.html`.
- Vérification des données depuis un second navigateur.

**Important :** le dépôt fourni initialement utilisait Cloudflare D1. Cette version Vercel/Neon remplace la couche d'accès à la base et le point d'entrée API. Les migrations SQLite/Cloudflare historiques sont conservées dans `migrations/cloudflare-archive/` à titre de référence uniquement ; ne pas les exécuter sur Neon.
