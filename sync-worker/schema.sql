CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY, auth_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
 envelope TEXT, digest TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, envelope TEXT NOT NULL, digest TEXT, saved_at TEXT NOT NULL,
 PRIMARY KEY(account_id, revision)
);
CREATE TABLE IF NOT EXISTS registration_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
