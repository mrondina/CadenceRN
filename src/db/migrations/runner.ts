import type { IDatabase } from '../types';
import type { ContentCase, ContentItem } from '../../domain/types';
import { ContentItemRepository } from '../repositories/ContentItemRepository';
import { ContentCaseRepository } from '../repositories/ContentCaseRepository';

// ─── Dev fixture bootstrap (never runs in production) ────────────────────────
//
// Called from client.ts behind `if (__DEV__)` only. Idempotent via upsert.
// Out of the versioned migration ledger so that db_version never advances for
// dev-only data.
//
// SOURCE: ATI assessment item reconstructed from pilot-user photograph.
// All 6 rows flagged for Mary SME review — this is a reconstruction, not
// verified content. Do NOT promote to a versioned pack without sign-off.
export async function bootstrapDevFixtures(db: IDatabase): Promise<void> {
  const caseRepo = new ContentCaseRepository(db);
  const itemRepo = new ContentItemRepository(db);

  // ATI screenshot case — 6 rows × 2 columns.
  // caseId / row IDs are stable so upsert replaces prior fixture builds in-place.
  const devCase: ContentCase = {
    caseId: 'dev-case-hypoglycemia',
    session: 1,
    week: 1,
    courseSlug: 'dev',
    pillar: 'concepts',
    scenario: 'A nurse is caring for a client in the clinic who has manifestations of hypoglycemia.',
    exhibits: [
      {
        label: "Nurses' Notes",
        title: "Nurses' Notes",
        body:
          '1020 — Young adult walked into class. Decreased pigmentation and sweating noted; ' +
          'altered mental status.\n\n' +
          '1025 — Professor convinces client to go to the student health clinic. Client ' +
          'escorted by another student. Client wearing a medical-alert bracelet reading ' +
          '"diabetic."\n\n' +
          '1030 — Clinic nurse gives the client orange juice and peanut butter crackers.\n\n' +
          '1100 — Nurse is finding it more difficult to get the client to drink the orange ' +
          'juice. Client is lethargic.\n\n' +
          '1110 — Client goes unresponsive.',
      },
      {
        label: 'Laboratory Results',
        title: 'Laboratory Results',
        body:
          '1030 — Blood glucose: 50 mg/dL (reference: 74–106 mg/dL)\n\n' +
          '1105 — Blood glucose: 45 mg/dL (reference: 74–106 mg/dL)',
      },
    ],
    prompt:
      'For each potential provider\'s prescription, specify whether it is anticipated or ' +
      'contraindicated for the client who is experiencing hypoglycemia.',
    presentation: 'matrix',
    presentationData: { columns: ['Anticipated', 'Contraindicated'] },
    sourceCitation:
      'DEV FIXTURE — ATI assessment reconstruction from photograph; placeholder; ' +
      'all 6 rows pending SME review (Mary)',
    contentVersion: 2,
    placeholder: true,
    lastReviewedAt: null,
  };

  await caseRepo.upsert(devCase);

  // Columns: 0 = Anticipated, 1 = Contraindicated
  const SME_CITATION =
    'DEV FIXTURE — ATI reconstruction; placeholder; flagged for Mary SME review';

  const devRows: ContentItem[] = [
    // SME flag 1/6
    {
      id: 'dev-hypo-row-1',
      pillar: 'concepts',
      format: 'matrix_row',
      difficultyTier: 2,
      body: {
        type: 'matrix_row',
        rowLabel: 'Regular insulin IV',
        correctColumn: 1, // Contraindicated
        rationale:
          'Regular insulin lowers blood glucose further in an already-hypoglycemic client, ' +
          'worsening the emergency and risking severe neurological injury.',
      },
      sourceCitation: SME_CITATION,
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 1 },
      contentPackId: 'dev',
      contentVersion: 2,
      placeholder: true,
      caseId: 'dev-case-hypoglycemia',
      caseOrder: 1,
    },
    // SME flag 2/6
    {
      id: 'dev-hypo-row-2',
      pillar: 'concepts',
      format: 'matrix_row',
      difficultyTier: 2,
      body: {
        type: 'matrix_row',
        rowLabel: 'Glucagon IM',
        correctColumn: 0, // Anticipated
        rationale:
          'Glucagon triggers hepatic glycogenolysis to raise blood glucose and is the ' +
          'appropriate intervention when the client can no longer safely take oral glucose.',
      },
      sourceCitation: SME_CITATION,
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 1 },
      contentPackId: 'dev',
      contentVersion: 2,
      placeholder: true,
      caseId: 'dev-case-hypoglycemia',
      caseOrder: 2,
    },
    // SME flag 3/6
    {
      id: 'dev-hypo-row-3',
      pillar: 'concepts',
      format: 'matrix_row',
      difficultyTier: 2,
      body: {
        type: 'matrix_row',
        rowLabel: 'Call EMS for transport to nearest E.R.',
        correctColumn: 0, // Anticipated
        rationale:
          'The client is unresponsive at 1110 and requires emergency care beyond the ' +
          'capability of a student health clinic.',
      },
      sourceCitation: SME_CITATION,
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 1 },
      contentPackId: 'dev',
      contentVersion: 2,
      placeholder: true,
      caseId: 'dev-case-hypoglycemia',
      caseOrder: 3,
    },
    // SME flag 4/6 — TEMPORAL TURN: oral glucose was appropriate at 1030
    // (client conscious, glucose 50 mg/dL; orange juice given). By 1110 the
    // client is unresponsive — the oral route is now contraindicated (aspiration
    // risk). This row tests whether students apply the 1030 or 1110 clinical
    // state. The answer is determined by 1110 = Contraindicated.
    // This temporal flip is the reason this ATI case was specified for the fixture.
    // Do not flatten it by changing the answer to Anticipated or removing the note.
    {
      id: 'dev-hypo-row-4',
      pillar: 'concepts',
      format: 'matrix_row',
      difficultyTier: 3,
      body: {
        type: 'matrix_row',
        rowLabel: 'Provide client with oral glucose tablets',
        correctColumn: 1, // Contraindicated (at 1110 — client is now unresponsive)
        rationale:
          'Although oral glucose was appropriate at 1030 when the client was conscious, ' +
          'the client is unresponsive at 1110 — administering anything by mouth is ' +
          'contraindicated due to aspiration risk.',
      },
      sourceCitation: SME_CITATION,
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 1 },
      contentPackId: 'dev',
      contentVersion: 2,
      placeholder: true,
      caseId: 'dev-case-hypoglycemia',
      caseOrder: 4,
    },
    // SME flag 5/6
    {
      id: 'dev-hypo-row-5',
      pillar: 'concepts',
      format: 'matrix_row',
      difficultyTier: 2,
      body: {
        type: 'matrix_row',
        rowLabel: 'D₅W IV',
        correctColumn: 0, // Anticipated
        rationale:
          'IV dextrose is the correct route for an unresponsive hypoglycemic client who ' +
          'cannot safely receive anything by mouth.',
      },
      sourceCitation: SME_CITATION,
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 1 },
      contentPackId: 'dev',
      contentVersion: 2,
      placeholder: true,
      caseId: 'dev-case-hypoglycemia',
      caseOrder: 5,
    },
    // SME flag 6/6
    {
      id: 'dev-hypo-row-6',
      pillar: 'concepts',
      format: 'matrix_row',
      difficultyTier: 2,
      body: {
        type: 'matrix_row',
        rowLabel: 'IV for hydration',
        correctColumn: 0, // Anticipated
        rationale:
          'IV access is required to deliver dextrose and is therefore anticipated as part ' +
          'of the emergency intervention for an unresponsive hypoglycemic client.',
      },
      sourceCitation: SME_CITATION,
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 1 },
      contentPackId: 'dev',
      contentVersion: 2,
      placeholder: true,
      caseId: 'dev-case-hypoglycemia',
      caseOrder: 6,
    },
  ];

  for (const row of devRows) {
    await itemRepo.upsert(row);
  }
}
import terminologyPack from '../../../content/terminology-pack.json';
import pharmPack from '../../../content/pharm-pack.json';
import foundationsPack from '../../../content/foundations-pack.json';
import dosagePack from '../../../content/dosage-pack.json';
import complexCare2Pack from '../../../content/complex-care-2-pack.json';
import mentalHealthPack from '../../../content/mental-health-pack.json';

