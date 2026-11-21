-- Rôles, permissions, publication publique et journal d'audit.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('admin','utilisateur')),
  permissions_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE IF NOT EXISTS public_publications (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK(content_type IN ('presentation','partner','activity','action_plan','achievement','statistic')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK(is_published IN (0,1)),
  published_by TEXT REFERENCES users(id),
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_public_publications_visible ON public_publications(is_published,content_type,published_at DESC);
CREATE TABLE IF NOT EXISTS access_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
-- Le compte initial est l'administrateur principal.
INSERT OR IGNORE INTO user_roles(user_id,role,permissions_json,active)
SELECT id,'admin','{}',1 FROM users WHERE id='admin-root-001';
-- Les données déjà saisies par l'administrateur restent intactes et deviennent communes à la plateforme.
-- Les éventuels enregistrements créés par d'autres comptes sont conservés dans leur espace d'origine.
-- Regroupe également les données précédemment enregistrées par d'autres comptes.
-- En cas d'identifiants de fiche identiques, la fiche déjà présente dans l'espace Admin est conservée.
INSERT OR IGNORE INTO platform_records(user_id,collection,record_id,payload,created_at,updated_at)
SELECT 'admin-root-001',collection,record_id,payload,created_at,updated_at
FROM platform_records WHERE user_id <> 'admin-root-001';
