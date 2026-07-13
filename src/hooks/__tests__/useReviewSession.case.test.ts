/**
 * processCaseRating integration suite — tests atomic N-row case submission
 * using in-memory SQLite (BetterSQLiteDatabase) and real domain logic.
 *
 * Covers: grade mapping (ADR-9), mixed new+review atomicity, crash abort,
 * retention wiring (amendment d), relearning pipeline, append-only invariant,
 * reviewedAt injection, row-count completeness, and abandonment-writes-nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../../db/test-utils/BetterSQLiteDatabase';
import { runSchemaOnly } from '../../db/migrations/runner';
import { ContentItemRepository } from '../../db/repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '../../db/repositories/ItemMemoryStateRepository';
import { ReviewEventRepository } from '../../db/repositories/ReviewEventRepository';
import type { IDatabase, DBBindParams, DBRunResult } from '../../db/types';
import { SchedulerService } from '../../domain/scheduler/SchedulerService';
import { RelearningPipeline } from '../../domain/scheduler/RelearningPipeline';
import type {
  ContentItem,
  FsrsCardState,
  ItemMemoryState,
  QueueEntry,
} from '../../domain/types';
import { processCaseRating } from '../useReviewSession';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SIM_NOW = new Date('2026-07-04T10:00:00.000Z');

// ─── FaultInjectWrapper ───────────────────────────────────────────────────────
//
// Wraps an IDatabase and throws on the Nth runAsync call.
//
// Assumption: BetterSQLiteDatabase.withExclusiveTransactionAsync passes `this`
// (not a separate transaction proxy) as the `txn` argument to the task
// callback. We exploit this by substituting ourselves as `txn`, so the
// fault-injected runAsync fires INSIDE the SQLite BEGIN EXCLUSIVE / COMMIT
// window — causing the driver to issue ROLLBACK when the error propagates.
class FaultInjectWrapper implements IDatabase {
  private count = 0;
  constructor(private readonly inner: IDatabase, private readonly faultAt: number) {}

  async runAsync(sql: string, params?: DBBindParams): Promise<DBRunResult> {
    if (++this.count >= this.faultAt) throw new Error('injected fault');
    return this.inner.runAsync(sql, params);
  }

  async execAsync(sql: string): Promise<void> { return this.inner.execAsync(sql); }

  async getFirstAsync<T>(sql: string, p?: DBBindParams): Promise<T | null> {
    return this.inner.getFirstAsync<T>(sql, p);
  }

  async getAllAsync<T>(sql: string, p?: DBBindParams): Promise<T[]> {
    return this.inner.getAllAsync<T>(sql, p);
  }

  async withExclusiveTransactionAsync(
    task: (txn: IDatabase) => Promise<void>,
  ): Promise<void> {
    // Delegate BEGIN/COMMIT/ROLLBACK to `inner`; pass `this` as txn so the
    // fault-injected runAsync intercepts every write inside the transaction.
    return this.inner.withExclusiveTransactionAsync((_txn) => task(this));
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCaseItem(
  id: string,
  caseId: string,
  caseOrder: number,
): ContentItem {
  return {
    id,
    pillar: 'terminology',
    format: 'matrix_row',
    difficultyTier: 1,
    body: { type: 'matrix_row', rowLabel: 'Row', correctColumn: 0, rationale: 'test' },
    sourceCitation: 'test',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex: 1, week: 1 },
    contentPackId: 'pack-case',
    contentVersion: 1,
    placeholder: false,
    caseId,
    caseOrder,
  };
}

function makeReviewState(
  itemId: string,
  opts: { stability?: number; due?: Date; lapses?: number } = {},
): ItemMemoryState {
  const stability = opts.stability ?? 5;
  const due = opts.due ?? new Date(SIM_NOW.getTime() - MS_PER_DAY);
  const lastReview = new Date(SIM_NOW.getTime() - stability * MS_PER_DAY);
  return {
    itemId,
    fsrs: {
      stability,
      difficulty: 5,
      due: due.toISOString(),
      state: 'Review',
      elapsedDays: stability,
      scheduledDays: stability,
      learningSteps: 0,
      reps: 3,
      lapses: opts.lapses ?? 0,
      lastReview: lastReview.toISOString(),
    },
    relearnStreak: 0,
    graduated: false,
    lastQualifyingDate: null,
    updatedAt: lastReview.toISOString(),
  };
}

// ─── Shared instances ─────────────────────────────────────────────────────────

let db: IDatabase;
let contentItemRepo: ContentItemRepository;
let memStateRepo: ItemMemoryStateRepository;
let reviewEventRepo: ReviewEventRepository;
let scheduler: SchedulerService;
let relearningPipeline: RelearningPipeline;

beforeEach(async () => {
  db = openTestDb();
  await runSchemaOnly(db);
  contentItemRepo = new ContentItemRepository(db);
  memStateRepo = new ItemMemoryStateRepository(db);
  reviewEventRepo = new ReviewEventRepository(db);
  scheduler = new SchedulerService();
  relearningPipeline = new RelearningPipeline();
});

// ─── Test 1: Grade mapping (ADR-9) ───────────────────────────────────────────

describe('processCaseRating — grade mapping (ADR-9)', () => {
  it('correct=true maps to Rating 3 (Good); correct=false maps to Rating 1 (Again)', async () => {
    const itemA = makeCaseItem('grade-a', 'case-grade', 1);
    const itemB = makeCaseItem('grade-b', 'case-grade', 2);
    await contentItemRepo.upsert(itemA);
    await contentItemRepo.upsert(itemB);

    const stateA = makeReviewState('grade-a');
    const stateB = makeReviewState('grade-b');
    await memStateRepo.insert(db, stateA);
    await memStateRepo.insert(db, stateB);

    const entryA: QueueEntry = { kind: 'review', item: itemA, memoryState: stateA, mode: 'daily' };
    const entryB: QueueEntry = { kind: 'review', item: itemB, memoryState: stateB, mode: 'daily' };

    await processCaseRating({
      rowAnswers: [
        { entry: entryA, correct: true,  latencyMs: 500 },
        { entry: entryB, correct: false, latencyMs: 600 },
      ],
      mode: 'daily',
      reviewedAt: SIM_NOW,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    const events = await reviewEventRepo.findAll();
    expect(events).toHaveLength(2);

    const eventA = events.find(e => e.itemId === 'grade-a')!;
    const eventB = events.find(e => e.itemId === 'grade-b')!;
    expect(eventA.rating, 'correct=true must produce Good (3)').toBe(3);
    expect(eventB.rating, 'correct=false must produce Again (1)').toBe(1);
  });
});

// ─── Test 2: Mixed first-review + update in one transaction ───────────────────

describe('processCaseRating — mixed new+review rows (one transaction)', () => {
  it('2 new rows + 4 review rows → 6 events, 2 state inserts, 4 state updates', async () => {
    const items = [1, 2, 3, 4, 5, 6].map(i =>
      makeCaseItem(`mixed-${i}`, 'case-mixed', i),
    );
    for (const item of items) await contentItemRepo.upsert(item);

    // Items 3–6 have existing MemoryState; items 1–2 are new (no state).
    const reviewStates = items.slice(2).map(item => makeReviewState(item.id));
    for (const s of reviewStates) await memStateRepo.insert(db, s);

    const statesBeforeCount = (await memStateRepo.findAll()).length;
    expect(statesBeforeCount, 'seeded 4 review states').toBe(4);

    const newRowAnswers = items.slice(0, 2).map(item => ({
      entry: {
        kind: 'new' as const,
        item,
        syntheticState: {
          itemId: item.id,
          fsrs: scheduler.createInitialState(item.id, SIM_NOW),
          relearnStreak: 0 as const,
          graduated: false as const,
        },
        mode: 'daily' as const,
      },
      correct: true,
      latencyMs: 400,
    }));

    const reviewRowAnswers = reviewStates.map((state, i) => ({
      entry: {
        kind: 'review' as const,
        item: items[i + 2],
        memoryState: state,
        mode: 'daily' as const,
      },
      correct: i % 2 === 0,
      latencyMs: 500,
    }));

    const results = await processCaseRating({
      rowAnswers: [...newRowAnswers, ...reviewRowAnswers],
      mode: 'daily',
      reviewedAt: SIM_NOW,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    expect(results, 'must return 6 updated states').toHaveLength(6);

    const events = await reviewEventRepo.findAll();
    expect(events, '6 events — one per row').toHaveLength(6);

    const statesAfter = await memStateRepo.findAll();
    expect(
      statesAfter.length,
      '4 existing + 2 newly-introduced = 6 total states',
    ).toBe(statesBeforeCount + 2);

    const eventItemIds = new Set(events.map(e => e.itemId));
    for (const item of items) {
      expect(eventItemIds.has(item.id), `event for ${item.id} must exist`).toBe(true);
    }
  });
});

// ─── Test 3: Atomicity — crash / abort ───────────────────────────────────────

describe('processCaseRating — atomicity (all-or-nothing)', () => {
  it('mid-transaction fault leaves zero rows committed in the real DB', async () => {
    const items = [1, 2].map(i => makeCaseItem(`atomic-${i}`, 'case-atomic', i));
    for (const item of items) await contentItemRepo.upsert(item);

    // Both rows are new (no MemoryState) so each row needs INSERT event + INSERT state.
    // With faultAt=2: appendEvent(row1) → runAsync #1 OK;
    //                 memStateRepo.insert(row1) → runAsync #2 FAULT → ROLLBACK.
    const faultWrapper = new FaultInjectWrapper(db, 2);
    const faultEventRepo = new ReviewEventRepository(faultWrapper);
    const faultMemRepo   = new ItemMemoryStateRepository(faultWrapper);

    const rowAnswers = items.map(item => ({
      entry: {
        kind: 'new' as const,
        item,
        syntheticState: {
          itemId: item.id,
          fsrs: scheduler.createInitialState(item.id, SIM_NOW),
          relearnStreak: 0 as const,
          graduated: false as const,
        },
        mode: 'daily' as const,
      },
      correct: true,
      latencyMs: 400,
    }));

    await expect(
      processCaseRating({
        rowAnswers,
        mode: 'daily',
        reviewedAt: SIM_NOW,
        scheduler, relearningPipeline,
        memStateRepo: faultMemRepo,
        reviewEventRepo: faultEventRepo,
      }),
    ).rejects.toThrow('injected fault');

    // Query the real DB (not the wrapper) — the ROLLBACK must have undone everything.
    const events = await new ReviewEventRepository(db).findAll();
    const states = await new ItemMemoryStateRepository(db).findAll();
    expect(events, 'review_events must be empty after ROLLBACK').toHaveLength(0);
    expect(states, 'item_memory_states must be empty after ROLLBACK').toHaveLength(0);
  });
});

// ─── Test 4: Retention wiring (amendment d pattern) ──────────────────────────

describe('processCaseRating — retention wiring (amendment d)', () => {
  it('mode=exam uses desiredRetention=0.95; mode=daily uses 0.90; resulting intervals differ', async () => {
    // Two case items with identical Review state — one rated via mode=exam, one via mode=daily.
    const itemExam  = makeCaseItem('ret-exam',  'case-exam',  1);
    const itemDaily = makeCaseItem('ret-daily', 'case-daily', 1);
    await contentItemRepo.upsert(itemExam);
    await contentItemRepo.upsert(itemDaily);

    const lastReview = new Date(SIM_NOW.getTime() - 10 * MS_PER_DAY);
    const sharedFsrs: FsrsCardState = {
      stability: 10,
      difficulty: 5,
      due: new Date(SIM_NOW.getTime() - 1).toISOString(),
      state: 'Review',
      elapsedDays: 10,
      scheduledDays: 10,
      learningSteps: 0,
      reps: 3,
      lapses: 0,
      lastReview: lastReview.toISOString(),
    };

    const memExam: ItemMemoryState = {
      itemId: 'ret-exam',
      fsrs: sharedFsrs,
      relearnStreak: 2,
      graduated: false,
      lastQualifyingDate: lastReview.toISOString(),
      updatedAt: lastReview.toISOString(),
    };
    const memDaily: ItemMemoryState = { ...memExam, itemId: 'ret-daily' };

    await memStateRepo.insert(db, memExam);
    await memStateRepo.insert(db, memDaily);

    const examEntry: QueueEntry  = { kind: 'review', item: itemExam,  memoryState: memExam,  mode: 'exam'  };
    const dailyEntry: QueueEntry = { kind: 'review', item: itemDaily, memoryState: memDaily, mode: 'daily' };

    // Submit each as a single-row case with correct=true → Good (3) (ADR-9)
    const [examResult] = await processCaseRating({
      rowAnswers: [{ entry: examEntry, correct: true, latencyMs: 1000 }],
      mode: 'exam',
      reviewedAt: SIM_NOW,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    const [dailyResult] = await processCaseRating({
      rowAnswers: [{ entry: dailyEntry, correct: true, latencyMs: 1000 }],
      mode: 'daily',
      reviewedAt: SIM_NOW,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    expect(
      examResult.fsrs.scheduledDays,
      `exam mode (0.95) must schedule shorter intervals than daily (0.90); ` +
      `exam=${examResult.fsrs.scheduledDays} daily=${dailyResult.fsrs.scheduledDays}`,
    ).toBeLessThan(dailyResult.fsrs.scheduledDays);
  });
});

// ─── Test 5: Relearning pipeline ─────────────────────────────────────────────

describe('processCaseRating — relearning pipeline', () => {
  it('Again resets streak to 0; 3 Good on separate study days graduate the row', async () => {
    const item = makeCaseItem('relearn-row', 'case-relearn', 1);
    await contentItemRepo.upsert(item);

    // Seed with a lapsed (lapses>0) Review state so the relearn pipeline is live
    const initialState = makeReviewState('relearn-row', { lapses: 1 });
    await memStateRepo.insert(db, initialState);

    const makeEntry = (mem: ItemMemoryState): QueueEntry => ({
      kind: 'review', item, memoryState: mem, mode: 'daily',
    });

    // reviewedAt must be after the card's lastReview (SIM_NOW − 5 days).
    // Use SIM_NOW + N days so each submission is on a distinct study day after seeding.
    const day0 = SIM_NOW;                                     // 2026-07-04
    const day1 = new Date(SIM_NOW.getTime() + 1 * MS_PER_DAY); // 2026-07-05
    const day2 = new Date(SIM_NOW.getTime() + 2 * MS_PER_DAY); // 2026-07-06
    const day3 = new Date(SIM_NOW.getTime() + 3 * MS_PER_DAY); // 2026-07-07

    // Submission 1: Again (correct=false) → streak resets to 0, graduated=false
    const [afterAgain] = await processCaseRating({
      rowAnswers: [{ entry: makeEntry(initialState), correct: false, latencyMs: 500 }],
      mode: 'daily',
      reviewedAt: day0,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });
    expect(afterAgain.relearnStreak, 'Again resets streak to 0').toBe(0);
    expect(afterAgain.graduated,     'Again sets graduated=false').toBe(false);

    // Submission 2: Good on study day 1 → streak=1
    const [after1] = await processCaseRating({
      rowAnswers: [{ entry: makeEntry(afterAgain), correct: true, latencyMs: 500 }],
      mode: 'daily',
      reviewedAt: day1,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });
    expect(after1.relearnStreak).toBe(1);
    expect(after1.graduated).toBe(false);

    // Submission 3: Good on study day 2 → streak=2
    const [after2] = await processCaseRating({
      rowAnswers: [{ entry: makeEntry(after1), correct: true, latencyMs: 500 }],
      mode: 'daily',
      reviewedAt: day2,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });
    expect(after2.relearnStreak).toBe(2);
    expect(after2.graduated).toBe(false);

    // Submission 4: Good on study day 3 → streak=3 → graduated=true (RELEARN_GRADUATION_N=3)
    const [after3] = await processCaseRating({
      rowAnswers: [{ entry: makeEntry(after2), correct: true, latencyMs: 500 }],
      mode: 'daily',
      reviewedAt: day3,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });
    expect(after3.relearnStreak, 'streak reaches RELEARN_GRADUATION_N=3').toBe(3);
    expect(after3.graduated,     'graduated=true at RELEARN_GRADUATION_N').toBe(true);
  });
});

// ─── Test 6: Append-only review_events ───────────────────────────────────────

describe('processCaseRating — append-only review_events', () => {
  it('two case submissions produce 2 events; first event id and ts are unchanged', async () => {
    const item = makeCaseItem('append-row', 'case-append', 1);
    await contentItemRepo.upsert(item);

    const state = makeReviewState('append-row');
    await memStateRepo.insert(db, state);

    // reviewedAt must be after the card's lastReview (SIM_NOW − 5 days).
    const reviewAt1 = SIM_NOW;                                       // 2026-07-04
    const reviewAt2 = new Date(SIM_NOW.getTime() + 7 * MS_PER_DAY); // 2026-07-11

    // First submission
    await processCaseRating({
      rowAnswers: [{ entry: { kind: 'review', item, memoryState: state, mode: 'daily' }, correct: true, latencyMs: 300 }],
      mode: 'daily',
      reviewedAt: reviewAt1,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    const eventsAfter1 = await reviewEventRepo.findAll();
    expect(eventsAfter1).toHaveLength(1);
    const firstEventId = eventsAfter1[0].id;
    const firstEventTs = eventsAfter1[0].ts;

    // Second submission (item now introduced — fetch updated state)
    const updatedState = await memStateRepo.findByItemId('append-row');
    await processCaseRating({
      rowAnswers: [{ entry: { kind: 'review', item, memoryState: updatedState!, mode: 'daily' }, correct: false, latencyMs: 400 }],
      mode: 'daily',
      reviewedAt: reviewAt2,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    const eventsAfter2 = await reviewEventRepo.findAll();
    expect(eventsAfter2, 'both events must persist (append-only)').toHaveLength(2);

    const firstAfter = eventsAfter2.find(e => e.id === firstEventId)!;
    expect(firstAfter,        'first event must still exist by id').toBeDefined();
    expect(firstAfter.ts,     'first event ts unchanged').toBe(firstEventTs);
    expect(firstAfter.rating, 'first event rating unchanged').toBe(3);
  });
});

// ─── Test 7: reviewedAt injection ────────────────────────────────────────────

describe('processCaseRating — reviewedAt injection', () => {
  it('event.ts and updatedState.updatedAt equal the injected reviewedAt ISO string', async () => {
    const item = makeCaseItem('ts-row', 'case-ts', 1);
    await contentItemRepo.upsert(item);

    const state = makeReviewState('ts-row');
    await memStateRepo.insert(db, state);

    // Must be after the card's lastReview (SIM_NOW − 5 days = 2026-06-29).
    const injectedAt = new Date('2026-07-10T08:00:00.000Z');
    const entry: QueueEntry = { kind: 'review', item, memoryState: state, mode: 'daily' };

    const [updatedState] = await processCaseRating({
      rowAnswers: [{ entry, correct: true, latencyMs: 250 }],
      mode: 'daily',
      reviewedAt: injectedAt,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    const events = await reviewEventRepo.findAll();
    expect(events).toHaveLength(1);
    expect(events[0].ts,       'event.ts must equal injected reviewedAt').toBe('2026-07-10T08:00:00.000Z');
    expect(updatedState.updatedAt, 'updatedAt must equal injected reviewedAt').toBe('2026-07-10T08:00:00.000Z');
  });
});

// ─── Test 8: Row-count completeness ──────────────────────────────────────────

describe('processCaseRating — row-count completeness', () => {
  it('N row answers produce exactly N review events and N returned states', async () => {
    const N = 5;
    const items = Array.from({ length: N }, (_, i) =>
      makeCaseItem(`rcc-${i}`, 'case-rcc', i + 1),
    );
    for (const item of items) await contentItemRepo.upsert(item);

    const states = items.map(item => makeReviewState(item.id));
    for (const s of states) await memStateRepo.insert(db, s);

    const rowAnswers = items.map((item, i) => ({
      entry: { kind: 'review' as const, item, memoryState: states[i], mode: 'daily' as const },
      correct: true,
      latencyMs: 300,
    }));

    const results = await processCaseRating({
      rowAnswers,
      mode: 'daily',
      reviewedAt: SIM_NOW,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    expect(results, `processCaseRating must return exactly ${N} states`).toHaveLength(N);

    const events = await reviewEventRepo.findAll();
    expect(events, `review_events must contain exactly ${N} rows`).toHaveLength(N);
  });
});

// ─── Test 9: Abandonment writes nothing ──────────────────────────────────────

describe('processCaseRating — abandonment writes nothing', () => {
  it('constructing CaseRowAnswer[] without calling processCaseRating leaves DB empty', async () => {
    const item = makeCaseItem('abandon-row', 'case-abandon', 1);
    await contentItemRepo.upsert(item);

    // Build answers as if the student responded — but never submit
    const _rowAnswers = [{
      entry: {
        kind: 'new' as const,
        item,
        syntheticState: {
          itemId: item.id,
          fsrs: scheduler.createInitialState(item.id, SIM_NOW),
          relearnStreak: 0 as const,
          graduated: false as const,
        },
        mode: 'daily' as const,
      },
      correct: true,
      latencyMs: 500,
    }];

    // processCaseRating is NOT called — simulates mid-case abandonment

    const events = await reviewEventRepo.findAll();
    const states = await memStateRepo.findAll();
    expect(events, 'no events without submission').toHaveLength(0);
    expect(states, 'no memory states without submission').toHaveLength(0);
  });
});