// ─── Migration 001: initial schema ───────────────────────────────────────────
//
// Amendments applied:
//   (a) last_qualifying_date column on item_memory_states — persists
//       RelearningPipeline.lastQualifyingDate so restarts cannot double-count
//       a same-day qualifying retrieval.
//   (b) No DEFAULT values on any fsrs_* column — partial inserts fail loudly
//       rather than silently storing ts-fsrs-invalid values like difficulty=5.
//   (s) case_id and case_order columns present in initial schema so
//       ContentItemRepository.upsert() can include them from the start.
//       FK from content_items.case_id omitted (SQLite prepare-time validation
//       vs. migration ordering); integrity enforced by seed-gate test in
//       seed.test.ts + loader ordering (cases upserted before items, Step 30)
//       instead. Existing DBs (db_version < 6) get these columns via
//       conditional ALTER TABLE in the migration 006 block.

const SCHEMA_001 = `
  CREATE TABLE IF NOT EXISTS content_items (
    id                          TEXT NOT NULL PRIMARY KEY,
    pillar                      TEXT NOT NULL,
    format                      TEXT NOT NULL,
    difficulty_tier             INTEGER NOT NULL,
    body                        TEXT NOT NULL,
    source_citation             TEXT NOT NULL,
    last_reviewed_at            TEXT NOT NULL,
    high_alert                  INTEGER NOT NULL DEFAULT 0,
    graph_links                 TEXT NOT NULL,
    release_gate_session_index  INTEGER NOT NULL,
    release_gate_week           INTEGER NOT NULL,
    content_pack_id             TEXT NOT NULL,
    content_version             INTEGER NOT NULL,
    placeholder                 INTEGER NOT NULL DEFAULT 0,
    case_id                     TEXT,
    case_order                  INTEGER
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
    content_pack_ids TEXT NOT NULL,
    exam_dates       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_course_instances_session
    ON course_instances(session_id);

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
    fsrs_last_review      TEXT,
    relearn_streak        INTEGER NOT NULL,
    graduated             INTEGER NOT NULL,
    last_qualifying_date  TEXT,
    updated_at            TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_item_memory_states_due
    ON item_memory_states(fsrs_due);

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
`;

