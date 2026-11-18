-- Additive migration. Claims survive project deletion: a delivered design stays reserved.
CREATE TABLE IF NOT EXISTS delivery_registry_state (
  id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL DEFAULT 0, nonce TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO delivery_registry_state (id, revision, nonce) VALUES (1, 0, '');
CREATE TABLE IF NOT EXISTS delivery_claims (
  id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, geometry_hash TEXT NOT NULL UNIQUE,
  document_hash TEXT NOT NULL, policy TEXT NOT NULL, signature TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS delivery_owner ON delivery_claims(owner_hash);
CREATE TABLE IF NOT EXISTS delivery_receipts (
  id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES delivery_claims(id),
  document_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(claim_id, document_hash)
);
