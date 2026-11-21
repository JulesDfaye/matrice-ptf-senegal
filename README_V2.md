# MATRICE PARTENAIRE ET PTF SÉNÉGAL — Version professionnelle V2

Application web basée sur Vercel Functions + Hono + Neon PostgreSQL, avec interface HTML/CSS/JavaScript.

## Modules existants conservés
Tableau de bord, Matrice, Partenaires, Activités, Indicateurs, Paramètres, vitrine publique et gestion des messages visiteurs.

## Nouveaux modules collaboratifs
- Tâches : attribution, échéances, priorités, soumission et validation.
- Messagerie interne : échanges entre comptes utilisateurs.
- Agenda professionnel : réunions et événements publiés par l'administration.
- Notifications : messages et mises à jour des tâches.

## Installation
Voir `DEPLOIEMENT_V2_GITHUB_VSCODE_VERCEL.txt` pour la procédure complète. La migration `migrations/neon-collaboration-v2.sql` est obligatoire avant d'utiliser les nouveaux modules.

## Variables d'environnement
`DATABASE_URL` : chaîne de connexion Neon PostgreSQL. Cette variable doit être configurée localement dans `.env.local` et dans Vercel > Settings > Environment Variables. Ne jamais la committer.

## Vérification
`npm install`
`npm run check`
`npm run db:check`
`npm run dev`

Le code est préparé pour le déploiement mais le test réel contre le projet Neon et le compte Vercel de l'utilisateur reste à effectuer après configuration des secrets et exécution des migrations.
