-- MATRICE PARTENAIRE ET PTF SÉNÉGAL — collaboration professionnelle V2
CREATE TABLE IF NOT EXISTS tasks (
 id BIGSERIAL PRIMARY KEY, title VARCHAR(180) NOT NULL, description TEXT NOT NULL DEFAULT '',
 assigned_to VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
 created_by VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 activity_ref VARCHAR(180) NOT NULL DEFAULT '', priority VARCHAR(20) NOT NULL DEFAULT 'normale',
 status VARCHAR(24) NOT NULL DEFAULT 'a_faire' CHECK (status IN ('a_faire','en_cours','en_attente','a_valider','termine')),
 start_date DATE, due_date DATE, submitted_at TIMESTAMPTZ, validated_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tasks_assigned_status_idx ON tasks(assigned_to,status);
CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON tasks(created_by);
CREATE TABLE IF NOT EXISTS task_comments (
 id BIGSERIAL PRIMARY KEY, task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 comment TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS internal_messages (
 id BIGSERIAL PRIMARY KEY, sender_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 subject VARCHAR(180) NOT NULL, body TEXT NOT NULL, read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS internal_messages_recipient_idx ON internal_messages(recipient_id,read_at);
CREATE TABLE IF NOT EXISTS calendar_events (
 id BIGSERIAL PRIMARY KEY, title VARCHAR(180) NOT NULL, description TEXT NOT NULL DEFAULT '',
 start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL, location VARCHAR(250) NOT NULL DEFAULT '',
 created_by VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 owner_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
 visibility VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (visibility IN ('all','private')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
 id BIGSERIAL PRIMARY KEY, user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 type VARCHAR(40) NOT NULL, title VARCHAR(180) NOT NULL, body TEXT NOT NULL DEFAULT '',
 link VARCHAR(120) NOT NULL DEFAULT '', read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications(user_id,read_at,created_at DESC);
