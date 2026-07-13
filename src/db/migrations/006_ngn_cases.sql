-- CadenceRN — NGN Cases Schema
-- Migration 006 (db_version 5 → 6)
--
-- Amendment (s): ContentCase + NGN row formats added to domain contract.
--
-- Purely additive. The content_cases table is new. The case_id and case_order
-- columns on content_items are declared in SCHEMA_001 for fresh installs; the
-- migration 006 runner block adds them conditionally for existing DBs whose
-- SCHEMA_001 was applied before amendment (s) (i.e. db_version was already 1–5).
--
-- No DEFAULT on any new column — partial inserts must fail loudly (amendment b).

-- Must be created before any content_items FK reference to case_id resolves.
CREATE TABLE IF NOT EXISTS content_cases (
  case_id           TEXT NOT NULL PRIMARY KEY,
  session           INTEGER NOT NULL,
  week              INTEGER NOT NULL,
  course_slug       TEXT NOT NULL,
  pillar            TEXT NOT NULL,
  scenario          TEXT NOT NULL,
  exhibits          TEXT NOT NULL,      -- JSON array of {label, title, body}
  prompt            TEXT NOT NULL,
  presentation      TEXT NOT NULL,      -- 'matrix' | 'dropdown_sentence'
  presentation_data TEXT NOT NULL,      -- JSON: MatrixPresentationData | DropdownPresentationData
  source_citation   TEXT NOT NULL,
  content_version   INTEGER NOT NULL,
  placeholder       INTEGER NOT NULL,
  last_reviewed_at  TEXT               -- NULL until SME review
);

CREATE INDEX IF NOT EXISTS idx_content_cases_session_week
  ON content_cases(session, week);

-- For existing installs (db_version < 6 when this migration runs), the runner
-- inspects PRAGMA table_info(content_items) and conditionally executes:
--   ALTER TABLE content_items ADD COLUMN case_id TEXT;
--   ALTER TABLE content_items ADD COLUMN case_order INTEGER;
-- No FK declared: SQLite validates referenced-table existence at DML prepare
-- time; content_cases would not yet exist during migrations 2–5 upsert calls.
-- Application-level consistency is enforced by ContentCaseRepository.
-- Fresh installs already have these columns from SCHEMA_001.
