import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../test-utils/BetterSQLiteDatabase';
import { runMigrations, runSchemaOnly } from '../migrations/runner';
import { ContentItemRepository } from '../repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '../repositories/ItemMemoryStateRepository';
import { ChainGate } from '../../domain/cohort/ChainGate';
import type { IDatabase } from '../types';
import type { GraphLink } from '../../domain/types';

// ─── Step 13 gate: seed content ───────────────────────────────────────────────

let db: IDatabase;

beforeEach(async () => {
  db = openTestDb();
  await runMigrations(db);
});

describe('Seed content migrations (002 + 003)', () => {
  it('inserts the correct total item count (150)', async () => {
    const row = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM content_items`,
    );
    expect(row?.cnt).toBe(150);
  });

  it('all five pack ids are represented', async () => {
    const packs = await db.getAllAsync<{ content_pack_id: string }>(
      `SELECT DISTINCT content_pack_id FROM content_items ORDER BY content_pack_id`,
    );
    const ids = packs.map(p => p.content_pack_id);
    expect(ids).toContain('terminology-pack');
    expect(ids).toContain('pharm-pack');
    expect(ids).toContain('foundations-pack');
    expect(ids).toContain('dosage-pack');
    expect(ids).toContain('complex-care-2-pack');
  });

  it('terminology pack: 26 items in session 1 weeks 1-2', async () => {
    const repo = new ContentItemRepository(db);
    const items = await repo.findByPack('terminology-pack');
    expect(items).toHaveLength(26);
    const weeks = new Set(items.map(i => i.releaseGate.week));
    expect(weeks.has(1)).toBe(true);
    expect(weeks.has(2)).toBe(true);
    const outsideWeeks1_2 = items.filter(i => i.releaseGate.week > 2);
    expect(outsideWeeks1_2).toHaveLength(0);
  });

  it('pharm pack: 30 items across weeks 1-4', async () => {
    const repo = new ContentItemRepository(db);
    const items = await repo.findByPack('pharm-pack');
    expect(items).toHaveLength(30);
    const weeks = [...new Set(items.map(i => i.releaseGate.week))].sort();
    expect(weeks).toEqual([1, 2, 3, 4]);
  });

  it('foundations pack: 25 items across weeks 1-3', async () => {
    const repo = new ContentItemRepository(db);
    const items = await repo.findByPack('foundations-pack');
    expect(items).toHaveLength(25);
    const weeks = [...new Set(items.map(i => i.releaseGate.week))].sort();
    expect(weeks).toEqual([1, 2, 3]);
  });

  it('dosage pack: 25 items across weeks 1-4', async () => {
    const repo = new ContentItemRepository(db);
    const items = await repo.findByPack('dosage-pack');
    expect(items).toHaveLength(25);
  });

  it('all items have placeholder=true', async () => {
    const repo = new ContentItemRepository(db);
    const nonPlaceholder = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM content_items WHERE placeholder = 0`,
    );
    expect(nonPlaceholder?.cnt).toBe(0);
  });

  it('high-alert items exist (heparin, regular insulin items)', async () => {
    const highAlertRows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM content_items WHERE high_alert = 1`,
    );
    const highAlertIds = highAlertRows.map(r => r.id);
    expect(highAlertIds).toContain('pharm-017');
    expect(highAlertIds).toContain('pharm-018');
    expect(highAlertIds).toContain('pharm-019');
    expect(highAlertIds).toContain('pharm-029');
    expect(highAlertIds).toContain('pharm-030');
    expect(highAlertIds).toContain('dose-015');
    expect(highAlertIds).toContain('dose-016');
  });

  it('graph links reference only existing item ids', async () => {
    const allIds = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM content_items`,
    );
    const idSet = new Set(allIds.map(r => r.id));

    const allItems = await db.getAllAsync<{ id: string; graph_links: string }>(
      `SELECT id, graph_links FROM content_items`,
    );

    const broken: string[] = [];
    for (const row of allItems) {
      const links = JSON.parse(row.graph_links) as string[];
      for (const link of links) {
        if (!idSet.has(link)) {
          broken.push(`${row.id} -> ${link}`);
        }
      }
    }
    expect(broken, `Broken graph links: ${broken.join(', ')}`).toHaveLength(0);
  });

  it('migrations are idempotent — running twice does not duplicate items', async () => {
    await runMigrations(db);

    const row = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM content_items`,
    );
    expect(row?.cnt).toBe(150);
  });

  it('content items include all four body types: cloze, mcq, free_recall, numeric', async () => {
    const types = await db.getAllAsync<{ type: string }>(
      `SELECT DISTINCT json_extract(body, '$.type') AS type FROM content_items ORDER BY type`,
    );
    const typeNames = types.map(t => t.type).sort();
    expect(typeNames).toContain('cloze');
    expect(typeNames).toContain('mcq');
    expect(typeNames).toContain('free_recall');
    expect(typeNames).toContain('numeric');
  });

  it('pack versioning: all items have contentVersion = 1', async () => {
    const nonV1 = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM content_items WHERE content_version != 1`,
    );
    expect(nonV1?.cnt).toBe(0);
  });

  it('db_version is 3 after all migrations run', async () => {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_state WHERE key = 'db_version'`,
    );
    expect(row?.value).toBe('3');
  });

  it('complex-care-2 pack: 44 items all in session 4 week 1', async () => {
    const repo = new ContentItemRepository(db);
    const items = await repo.findByPack('complex-care-2-pack');
    expect(items).toHaveLength(44);
    const gates = items.map(i => i.releaseGate);
    expect(gates.every(g => g.sessionIndex === 4 && g.week === 1)).toBe(true);
  });

  it('all current items are standalone (no rampTier): ChainGate returns active for all with empty states', async () => {
    const repo = new ContentItemRepository(db);
    const packIds = ['terminology-pack', 'pharm-pack', 'foundations-pack', 'dosage-pack', 'complex-care-2-pack'];
    const allItems = (await Promise.all(packIds.map(p => repo.findByPack(p)))).flat();
    expect(allItems.length).toBe(150);

    const gate = new ChainGate(allItems);
    const emptyStates = new Map();
    const statuses = allItems.map(item => gate.check(item, emptyStates));
    expect(statuses.every(s => s === 'active')).toBe(true);
  });

  it('graph links in all-standalone content are plain strings (no rampChain links)', async () => {
    const allLinks = await db.getAllAsync<{ id: string; graph_links: string }>(
      `SELECT id, graph_links FROM content_items`,
    );
    const rampChainLinks: string[] = [];
    for (const row of allLinks) {
      const links = JSON.parse(row.graph_links) as GraphLink[];
      for (const link of links) {
        if (typeof link === 'object' && link !== null && link.linkType === 'rampChain') {
          rampChainLinks.push(`${row.id}`);
        }
      }
    }
    expect(rampChainLinks, `Items with unexpected rampChain links: ${rampChainLinks.join(', ')}`).toHaveLength(0);
  });

  it('FSRS state preservation: re-running migrations does not clear item_memory_states', async () => {
    // Simulate a user who has existing FSRS progress, then receives a content migration.
    // The item_memory_states table must be untouched by content re-seeding.
    const memRepo = new ItemMemoryStateRepository(db);

    // Write a synthetic FSRS state for an existing item.
    await db.runAsync(
      `INSERT INTO item_memory_states
         (item_id, fsrs_stability, fsrs_difficulty, fsrs_due, fsrs_state,
          fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps,
          fsrs_reps, fsrs_lapses, relearn_streak, graduated,
          last_qualifying_date, updated_at)
       VALUES
         ('term-001', 21.5, 4.8, '2026-08-01T00:00:00.000Z', 'Review', 21, 21,
          0, 6, 0, 0, 1, '2026-07-11T00:00:00.000Z', '2026-07-11T00:00:00.000Z')`,
    );

    const stateBefore = await memRepo.findByItemId('term-001');
    expect(stateBefore).not.toBeNull();
    expect(stateBefore!.fsrs.stability).toBeCloseTo(21.5);
    expect(stateBefore!.graduated).toBe(true);

    // Re-run all migrations (simulates app restart after content update).
    await runMigrations(db);

    // State must be exactly preserved — content_items upsert never touches item_memory_states.
    const stateAfter = await memRepo.findByItemId('term-001');
    expect(stateAfter).not.toBeNull();
    expect(stateAfter!.fsrs.stability).toBeCloseTo(21.5);
    expect(stateAfter!.graduated).toBe(true);
    expect(stateAfter!.fsrs.reps).toBe(6);
  });

  it('migration atomicity: partial load (db_version=1, some items present) self-heals on re-run', async () => {
    // Simulate a crash mid-seed: schema is applied (001) but version was never
    // bumped to 2, meaning some items may or may not be present.
    // runMigrations must recover to a fully-populated db with db_version=2.
    const freshDb = openTestDb();
    await runSchemaOnly(freshDb);

    // Manually insert a subset of items directly, leaving db_version=1.
    await freshDb.runAsync(
      `INSERT INTO content_items
         (id, pillar, format, difficulty_tier, body, source_citation,
          last_reviewed_at, high_alert, graph_links,
          release_gate_session_index, release_gate_week,
          content_pack_id, content_version, placeholder)
       VALUES
         ('term-001', 'terminology', 'cloze', 1, '{}', 'test',
          '2026-07-04', 0, '[]', 1, 1, 'terminology-pack', 1, 1)`,
    );

    const versionBefore = await freshDb.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_state WHERE key = 'db_version'`,
    );
    expect(versionBefore?.value).toBe('1'); // still at 1 — simulated crash state

    // Re-run the full migration runner — should recover.
    await runMigrations(freshDb);

    const versionAfter = await freshDb.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_state WHERE key = 'db_version'`,
    );
    expect(versionAfter?.value).toBe('3');

    const count = await freshDb.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM content_items`,
    );
    expect(count?.cnt).toBe(150);
  });
});
