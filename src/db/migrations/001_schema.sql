-- CadenceRN — Initial Schema
-- Migration 001
--
-- Amendments applied:
--   (a) last_qualifying_date on item_memory_states
--   (b) No DEFAULT on any fsrs_* column
--
-- NOTE: This file is the human-readable reference. The runner uses the
-- inline string in runner.ts (same SQL). Keep both in sync on any edit.

CREATE TABLE IF NOT EXISTS content_items (
  id                          TEXT NOT NULL PRIMARY KEY,
  pillar                      TEXT NOT NULL,
  format                      TEXT NOT NULL,
  difficulty_tier             INTEGER NOT NULL,
  body                        TEXT NOT NULL,       -- JSON-serialized ItemBody
  source_citation             TEXT NOT NULL,
  last_reviewed_at            TEXT NOT NULL,
  high_alert                  INTEGER NOT NULL DEFAULT 0,
  graph_links                 TEXT NOT NULL,       -- JSON array of content_item ids
  release_gate_session_index  INTEGER NOT NULL,
  release_gate_week           INTEGER NOT NULL,
  content_pack_id             TEXT NOT NULL,
  content_version             INTEGER NOT NULL,
  placeholder                 INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_content_items_pack
  ON content_items(content_pack_id);

CREATE INDEX IF NOT EXISTS idx_content_items_gate
  ON content_items(release_gate_session_index, release_gate_week);

CREATE TABLE IF NOT EXISTS cohorts (
  id          TEXT NOT NULL PRIMARY KEY,
  start_date  TEXT NOT NULL,
  template_id TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_instances (
  id            TEXT NOT NULL PRIMARY KEY,
  cohort_id     TEXT NOT NULL REFERENCES cohorts(id),
  session_index INTEGER NOT NULL,
  label         TEXT NOT NULL,
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_instances_cohort
  ON session_instances(cohort_id);

CREATE TABLE IF NOT EXISTS course_instances (
  id               TEXT NOT NULL PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES session_instances(id),
  title            TEXT NOT NULL,
  content_pack_ids TEXT NOT NULL,  -- JSON array of pack ids
  exam_dates       TEXT NOT NULL,  -- JSON array of ISO date strings
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_course_instances_session
  ON course_instances(session_id);

-- Amendment (a): last_qualifying_date persists RelearningPipeline state across restarts.
-- Amendment (b): no DEFAULT on any fsrs_* column — partial inserts must fail loudly.
CREATE TABLE IF NOT EXISTS item_memory_states (
  item_id               TEXT NOT NULL PRIMARY KEY REFERENCES content_items(id),
  fsrs_stability        REAL NOT NULL,
  fsrs_difficulty       REAL NOT NULL,
  fsrs_due              TEXT NOT NULL,
  fsrs_state            TEXT NOT NULL,
  fsrs_elapsed_days     INTEGER NOT NULL,
  fsrs_scheduled_days   INTEGER NOT NULL,
  fsrs_learning_steps   INTEGER NOT NULL,
  fsrs_reps             INTEGER NOT NULL,
  fsrs_lapses           INTEGER NOT NULL,
  fsrs_last_review      TEXT,           -- NULL on New cards
  relearn_streak        INTEGER NOT NULL,
  graduated             INTEGER NOT NULL,
  last_qualifying_date  TEXT,           -- NULL until first qualifying Good/Easy review
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_memory_states_due
  ON item_memory_states(fsrs_due);

-- Append-only. No UPDATE or DELETE paths exist — see invariants in PLAN.md.
CREATE TABLE IF NOT EXISTS review_events (
  id                TEXT NOT NULL PRIMARY KEY,
  item_id           TEXT NOT NULL REFERENCES content_items(id),
  ts                TEXT NOT NULL,
  rating            INTEGER NOT NULL,
  latency_ms        INTEGER NOT NULL,
  mode              TEXT NOT NULL,
  stability_before  REAL NOT NULL,
  difficulty_before REAL NOT NULL,
  due_before        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_events_item
  ON review_events(item_id);

CREATE INDEX IF NOT EXISTS idx_review_events_ts
  ON review_events(ts);

-- Append-only drill results.
CREATE TABLE IF NOT EXISTS drill_results (
  id          TEXT NOT NULL PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES content_items(id),
  ts          TEXT NOT NULL,
  correct     INTEGER NOT NULL,
  latency_ms  INTEGER NOT NULL,
  user_answer TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drill_results_item
  ON drill_results(item_id);
