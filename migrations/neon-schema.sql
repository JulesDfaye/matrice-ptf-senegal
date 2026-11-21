-- MATRICE PARTENAIRE ET PTF SÉNÉGAL — schéma PostgreSQL pour Neon
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 310000,
  first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', ministry TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text), updated_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text), last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text), last_seen_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS platform_records (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, collection TEXT NOT NULL, record_id TEXT NOT NULL,
  payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text), updated_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text),
  PRIMARY KEY(user_id, collection, record_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_records_collection ON platform_records(user_id, collection);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT PRIMARY KEY, failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL, locked_until TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
  ip_hash TEXT, created_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text), details TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_log(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('admin','utilisateur')), permissions_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text), updated_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text)
);
CREATE TABLE IF NOT EXISTS public_publications (
  id TEXT PRIMARY KEY, content_type TEXT NOT NULL CHECK(content_type IN ('presentation','partner','activity','action_plan','achievement','statistic')),
  title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}', is_published INTEGER NOT NULL DEFAULT 0,
  published_by TEXT, published_at TEXT, updated_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text)
);
CREATE INDEX IF NOT EXISTS idx_public_publications_visible ON public_publications(is_published, content_type);
CREATE TABLE IF NOT EXISTS access_audit_log (
  id BIGSERIAL PRIMARY KEY, actor_user_id TEXT, action TEXT NOT NULL, target_type TEXT, target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (NOW()::timestamp::text)
);
-- Compte temporaire admin / admin123 ; changement obligatoire à la première connexion.
INSERT INTO users(id, username, password_hash, password_salt, password_iterations, must_change_password)
VALUES ('admin-root-001','admin','824de8b696405246d9d702d69045f391205ff1db14cc335b7775e2bda43ac641','a1b2c3d4e5f60718293a4b5c6d7e8f90',310000,1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO user_roles(user_id, role, permissions_json, active)
VALUES ('admin-root-001','admin','{}',1)
ON CONFLICT (user_id) DO UPDATE SET role='admin', active=1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users (LOWER(username));
