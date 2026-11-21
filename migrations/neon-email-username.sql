-- Migration additive : l'adresse email devient l'identifiant de connexion
-- pour tous les nouveaux comptes créés depuis l'espace Administrateur.
-- Les anciens comptes conservent leur identifiant actuel et restent connectables.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_ci
ON users (LOWER(email))
WHERE email IS NOT NULL AND BTRIM(email) <> '';
