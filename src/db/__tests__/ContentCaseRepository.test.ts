import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../test-utils/BetterSQLiteDatabase';
import { runMigrations } from '../migrations/runner';
import { ContentCaseRepository } from '../repositories/ContentCaseRepository';
import { ContentItemRepository } from '../repositories/ContentItemRepository';
import type { IDatabase } from '../types';
import type { ContentCase } from '../../domain/types';

let db: IDatabase;

beforeEach(async () => {
  db = openTestDb();
  await runMigrations(db);
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const matrixCase: ContentCase = {
  caseId: 'case-matrix-001',
  session: 1,
  week: 2,
  courseSlug: 'foundations',
  pillar: 'concepts',
  scenario: 'Mr. Davis, 68 y/o male, post-op day 1 after hip arthroplasty. VS: BP 158/94, HR 88, SpO2 96%, Temp 37.8°C.',
  exhibits: [
    { label: 'Medications', title: 'Current Medications', body: 'Enoxaparin 40 mg SQ daily, Metoprolol 25 mg PO BID' },
    { label: 'Labs', title: 'Morning Labs', body: 'Hgb 9.2, K+ 3.3, Na 138' },
  ],
  prompt: 'Classify each assessment finding.',
  presentation: 'matrix',
  presentationData: { columns: ['Anticipated', 'Contraindicated', 'Non-Essential'] },
  sourceCitation: 'Potter & Perry 9e ch. 37',
  contentVersion: 1,
  placeholder: true,
  lastReviewedAt: null,
};

const dropdownCase: ContentCase = {
  caseId: 'case-dropdown-001',
  session: 2,
  week: 1,
  courseSlug: 'pharm',
  pillar: 'pharm',
  scenario: 'Ms. Chen is prescribed lisinopril 10 mg daily for hypertension.',
  exhibits: [
    { label: 'Chart', title: 'Medication Administration Record', body: 'Lisinopril 10 mg PO daily' },
  ],
  prompt: 'Complete the following clinical summary.',
  presentation: 'dropdown_sentence',
  presentationData: {
    template: 'Lisinopril is an {{1}} inhibitor used to treat {{2}}.',
  },
  sourceCitation: 'Karch 2022 Focus on Pharmacology ch. 28',
  contentVersion: 1,
  placeholder: true,
  lastReviewedAt: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContentCaseRepository', () => {
  it('upsert and findById — matrix presentation', async () => {
    const repo = new ContentCaseRepository(db);
    await repo.upsert(matrixCase);

    const found = await repo.findById('case-matrix-001');
    expect(found).not.toBeNull();
    expect(found!.caseId).toBe('case-matrix-001');
    expect(found!.session).toBe(1);
    expect(found!.week).toBe(2);
    expect(found!.courseSlug).toBe('foundations');
    expect(found!.pillar).toBe('concepts');
    expect(found!.presentation).toBe('matrix');
    expect(found!.presentationData).toEqual({ columns: ['Anticipated', 'Contraindicated', 'Non-Essential'] });
    expect(found!.exhibits).toHaveLength(2);
    expect(found!.exhibits[0].label).toBe('Medications');
    expect(found!.placeholder).toBe(true);
    expect(found!.lastReviewedAt).toBeNull();
    expect(found!.contentVersion).toBe(1);
  });

  it('upsert and findById — dropdown_sentence presentation', async () => {
    const repo = new ContentCaseRepository(db);
    await repo.upsert(dropdownCase);

    const found = await repo.findById('case-dropdown-001');
    expect(found).not.toBeNull();
    expect(found!.presentation).toBe('dropdown_sentence');
    expect(found!.presentationData).toEqual({
      template: 'Lisinopril is an {{1}} inhibitor used to treat {{2}}.',
    });
    expect(found!.session).toBe(2);
    expect(found!.pillar).toBe('pharm');
    expect(found!.lastReviewedAt).toBeNull();
  });

  it('findById returns null for unknown caseId', async () => {
    const repo = new ContentCaseRepository(db);
    const found = await repo.findById('does-not-exist');
    expect(found).toBeNull();
  });

  it('findByIds — batch lookup returns only matching cases, unknown ids absent', async () => {
    const repo = new ContentCaseRepository(db);
    await repo.upsert(matrixCase);
    await repo.upsert(dropdownCase);

    const results = await repo.findByIds(['case-matrix-001', 'case-dropdown-001', 'ghost-id']);
    expect(results).toHaveLength(2);
    const ids = results.map(c => c.caseId).sort();
    expect(ids).toEqual(['case-dropdown-001', 'case-matrix-001']);
  });

  it('findByIds with empty array returns empty without querying', async () => {
    const repo = new ContentCaseRepository(db);
    const results = await repo.findByIds([]);
    expect(results).toHaveLength(0);
  });

  it('upsert is idempotent — re-inserting the same case does not duplicate', async () => {
    const repo = new ContentCaseRepository(db);
    await repo.upsert(matrixCase);
    await repo.upsert(matrixCase);

    const count = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM content_cases WHERE case_id = 'case-matrix-001'`,
    );
    expect(count?.cnt).toBe(1);
  });

  it('upsert updates fields on conflict', async () => {
    const repo = new ContentCaseRepository(db);
    await repo.upsert(matrixCase);

    const updated: ContentCase = {
      ...matrixCase,
      contentVersion: 2,
      lastReviewedAt: '2026-07-12',
      placeholder: false,
    };
    await repo.upsert(updated);

    const found = await repo.findById('case-matrix-001');
    expect(found!.contentVersion).toBe(2);
    expect(found!.lastReviewedAt).toBe('2026-07-12');
    expect(found!.placeholder).toBe(false);
  });

  it('findByCaseId on ContentItemRepository returns rows sorted by caseOrder ascending', async () => {
    // Upsert the case first (FK constraint on content_items.case_id).
    const caseRepo = new ContentCaseRepository(db);
    await caseRepo.upsert(matrixCase);

    // Upsert case-row items through the repository write path (case_id / case_order
    // now included in ContentItemRepository.upsert()).
    const itemRepo = new ContentItemRepository(db);
    const makeRow = (
      id: string,
      rowLabel: string,
      caseOrder: number,
    ): ContentItem => ({
      id,
      pillar: 'concepts',
      format: 'matrix_row',
      difficultyTier: 1,
      body: { type: 'matrix_row', rowLabel, correctColumn: 0, rationale: 'See exhibit.' },
      sourceCitation: 'Potter & Perry 9e ch. 37',
      lastReviewedAt: '2026-07-12',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 2 },
      contentPackId: 'foundations-pack',
      contentVersion: 1,
      placeholder: true,
      caseId: 'case-matrix-001',
      caseOrder,
    });

    // Inserted out of order — findByCaseId must return them sorted by caseOrder.
    await itemRepo.upsert(makeRow('case-row-c', 'Elevated BP', 3));
    await itemRepo.upsert(makeRow('case-row-a', 'Low Hgb', 1));
    await itemRepo.upsert(makeRow('case-row-b', 'Low K+', 2));

    const rows = await itemRepo.findByCaseId('case-matrix-001');

    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe('case-row-a');
    expect(rows[0].caseOrder).toBe(1);
    expect(rows[1].id).toBe('case-row-b');
    expect(rows[1].caseOrder).toBe(2);
    expect(rows[2].id).toBe('case-row-c');
    expect(rows[2].caseOrder).toBe(3);
    expect(rows.every(r => r.caseId === 'case-matrix-001')).toBe(true);
  });

  it('findByCaseId returns empty array for unknown caseId', async () => {
    const itemRepo = new ContentItemRepository(db);
    const rows = await itemRepo.findByCaseId('ghost-case');
    expect(rows).toHaveLength(0);
  });
});
