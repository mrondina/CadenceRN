/**
 * Case bundle abandonment tests — UI-layer restatement of ADR-9 param 7.
 *
 * ADR-9 param 7: "No DB writes before submit. Local state only. App suspension
 * flushes currentIndex pointing to case start → resumes at case beginning with
 * empty selections."
 *
 * Test 9 in useReviewSession.case.test.ts already verifies the domain layer:
 * processCaseRating is the sole write path and is never called on abandonment.
 * These tests add the session-store layer:
 *   1. DB tables are untouched for case items when processCaseRating is not called,
 *      even when standalone items in the same session ARE processed.
 *   2. flush() writes currentIndex = case-start to DB (not beyond it).
 *   3. restore() loads that index back → user resumes at the case start with
 *      empty local selections (UI starts fresh because CaseBundleCard state
 *      is discarded on unmount).
 *
 * Explicit gap: CaseBundleCard JSX rendering (submitted vs unsubmitted, exhibit
 * tab switching preserving selections) cannot be verified without
 * @testing-library/react-native, which is not in this project's toolchain.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../../db/test-utils/BetterSQLiteDatabase';
import { runSchemaOnly } from '../../db/migrations/runner';
import { ContentItemRepository } from '../../db/repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '../../db/repositories/ItemMemoryStateRepository';
import { ReviewEventRepository } from '../../db/repositories/ReviewEventRepository';
import { useSessionStore } from '../../stores/sessionStore';
import { processRating } from '../useReviewSession';
import { SchedulerService } from '../../domain/scheduler/SchedulerService';
import { RelearningPipeline } from '../../domain/scheduler/RelearningPipeline';
import type { ContentItem, QueueEntry, SyntheticItemState } from '../../domain/types';

const NOW = new Date('2026-07-13T10:00:00.000Z');
const scheduler = new SchedulerService();
const relearningPipeline = new RelearningPipeline();

// ─── Factories ────────────────────────────────────────────────────────────────

function makeStandaloneItem(id: string): ContentItem {
  return {
    id,
    pillar: 'concepts',
    format: 'cloze',
    difficultyTier: 1,
    body: { type: 'cloze', front: 'Q', back: 'A' },
    sourceCitation: 'test',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex: 1, week: 1 },
    contentPackId: 'pack-1',
    contentVersion: 1,
    placeholder: false,
    caseId: null,
    caseOrder: null,
  };
}

function makeCaseItem(id: string, caseId: string, caseOrder: number): ContentItem {
  return {
    id,
    pillar: 'concepts',
    format: 'matrix_row',
    difficultyTier: 2,
    body: {
      type: 'matrix_row',
      rowLabel: `Row ${caseOrder}`,
      correctColumn: 0,
      rationale: 'Rationale text',
    },
    sourceCitation: 'test',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex: 1, week: 1 },
    contentPackId: 'pack-1',
    contentVersion: 1,
    placeholder: false,
    caseId,
    caseOrder,
  };
}

function newEntry(item: ContentItem): QueueEntry {
  const syntheticState: SyntheticItemState = {
    itemId: item.id,
    fsrs: scheduler.createInitialState(item.id, NOW),
    relearnStreak: 0,
    graduated: false,
  };
  return { kind: 'new', item, syntheticState, mode: 'daily' };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('case bundle abandonment', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('item_memory_states and review_events remain empty for case items when processCaseRating is never called', async () => {
    const db = openTestDb();
    await runSchemaOnly(db);

    const itemRepo = new ContentItemRepository(db);
    const caseItems = [
      makeCaseItem('case-row-1', 'case-x', 1),
      makeCaseItem('case-row-2', 'case-x', 2),
      makeCaseItem('case-row-3', 'case-x', 3),
    ];
    for (const item of caseItems) await itemRepo.upsert(item);

    // Do NOT call processCaseRating — simulates user abandoning without submit.

    const states = await db.getAllAsync<{ item_id: string }>(
      `SELECT item_id FROM item_memory_states WHERE item_id IN ('case-row-1', 'case-row-2', 'case-row-3')`,
    );
    expect(states).toHaveLength(0);

    const events = await db.getAllAsync<{ item_id: string }>(
      `SELECT item_id FROM review_events WHERE item_id IN ('case-row-1', 'case-row-2', 'case-row-3')`,
    );
    expect(events).toHaveLength(0);
  });

  it('processing standalone items in the same session does not touch case item rows', async () => {
    const db = openTestDb();
    await runSchemaOnly(db);

    const itemRepo = new ContentItemRepository(db);
    const memStateRepo = new ItemMemoryStateRepository(db);
    const reviewEventRepo = new ReviewEventRepository(db);

    const standalone = makeStandaloneItem('standalone-1');
    const caseItems = [
      makeCaseItem('case-row-1', 'case-x', 1),
      makeCaseItem('case-row-2', 'case-x', 2),
    ];
    for (const item of [standalone, ...caseItems]) await itemRepo.upsert(item);

    // Process the standalone card (simulates normal session flow before hitting the bundle).
    await processRating({
      entry: newEntry(standalone),
      rating: 3,
      reviewedAt: NOW,
      latencyMs: 0,
      scheduler,
      relearningPipeline,
      memStateRepo,
      reviewEventRepo,
    });

    // Standalone item now has a memory state and a review event.
    const standaloneState = await db.getFirstAsync<{ item_id: string }>(
      `SELECT item_id FROM item_memory_states WHERE item_id = 'standalone-1'`,
    );
    expect(standaloneState).not.toBeNull();

    // Case item rows: nothing written — processCaseRating was never called.
    const caseStates = await db.getAllAsync<{ item_id: string }>(
      `SELECT item_id FROM item_memory_states WHERE item_id IN ('case-row-1', 'case-row-2')`,
    );
    expect(caseStates).toHaveLength(0);

    const caseEvents = await db.getAllAsync<{ item_id: string }>(
      `SELECT item_id FROM review_events WHERE item_id IN ('case-row-1', 'case-row-2')`,
    );
    expect(caseEvents).toHaveLength(0);
  });

  it('flush writes currentIndex = case-start to DB on app background', async () => {
    const db = openTestDb();
    await runSchemaOnly(db);

    // Queue: 2 standalones + 3 case rows. Case bundle starts at index 2.
    const queue: QueueEntry[] = [
      newEntry(makeStandaloneItem('s1')),
      newEntry(makeStandaloneItem('s2')),
      newEntry(makeCaseItem('r1', 'case-x', 1)),
      newEntry(makeCaseItem('r2', 'case-x', 2)),
      newEntry(makeCaseItem('r3', 'case-x', 3)),
    ];

    const store = useSessionStore.getState();
    store.setQueue(queue);
    // Simulate: standalone cards rated, currentIndex advanced to 2 (case start).
    useSessionStore.setState({ currentIndex: 2 });

    // App backgrounds — flush persists the index.
    await store.flush(db);

    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_state WHERE key = 'session_current_index'`,
    );
    expect(row?.value).toBe('2'); // points to case start, not beyond
  });

  it('missing case skip: advanceBy(group.size) moves currentIndex past all bundle rows', () => {
    // Documents the recovery behavior the session screen's useEffect implements
    // when casesMap.has(group.caseId) === false (data-integrity failure).
    // The useEffect calls store.advanceBy(group.size) — this test proves that
    // call produces the correct currentIndex.
    // Wire from the useEffect to advanceBy cannot be tested without RNTL.
    const queue: QueueEntry[] = [
      newEntry(makeStandaloneItem('s1')),
      newEntry(makeCaseItem('r1', 'case-missing', 1)),
      newEntry(makeCaseItem('r2', 'case-missing', 2)),
      newEntry(makeCaseItem('r3', 'case-missing', 3)),
      newEntry(makeStandaloneItem('s2')),
    ];
    const store = useSessionStore.getState();
    store.setQueue(queue);
    useSessionStore.setState({ currentIndex: 1 }); // at case-missing start

    // Simulate what the session screen's useEffect calls when case metadata is absent:
    const group = { kind: 'case' as const, startIndex: 1, size: 3, caseId: 'case-missing' };
    store.advanceBy(group.size);

    // currentIndex lands at 4 (s2), skipping all 3 case rows — student is not stranded
    expect(useSessionStore.getState().currentIndex).toBe(4);
  });

  it('restore after flush loads currentIndex = case-start → user sees empty selections', async () => {
    const db = openTestDb();
    await runSchemaOnly(db);

    const queue: QueueEntry[] = [
      newEntry(makeStandaloneItem('s1')),
      newEntry(makeStandaloneItem('s2')),
      newEntry(makeCaseItem('r1', 'case-x', 1)),
      newEntry(makeCaseItem('r2', 'case-x', 2)),
      newEntry(makeCaseItem('r3', 'case-x', 3)),
    ];

    // Seed DB with case-start index (simulating a previous flush at index 2).
    await db.runAsync(
      `INSERT OR REPLACE INTO app_state (key, value) VALUES ('session_current_index', '2')`,
    );

    const store = useSessionStore.getState();
    store.setQueue(queue); // setQueue resets currentIndex to 0
    expect(useSessionStore.getState().currentIndex).toBe(0);

    await store.restore(db); // restore overwrites with persisted value

    // currentIndex = 2 — the session screen routes to CaseBundleCard,
    // which initialises with empty selections (no persisted selection state).
    expect(useSessionStore.getState().currentIndex).toBe(2);
  });
});
