-- 0001: the original schema from server.py.
-- IF NOT EXISTS lets databases created before migrations existed adopt this file
-- as already applied. Never edit this file; add 0002_*.sql and onwards instead.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','employee')),
  dept TEXT NOT NULL DEFAULT '',
  joined_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);
