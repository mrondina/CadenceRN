import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../test-utils/BetterSQLiteDatabase';
import { runMigrations } from '../migrations/runner';
import type { IDatabase } from '../types';

// ─── Step 11/13 gate + migration 003: migration runner idempotency ────────────
//
// The runner must execute twice on the same database without error and leave
// db_version = 3 (migrations 001 + 002 + 003 all applied).

describe('runMigrations', () => {
  let db: IDatabase;

  beforeEach(() => {
    db = openTestDb();
  });

  it('first run: creates all tables and sets db_version = 3', async () => {
    await runMigrations(db);

    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_state WHERE key = 'db_version'`,
    );
    expect(row?.value).toBe('3');
  });

  it('second run: no error; db_version remains 3', async () => {
    await runMigrations(db);
    await runMigrations(db);

    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_state WHERE key = 'db_version'`,
    );
    expect(row?.value).toBe('3');
  });

  it('all expected tables exist after migration', async () => {
    await runMigrations(db);

    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    const names = tables.map(t => t.name).sort();

    expect(names).toContain('app_state');
    expect(names).toContain('content_items');
    expect(names).toContain('cohorts');
    expect(names).toContain('session_instances');
    expect(names).toContain('course_instances');
    expect(names).toContain('item_memory_states');
    expect(names).toContain('review_events');
    expect(names).toContain('drill_results');
  });

  it('item_memory_states has last_qualifying_date column (amendment a)', async () => {
    await runMigrations(db);

    const cols = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(item_memory_states)`,
    );
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('last_qualifying_date');
  });

  it('item_memory_states fsrs_stability has no DEFAULT (amendment b)', async () => {
    await runMigrations(db);

    const cols = await db.getAllAsync<{ name: string; dflt_value: string | null }>(
      `PRAGMA table_info(item_memory_states)`,
    );
    const fsrsCols = cols.filter(c => c.name.startsWith('fsrs_'));
    for (const col of fsrsCols) {
      expect(col.dflt_value, `${col.name} must have no DEFAULT`).toBeNull();
    }
  });

  it('second run on a pre-populated db does not duplicate rows', async () => {
    await runMigrations(db);

    // Insert a sentinel row into app_state to verify it survives the second run.
    await db.runAsync(
      `INSERT INTO app_state (key, value) VALUES ('test_sentinel', 'alive')`,
    );

    await runMigrations(db);

    const sentinel = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_state WHERE key = 'test_sentinel'`,
    );
    expect(sentinel?.value).toBe('alive');

    const versionCount = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM app_state WHERE key = 'db_version'`,
    );
    expect(versionCount?.cnt).toBe(1);
  });
});
