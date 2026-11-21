-- Boîte de réception des messages envoyés depuis la vitrine publique.
CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(180) NOT NULL,
  contact VARCHAR(60) NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) <= 5000),
  status VARCHAR(20) NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','lu','traite')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status);