// ─── Migration 006: NGN cases schema ─────────────────────────────────────────
//
// Amendment (s): ContentCase + NGN row formats. Adds content_cases table and
// case_id / case_order columns to content_items. Purely additive — existing
// 190 items receive NULL for both new columns.
// No DEFAULT on any new column (amendment b).
//
// ALL_CASE_PACKS is empty until cases are authored; the migration runs cleanly
// with zero iterations, which is the zero-case directory guarantee.

// SCHEMA_006 only creates the content_cases table and index. The case_id /
// case_order columns are declared in SCHEMA_001 for fresh installs; the
// migration 006 block adds them conditionally for existing DBs (db_version < 6).
const SCHEMA_006 = `
  CREATE TABLE IF NOT EXISTS content_cases (
    case_id           TEXT NOT NULL PRIMARY KEY,
    session           INTEGER NOT NULL,
    week              INTEGER NOT NULL,
    course_slug       TEXT NOT NULL,
    pillar            TEXT NOT NULL,
    scenario          TEXT NOT NULL,
    exhibits          TEXT NOT NULL,
    prompt            TEXT NOT NULL,
    presentation      TEXT NOT NULL,
    presentation_data TEXT NOT NULL,
    source_citation   TEXT NOT NULL,
    content_version   INTEGER NOT NULL,
    placeholder       INTEGER NOT NULL,
    last_reviewed_at  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_content_cases_session_week
    ON content_cases(session, week);
`;

