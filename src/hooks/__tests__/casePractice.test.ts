/**
 * Case practice tests — T1 through T6.
 *
 * T1: findAll() returns all seeded cases; empty when no cases seeded.
 * T2: computeCasePracticeItems returns rows in caseOrder ASC per bundle.
 * T3: ADR-9 regression — findByPackAndWeek excludes case_id IS NOT NULL rows.
 * T4: ADR-9 regression — findWeeksByPack excludes case rows.
 * T5: ADR-9 regression — findPillarsByPackAndWeek excludes case rows.
 * T6: computeCasePracticeItems calls no write methods (data loading performs
 *     no writes). NOTE: the no-op onSubmit is the sole no-write guarantee
 *     for the submit path — verified by reading, not by test.
 *
 * T1/T2 and T3/T4/T5 use a real in-memory SQLite database so the SQL
 * exclusion clauses are exercised end-to-end, not mocked away.
 * T6 uses mock repos so write calls can be tracked by vitest spies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openTestDb } from '../../db/test-utils/BetterSQLiteDatabase';
import { runMigrations } from '../../db/migrations/runner';
import { ContentCaseRepository } from '../../db/repositories/ContentCaseRepository';
import { ContentItemRepository } from '../../db/repositories/ContentItemRepository';
import { computeCasePracticeItems } from '../useCasePractice';
import type { IDatabase } from '../../db/types';
import type { ContentCase, ContentItem } from '../../domain/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCase(caseId: string): ContentCase {
  return {
    caseId,
    session: 1,
    week: 1,
    courseSlug: 'foundations',
    pillar: 'concepts',
    scenario: `Scenario for ${caseId}`,
    exhibits: [],
    prompt: 'Classify each finding.',
    presentation: 'matrix',
    presentationData: { columns: ['Anticipated', 'Contraindicated', 'Non-Essential'] },
    sourceCitation: 'Test source',
    contentVersion: 1,
    placeholder: true,
    lastReviewedAt: null,
  };
}

function makeCaseRow(
  id: string,
  caseId: string,
  caseOrder: number,
): ContentItem {
  return {
    id,
    pillar: 'concepts',
    format: 'matrix_row',
    difficultyTier: 1,
    body: { type: 'matrix_row', rowLabel: `Row ${caseOrder}`, correctColumn: 0, rationale: 'R' },
    sourceCitation: 'Test source',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex: 1, week: 1 },
    contentPackId: 'test-case-pack',
    contentVersion: 1,
    placeholder: true,
    caseId,
    caseOrder,
  };
}

function makeRegularItem(id: string, week = 1, pillar: ContentItem['pillar'] = 'terminology'): ContentItem {
  return {
    id,
    pillar,
    format: 'cloze',
    difficultyTier: 1,
    body: { type: 'cloze', front: 'Q {{blank}}', back: 'A' },
    sourceCitation: 'Test source',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex: 1, week },
    contentPackId: 'test-pack',
    contentVersion: 1,
    placeholder: false,
    caseId: null,
    caseOrder: null,
  };
}

// ─── Integration setup ────────────────────────────────────────────────────────

let db: IDatabase;
let caseRepo: ContentCaseRepository;
let itemRepo: ContentItemRepository;

beforeEach(async () => {
  db = openTestDb();
  await runMigrations(db);
  caseRepo = new ContentCaseRepository(db);
  itemRepo = new ContentItemRepository(db);
});

// ─── T1: findAll ──────────────────────────────────────────────────────────────

describe('T1 — ContentCaseRepository.findAll()', () => {
  it('returns empty array when no cases are seeded', async () => {
    const cases = await caseRepo.findAll();
    expect(cases).toHaveLength(0);
  });

  it('returns all seeded cases', async () => {
    await caseRepo.upsert(makeCase('case-alpha'));
    await caseRepo.upsert(makeCase('case-beta'));
    const cases = await caseRepo.findAll();
    expect(cases).toHaveLength(2);
    const ids = cases.map(c => c.caseId).sort();
    expect(ids).toEqual(['case-alpha', 'case-beta']);
  });

  it('returns a single case when only one is seeded', async () => {
    await caseRepo.upsert(makeCase('case-solo'));
    const cases = await caseRepo.findAll();
    expect(cases).toHaveLength(1);
    expect(cases[0].caseId).toBe('case-solo');
  });
});

// ─── T2: row ordering ─────────────────────────────────────────────────────────

describe('T2 — computeCasePracticeItems row ordering', () => {
  it('returns rows in caseOrder ASC when items are inserted out of order', async () => {
    await caseRepo.upsert(makeCase('case-order-test'));
    // Insert deliberately out of order.
    await itemRepo.upsert(makeCaseRow('row-c', 'case-order-test', 3));
    await itemRepo.upsert(makeCaseRow('row-a', 'case-order-test', 1));
    await itemRepo.upsert(makeCaseRow('row-b', 'case-order-test', 2));

    const bundles = await computeCasePracticeItems(caseRepo, itemRepo);

    expect(bundles).toHaveLength(1);
    const { rows } = bundles[0];
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe('row-a');
    expect(rows[0].caseOrder).toBe(1);
    expect(rows[1].id).toBe('row-b');
    expect(rows[1].caseOrder).toBe(2);
    expect(rows[2].id).toBe('row-c');
    expect(rows[2].caseOrder).toBe(3);
  });

  it('bundles with zero rows are omitted', async () => {
    await caseRepo.upsert(makeCase('case-empty'));
    await caseRepo.upsert(makeCase('case-with-rows'));
    await itemRepo.upsert(makeCaseRow('row-1', 'case-with-rows', 1));

    const bundles = await computeCasePracticeItems(caseRepo, itemRepo);

    expect(bundles).toHaveLength(1);
    expect(bundles[0].caseData.caseId).toBe('case-with-rows');
  });

  it('returns bundles for multiple cases, each with correct rows', async () => {
    await caseRepo.upsert(makeCase('case-x'));
    await caseRepo.upsert(makeCase('case-y'));
    await itemRepo.upsert(makeCaseRow('x-row-1', 'case-x', 1));
    await itemRepo.upsert(makeCaseRow('x-row-2', 'case-x', 2));
    await itemRepo.upsert(makeCaseRow('y-row-1', 'case-y', 1));

    const bundles = await computeCasePracticeItems(caseRepo, itemRepo);

    expect(bundles).toHaveLength(2);
    const xBundle = bundles.find(b => b.caseData.caseId === 'case-x')!;
    const yBundle = bundles.find(b => b.caseData.caseId === 'case-y')!;
    expect(xBundle.rows).toHaveLength(2);
    expect(yBundle.rows).toHaveLength(1);
  });
});

// ─── T3/T4/T5: ADR-9 regression ──────────────────────────────────────────────
//
// All three query methods must exclude rows where case_id IS NOT NULL.
// These are the AND case_id IS NULL clauses added in ADR-9 param 3.

describe('T3 — ADR-9: findByPackAndWeek excludes case-linked rows', () => {
  it('case rows in the same pack are excluded while regular items appear', async () => {
    await caseRepo.upsert(makeCase('case-adr9'));
    // Regular item in test-pack, case_id = null — should appear.
    await itemRepo.upsert(makeRegularItem('regular-1', 1));
    // Case-linked item also in test-pack — must be excluded by case_id IS NULL.
    await itemRepo.upsert({
      ...makeCaseRow('case-row-1', 'case-adr9', 1),
      contentPackId: 'test-pack',
    });

    const results = await itemRepo.findByPackAndWeek('test-pack', 1, undefined);
    const ids = results.map(i => i.id);
    expect(ids).toContain('regular-1');
    expect(ids).not.toContain('case-row-1');
  });

  it('findByPackAndWeek returns empty when only case-linked items exist in the pack', async () => {
    await caseRepo.upsert(makeCase('case-only'));
    // test-case-pack has no seeded regular items — only this case row.
    await itemRepo.upsert(makeCaseRow('case-row-only', 'case-only', 1));

    const results = await itemRepo.findByPackAndWeek('test-case-pack', 1, undefined);
    expect(results).toHaveLength(0);
  });
});

describe('T4 — ADR-9: findWeeksByPack excludes case rows', () => {
  it('weeks contributed only by case-linked items do not appear in the pack', async () => {
    // test-case-pack has no seeded regular items.
    await caseRepo.upsert(makeCase('case-weeks'));
    await itemRepo.upsert(makeCaseRow('case-row-w1', 'case-weeks', 1));

    // test-case-pack has only case rows — findWeeksByPack must return empty.
    const weeks = await itemRepo.findWeeksByPack('test-case-pack');
    expect(weeks).toHaveLength(0);
  });

  it('regular items still surface their weeks', async () => {
    await itemRepo.upsert(makeRegularItem('r-w1', 1));
    await itemRepo.upsert(makeRegularItem('r-w2', 2));

    const weeks = await itemRepo.findWeeksByPack('test-pack');
    expect(weeks.sort()).toEqual([1, 2]);
  });
});

describe('T5 — ADR-9: findPillarsByPackAndWeek excludes case rows', () => {
  it('pillars contributed only by case-linked items do not appear in the pack', async () => {
    // test-case-pack has no seeded regular items.
    await caseRepo.upsert(makeCase('case-pillars'));
    await itemRepo.upsert(makeCaseRow('case-row-concepts', 'case-pillars', 1));

    const pillars = await itemRepo.findPillarsByPackAndWeek('test-case-pack', undefined);
    expect(pillars).not.toContain('concepts');
    expect(pillars).toHaveLength(0);
  });

  it('regular items still surface their pillars', async () => {
    await itemRepo.upsert(makeRegularItem('r-pharm', 1, 'pharm'));
    await itemRepo.upsert(makeRegularItem('r-terminology', 1, 'terminology'));

    const pillars = await itemRepo.findPillarsByPackAndWeek('test-pack', undefined);
    expect(pillars.sort()).toEqual(['pharm', 'terminology']);
  });
});

// ─── T6: no writes on data loading ───────────────────────────────────────────
//
// computeCasePracticeItems accepts only read-capable repo interfaces by
// construction, but we verify explicitly that no write method fires.
// Untested-wiring item 6: the no-op onSubmit in case-preview.tsx is the
// sole no-write guarantee for the submit path — verified by reading, not test.

describe('T6 — computeCasePracticeItems performs no writes', () => {
  it('no write methods are called on caseRepo or itemRepo during data loading', async () => {
    const mockCaseRepo = {
      findAll: vi.fn().mockResolvedValue([]),
      upsert:  vi.fn().mockResolvedValue(undefined),
      findById:   vi.fn().mockResolvedValue(null),
      findByIds:  vi.fn().mockResolvedValue([]),
    } as unknown as ContentCaseRepository;

    const mockItemRepo = {
      findByCaseId:              vi.fn().mockResolvedValue([]),
      findByPackAndWeek:         vi.fn().mockResolvedValue([]),
      findWeeksByPack:           vi.fn().mockResolvedValue([]),
      findPillarsByPackAndWeek:  vi.fn().mockResolvedValue([]),
      upsert:                    vi.fn().mockResolvedValue(undefined),
      findById:                  vi.fn().mockResolvedValue(null),
      findByPack:                vi.fn().mockResolvedValue([]),
      findUnlocked:              vi.fn().mockResolvedValue([]),
      countByPack:               vi.fn().mockResolvedValue(0),
    } as unknown as ContentItemRepository;

    await computeCasePracticeItems(mockCaseRepo, mockItemRepo);

    expect(mockCaseRepo.upsert).not.toHaveBeenCalled();
    expect(mockItemRepo.upsert).not.toHaveBeenCalled();
  });
});
