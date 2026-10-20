-- 0004: programs (an assignment with stages), stored skills reports and personal training plans.
-- One active program per person; re-assigning marks the old one 'replaced'. Reports never change
-- after they're written. Existing assignments become active programs (levels, due date, note kept).
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  levels_json TEXT NOT NULL,
  due TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  pass_mark INTEGER NOT NULL DEFAULT 70,
  max_test_attempts INTEGER NOT NULL DEFAULT 3,
  allow_watch_training INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','replaced','removed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_programs_one_active ON programs(user_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL UNIQUE REFERENCES programs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS training_plans (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL UNIQUE REFERENCES programs(id) ON DELETE CASCADE,
  skills_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_by TEXT,
  edited_at INTEGER
);

INSERT INTO programs (id, user_id, levels_json, due, note, created_by, created_at, status)
SELECT 'p_' || lower(hex(randomblob(16))), a.user_id, json_extract(a.data, '$.levels'),
       COALESCE(json_extract(a.data, '$.due'), ''), COALESCE(json_extract(a.data, '$.note'), ''),
       COALESCE(json_extract(a.data, '$.by'), ''),
       COALESCE(json_extract(a.data, '$.assignedAt'), CAST(strftime('%s', 'now') AS INTEGER) * 1000), 'active'
FROM assignments a
WHERE json_valid(a.data) AND json_type(a.data, '$.levels') = 'array' AND json_array_length(a.data, '$.levels') > 0
  AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.user_id = a.user_id AND p.status = 'active');
