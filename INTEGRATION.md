# Ajout des 3 profils et de la vitrine à MATRICE PTF Sénégal

Ce paquet est un **module d'intégration** pour la version Cloudflare Workers + Hono + D1 décrite dans le README du projet. Il ne remplace pas l'application existante.

## Profils
- **Admin** : gestion complète, utilisateurs, paramètres et publication de contenus.
- **Utilisateur** : droits de lecture/écriture configurés par l'admin, sans gestion des comptes ni publication.
- **Visiteur** : aucune session privée ; accès uniquement à `/vitrine.html` et aux données explicitement publiées.

## 1. Copier les fichiers
Copiez les dossiers `migrations/`, `api/` et `public/` dans la racine du projet MATRICE existant. Ne remplacez pas vos fichiers actuels : fusionnez les dossiers.

## 2. Migration D1
Ajoutez `0002_roles_publication.sql` à vos migrations puis exécutez :

```bash
npx wrangler d1 migrations apply matrice-ptf-senegal --local
npx wrangler d1 migrations apply matrice-ptf-senegal --remote
```

Si votre script npm `db:migrate:local` / `db:migrate:remote` est déjà configuré, vous pouvez utiliser ces scripts.

## 3. Brancher les routes Hono
Dans `api/index.js`, importez :

```js
import { createAccessRouter } from './access-control.js';
import { publicShowcase } from './public-showcase.js';
```

Après l'initialisation de votre app Hono et **en réutilisant votre mécanisme de session existant**, montez les routes :

```js
// ADAPTER getUser à la fonction qui vérifie déjà le cookie/session du projet.
// Elle doit retourner { id, username } si la session est valide, sinon null.
app.route('/api/access', createAccessRouter({ getUser: async c => getAuthenticatedUser(c) }));
app.route('/api/public', publicShowcase);
```

`getAuthenticatedUser(c)` est volontairement un point d'adaptation : le nom et la structure de la fonction de session dépendent de votre `api/index.js` actuel. Ne remplacez pas la vérification cryptographique de session par une simple lecture d'un identifiant envoyé par le navigateur.

La route publique `/api/public/showcase` ne requiert pas de session et ne lit que `public_publications` avec `is_published=1`.

## 4. Initialiser le premier administrateur
Après migration, identifiez l'ID réel du compte administrateur dans la table `users` :

```sql
SELECT id, username FROM users;
```

Puis attribuez le rôle admin à cet ID :

```sql
INSERT INTO user_roles(user_id, role, permissions_json, active)
VALUES ('COLLER_ICI_ID_ADMIN', 'admin', '{}', 1)
ON CONFLICT(user_id) DO UPDATE SET role='admin', permissions_json='{}', active=1;
```

Ne donnez pas le rôle admin à un compte ordinaire. Le compte initial doit changer son mot de passe temporaire.

## 5. Ajouter la gestion des comptes dans Paramètres
Ajoutez dans le menu Paramètres un onglet/bouton réservé à l'admin et un conteneur :

```html
<button data-admin-only onclick="ouvrirGestionComptes()">Gestion des comptes</button>
<div id="gestionComptes"></div>
<script type="module" src="/assets/js/role-management.js"></script>
<script>
  async function ouvrirGestionComptes(){
    const zone=document.getElementById('gestionComptes');
    await matriceRenderUserManager(zone);
  }
  matriceLoadAccess().catch(()=>location.href='/connexion');
</script>
```

Si votre application utilise déjà une page de connexion et une session active, adaptez seulement la redirection à votre route de connexion.

## 6. Activer les permissions sur les opérations métiers
Le masquage des boutons côté navigateur n'est **pas** une sécurité suffisante. Chaque route API existante qui lit ou modifie les données doit vérifier le rôle et la permission côté serveur.

Exemple de contrôle dans une route protégée (après authentification) :

```js
import { can } from './access-control.js';
// user = identité enrichie par user_roles ; à récupérer côté serveur.
if (!can(user, 'activities_write')) return c.json({error:'Droit insuffisant'}, 403);
```

Appliquez les permissions correspondantes : `matrix_read`, `matrix_write`, `partners_read`, `partners_write`, `activities_read`, `activities_write`, `indicators_read`, `indicators_write`, `exports`, `dashboard_read`. Réservez les routes utilisateurs, paramètres globaux et publications au rôle `admin`.

## 7. Publier un contenu sur la vitrine
La publication est faite uniquement par un admin :

```http
POST /api/access/publications
Content-Type: application/json

{
  "content_type":"partner",
  "title":"Partenaire — exemple",
  "summary":"Présentation publique validée.",
  "payload":{"name":"Nom public","category":"Institutionnelle","country":"Sénégal","domain":"Appui institutionnel"}
}
```

Types autorisés : `presentation`, `partner`, `activity`, `action_plan`, `achievement`, `statistic`.
Pour dépublier : `PATCH /api/access/publications/{id}` avec `{ "is_published": false }`.

Les données publiques passent par une liste blanche de champs. N'y placez pas de coordonnées privées, d'emails/téléphones personnels, de notes internes de la matrice, de mots de passe ou d'informations confidentielles.

## 8. Vitrine
La page fournie est `public/vitrine.html`. Elle charge `/api/public/showcase`. Ajoutez un lien « Vitrine publique » sur votre accueil. Le lien « Accéder à la plateforme » doit pointer vers la route de connexion réelle de votre application (dans le fichier fourni, le lien est `/connexion`, à adapter si votre route porte un autre nom).

## 9. Tests indispensables avant mise en production
1. Visiteur non connecté : vitrine accessible, API métiers privées refusées.
2. Utilisateur : ne peut ni consulter ni modifier les modules non autorisés.
3. Utilisateur : reçoit `403` s'il tente d'appeler directement une route admin ou publication.
4. Admin : peut gérer les utilisateurs, leurs permissions et publier/dépublier.
5. Un contenu non publié n'apparaît jamais sur la vitrine.
6. Vérifier qu'aucune donnée personnelle ni évaluation interne n'est incluse dans les contenus publiés.

> Important : ce module doit être raccordé à la fonction d'authentification de votre version exacte. Les tables et interfaces métier existantes sont conservées ; les routes CRUD actuelles doivent être protégées individuellement côté serveur avant toute mise en ligne.
