-- 0003: the team activity log. One row per event (joined, assigned, level_finished, nudge_sent, ...),
-- written only through phishverse.events.record_event(). user_id is who the event is about;
-- data_json carries the details (and "by" for whoever caused it). The row id is the SSE event id.
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, id);
CREATE INDEX IF NOT EXISTS idx_activity_kind ON activity(user_id, kind, id);
