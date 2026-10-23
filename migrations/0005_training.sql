-- 0005: training simulations. training_progress is the summary per person, program and simulation;
-- training_attempts keeps each play's round order, option shuffles and graded answers, so grading
-- and mastery are decided on the server.
CREATE TABLE IF NOT EXISTS training_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  sim_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  best_pct INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  PRIMARY KEY (user_id, program_id, sim_id)
);

CREATE TABLE IF NOT EXISTS training_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  sim_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  answers_json TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  pct INTEGER
);
CREATE INDEX IF NOT EXISTS idx_training_attempts_user ON training_attempts(user_id, program_id, sim_id);