const ALL_CASE_PACKS: ContentCase[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function bootstrap(db: IDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT NOT NULL PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

async function getVersion(db: IDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_state WHERE key = 'db_version'`,
  );
  return row ? Number(row.value) : 0;
}

// ─── Schema-only runner (use in repository integration tests) ─────────────────
//
// Applies migration 001 only — creates all tables, no seed data.
// Repository tests call this so they run against an empty, correctly-typed
// schema without the 106 seed items from migration 002 leaking into assertions.

export async function runSchemaOnly(db: IDatabase): Promise<void> {
  await bootstrap(db);
  if ((await getVersion(db)) < 1) {
    await db.execAsync(SCHEMA_001);
    await db.runAsync(
      `INSERT OR REPLACE INTO app_state (key, value) VALUES ('db_version', '1')`,
    );
  }
}

// ─── Full runner (use in production and seed tests) ───────────────────────────

export async function runMigrations(db: IDatabase): Promise<void> {
  await runSchemaOnly(db);

  if ((await getVersion(db)) < 2) {
    // Wrap all upserts + the version bump in one transaction.
    // Invariant: db_version advances to 2 only when every item committed.
    // A crash mid-upsert leaves db_version=1; the next launch re-runs and
    // completes cleanly because every upsert is ON CONFLICT UPDATE (idempotent).
    await db.withExclusiveTransactionAsync(async (txn) => {
      const itemRepo = new ContentItemRepository(txn);
      const allPacks = [
        ...terminologyPack,
        ...pharmPack,
        ...foundationsPack,
        ...dosagePack,
      ] as ContentItem[];
      for (const item of allPacks) {
        await itemRepo.upsert(item);
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO app_state (key, value) VALUES ('db_version', '2')`,
      );
    });
  }

  if ((await getVersion(db)) < 3) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      const itemRepo = new ContentItemRepository(txn);
      const allPacks = [...complexCare2Pack] as ContentItem[];
      for (const item of allPacks) {
        await itemRepo.upsert(item);
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO app_state (key, value) VALUES ('db_version', '3')`,
      );
    });
  }

  if ((await getVersion(db)) < 4) {
    // Re-seed items whose pillar changed in the A1 re-tag (contentVersion bumped
    // to 2). Filters at runtime so only changed items are upserted — no-op for
    // items already at the correct pillar (idempotent ON CONFLICT UPDATE).
    await db.withExclusiveTransactionAsync(async (txn) => {
      const itemRepo = new ContentItemRepository(txn);
      const retaggedItems = [
        ...dosagePack,
        ...foundationsPack,
        ...complexCare2Pack,
      ].filter(item => item.contentVersion === 2) as ContentItem[];
      for (const item of retaggedItems) {
        await itemRepo.upsert(item);
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO app_state (key, value) VALUES ('db_version', '4')`,
      );
    });
  }

  if ((await getVersion(db)) < 5) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      const itemRepo = new ContentItemRepository(txn);
      for (const item of mentalHealthPack as ContentItem[]) {
        await itemRepo.upsert(item);
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO app_state (key, value) VALUES ('db_version', '5')`,
      );
    });
  }

  if ((await getVersion(db)) < 6) {
    // Amendment (s): add content_cases table + case_id/case_order columns.
    // ALL_CASE_PACKS is currently empty — zero-case directory runs cleanly.
    await db.withExclusiveTransactionAsync(async (txn) => {
      // Create content_cases table and index (idempotent).
      await txn.execAsync(SCHEMA_006);
      // case_id / case_order are in SCHEMA_001 for fresh installs. For existing
      // DBs (SCHEMA_001 applied before amendment (s)), add them here if absent.
      const cols = await txn.getAllAsync<{ name: string }>(`PRAGMA table_info(content_items)`);
      if (!cols.some(c => c.name === 'case_id')) {
        await txn.execAsync(`ALTER TABLE content_items ADD COLUMN case_id TEXT`);
        await txn.execAsync(`ALTER TABLE content_items ADD COLUMN case_order INTEGER`);
      }
      const caseRepo = new ContentCaseRepository(txn);
      for (const c of ALL_CASE_PACKS) {
        await caseRepo.upsert(c);
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO app_state (key, value) VALUES ('db_version', '6')`,
      );
    });
  }

  if ((await getVersion(db)) < 7) {
    // Re-seeds mental-health-pack to add mh-041–070 (MH Exam 3 content: schizophrenia/
    // psychosis/antipsychotics, somatic/dissociative, personality disorders — week 4).
    // Upsert is idempotent: mh-001–040 are overwritten with identical data; new items inserted.
    await db.withExclusiveTransactionAsync(async (txn) => {
      const itemRepo = new ContentItemRepository(txn);
      for (const item of mentalHealthPack as ContentItem[]) {
        await itemRepo.upsert(item);
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO app_state (key, value) VALUES ('db_version', '7')`,
      );
    });
  }

  if ((await getVersion(db)) < 8) {
    // Enforces the single-cohort invariant retroactively for any device that
    // accumulated orphan cohort rows via repeated setup runs. Keeps the newest
    // cohort by created_at DESC — matching post-fix findFirst ordering — and
    // deletes all older rows along with their dependent session/course data.
    // item_memory_states and review_events have no FK to cohorts and are untouched.
    // Safe no-op on fresh installs (0 cohort rows) and correctly-configured
    // devices that already have exactly 1 row.
    await db.withExclusiveTransactionAsync(async (txn) => {
      const keepRow = await txn.getFirstAsync<{ id: string }>(
        `SELECT id FROM cohorts ORDER BY created_at DESC LIMIT 1`,
      );
      if (keepRow) {
        const keepId = keepRow.id;
        await txn.runAsync(
          `DELETE FROM course_instances
           WHERE session_id IN (
             SELECT id FROM session_instances WHERE cohort_id != $keepId
           )`,
          { $keepId: keepId },
        );
        await txn.runAsync(
          `DELETE FROM session_instances WHERE cohort_id != $keepId`,
          { $keepId: keepId },
        );
        await txn.runAsync(
          `DELETE FROM cohorts WHERE id != $keepId`,
          { $keepId: keepId },
        );
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO app_state (key, value) VALUES ('db_version', '8')`,
      );
    });
  }
}
