-- 0002: one row per play of a level, one row per decision in it.
-- Outcome and severity are looked up from content/levels.json by the server, never sent by the client.
-- score/stars are frozen when the session finishes so later content edits don't rewrite history.
CREATE TABLE IF NOT EXISTS play_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'baseline' CHECK (purpose IN ('baseline','practice','test')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  client_version TEXT NOT NULL DEFAULT '',
  score INTEGER,
  stars INTEGER
);
CREATE INDEX IF NOT EXISTS idx_play_sessions_user_level ON play_sessions(user_id, level_id, finished_at);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES play_sessions(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  action_index INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  severity INTEGER CHECK (severity IS NULL OR severity BETWEEN 1 AND 3),
  inspected_json TEXT NOT NULL DEFAULT '[]',
  n_inspections INTEGER NOT NULL DEFAULT 0,
  response_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (session_id, task_id)
);
