-- Photo de profil utilisateur (base Neon PostgreSQL)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
