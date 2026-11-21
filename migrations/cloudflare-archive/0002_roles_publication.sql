-- MATRICE PTF : rôles, permissions opérationnelles et publication contrôlée
-- Migration additive : ne modifie pas les tables métiers existantes.
CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','utilisateur')),
  permissions_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS public_publications (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('presentation','partner','activity','action_plan','achievement','statistic')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
  published_by TEXT,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_public_publications_visible ON public_publications(is_published, content_type);
CREATE TABLE IF NOT EXISTS access_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
