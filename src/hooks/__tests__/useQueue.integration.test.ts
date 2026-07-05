/**
 * useQueue integration suite — tests computeSessionQueue and processRating
 * using mock repositories (in-memory SQLite via BetterSQLiteDatabase) and
 * real domain logic. Covers all required gate/pull-ahead/exam scenarios plus
 * amendments (c) and (d).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../../db/test-utils/BetterSQLiteDatabase';
import { runSchemaOnly } from '../../db/migrations/runner';
import { ContentItemRepository } from '../../db/repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '../../db/repositories/ItemMemoryStateRepository';
import { ReviewEventRepository } from '../../db/repositories/ReviewEventRepository';
import type { IDatabase } from '../../db/types';
import { CohortBuilder, toDateStr } from '../../domain/cohort/CohortBuilder';
import { QueueBuilder } from '../../domain/scheduler/QueueBuilder';
import { SchedulerService } from '../../domain/scheduler/SchedulerService';
import { ExamModeCompressor } from '../../domain/scheduler/ExamModeCompressor';
import { RelearningPipeline } from '../../domain/scheduler/RelearningPipeline';
import type {
  Cohort,
  ContentItem,
  CourseInstance,
  FsrsCardState,
  ItemMemoryState,
  QueueEntry,
} from '../../domain/types';
import { DEFAULT_DAY_BOUNDARY } from '../../domain/types';
import { computeSessionQueue } from '../useQueue';
import { processRating } from '../useReviewSession';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Simulation anchor: 2026-07-04 10:00 UTC (matches harness)
const SIM_NOW = new Date('2026-07-04T10:00:00.000Z');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(
  id: string,
  packId: string,
  sessionIndex: number,
  week: number,
): ContentItem {
  return {
    id,
    pillar: 'terminology',
    format: 'cloze',
    difficultyTier: 1,
    body: { type: 'cloze', front: `Q {{blank}}`, back: 'A' },
    sourceCitation: 'test',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex, week },
    contentPackId: packId,
    contentVersion: 1,
    placeholder: false,
  };
}

function makeReviewState(
  itemId: string,
  opts: {
    due?: Date;
    stability?: number;
    lastReview?: Date;
    elapsedDays?: number;
    scheduledDays?: number;
  } = {},
): ItemMemoryState {
  const lastReview = opts.lastReview ?? new Date(SIM_NOW.getTime() - MS_PER_DAY);
  const stability = opts.stability ?? 5;
  const due = opts.due ?? new Date(SIM_NOW.getTime() + stability * MS_PER_DAY);
  return {
    itemId,
    fsrs: {
      stability,
      difficulty: 5,
      due: due.toISOString(),
      state: 'Review',
      elapsedDays: opts.elapsedDays ?? 1,
      scheduledDays: opts.scheduledDays ?? stability,
      learningSteps: 0,
      reps: 2,
      lapses: 0,
      lastReview: lastReview.toISOString(),
    },
    relearnStreak: 1,
    graduated: false,
    lastQualifyingDate: lastReview.toISOString(),
    updatedAt: lastReview.toISOString(),
  };
}

/**
 * Builds a cohort that started `daysAgo` days before SIM_NOW.
 * Sessions are built from the Bellarmine template (courses: [] by default).
 */
function makeCohort(daysAgo: number): Cohort {
  const startDate = new Date(SIM_NOW.getTime() - daysAgo * MS_PER_DAY);
  return new CohortBuilder().build({
    id: `cohort-${daysAgo}`,
    startDate,
    templateId: 'bellarmine-absn-v1',
  });
}

// ─── Shared domain instances ──────────────────────────────────────────────────

let db: IDatabase;
let contentItemRepo: ContentItemRepository;
let memStateRepo: ItemMemoryStateRepository;
let reviewEventRepo: ReviewEventRepository;
let scheduler: SchedulerService;
let queueBuilder: QueueBuilder;
let examCompressor: ExamModeCompressor;
let relearningPipeline: RelearningPipeline;

beforeEach(async () => {
  db = openTestDb();
  await runSchemaOnly(db);
  contentItemRepo = new ContentItemRepository(db);
  memStateRepo = new ItemMemoryStateRepository(db);
  reviewEventRepo = new ReviewEventRepository(db);
  scheduler = new SchedulerService();
  queueBuilder = new QueueBuilder(scheduler);
  examCompressor = new ExamModeCompressor(scheduler);
  relearningPipeline = new RelearningPipeline();
});

// ─── Test 1: Gate blocks / gate passes ───────────────────────────────────────

describe('useQueue — gate blocks / gate passes', () => {
  it('unlocked items appear as new; locked and pull-ahead items without MemoryState do not', async () => {
    // Cohort started 7 days ago → session 1, week 2 is current.
    // daysSinceStart=7 → weekWithinSession=floor(7/7)+1=2
    const cohort = makeCohort(7);
    const now = SIM_NOW;

    const itemS1W1 = makeItem('s1w1', 'pack-1', 1, 1); // unlocked: session 1, week 1
    const itemS1W2 = makeItem('s1w2', 'pack-1', 1, 2); // unlocked: session 1, week 2
    const itemS1W3 = makeItem('s1w3', 'pack-1', 1, 3); // locked: week 3 not yet reached
    const itemS2W1 = makeItem('s2w1', 'pack-2', 2, 1); // pull-ahead-available, no MemoryState
    const itemS3W1 = makeItem('s3w1', 'pack-3', 3, 1); // locked: too far ahead

    for (const item of [itemS1W1, itemS1W2, itemS1W3, itemS2W1, itemS3W1]) {
      await contentItemRepo.upsert(item);
    }

    const queue = await computeSessionQueue({
      now, cohort, contentItemRepo, memStateRepo, queueBuilder, examCompressor,
    });

    const ids = queue.map(e => e.item.id);

    expect(ids, 'session-1 week-1 item must appear').toContain('s1w1');
    expect(ids, 'session-1 week-2 item must appear').toContain('s1w2');
    expect(ids, 'session-1 week-3 item must not appear (locked)').not.toContain('s1w3');
    expect(ids, 'session-2 item must not appear (pull-ahead, no MemoryState)').not.toContain('s2w1');
    expect(ids, 'session-3 item must not appear (locked)').not.toContain('s3w1');

    for (const entry of queue) {
      expect(entry.kind, `${entry.item.id} must be kind=new`).toBe('new');
    }
  });
});

// ─── Test 2: Pull-ahead bypass ────────────────────────────────────────────────

describe('useQueue — pull-ahead bypass', () => {
  it('pull-ahead item with MemoryState (due=now) arrives via dueStates as kind=review and consumes no cap slot', async () => {
    const cohort = makeCohort(7);
    const now = SIM_NOW;

    const items = ['pa-1', 'pa-2', 'pa-3'].map(id => makeItem(id, 'pack-1', 1, 1));
    const pullAheadItem = makeItem('pa-pull', 'pack-2', 2, 1);
    for (const item of [...items, pullAheadItem]) await contentItemRepo.upsert(item);

    // Simulate pull-ahead tap: ItemMemoryState created with due=now
    const pullAheadState = makeReviewState('pa-pull', { due: now, stability: 3 });
    await memStateRepo.insert(db, pullAheadState);

    const queue = await computeSessionQueue({
      now, cohort, contentItemRepo, memStateRepo, queueBuilder, examCompressor,
      newItemCap: 3,
    });

    const pullEntry = queue.find(e => e.item.id === 'pa-pull');
    const ids = queue.map(e => e.item.id);

    expect(ids, 'pull-ahead item must appear').toContain('pa-pull');
    expect(pullEntry?.kind, 'pull-ahead item must be kind=review').toBe('review');

    const newIds = queue.filter(e => e.kind === 'new').map(e => e.item.id);
    expect(newIds.length, 'cap=3 must allow all 3 new items').toBe(3);
    for (const id of ['pa-1', 'pa-2', 'pa-3']) {
      expect(newIds, `${id} must appear as new`).toContain(id);
    }
  });
});

// ─── Test 3: Pull-ahead without MemoryState is gated ─────────────────────────

describe('useQueue — pull-ahead without MemoryState is gated', () => {
  it('pull-ahead-available item without MemoryState does not appear in queue', async () => {
    const cohort = makeCohort(7);
    const now = SIM_NOW;

    await contentItemRepo.upsert(makeItem('gated-regular', 'pack-1', 1, 1));
    await contentItemRepo.upsert(makeItem('gated-pull', 'pack-2', 2, 1));
    // No MemoryState for gated-pull

    const queue = await computeSessionQueue({
      now, cohort, contentItemRepo, memStateRepo, queueBuilder, examCompressor,
    });

    const ids = queue.map(e => e.item.id);
    expect(ids).toContain('gated-regular');
    expect(ids, 'pull-ahead item without MemoryState must not appear').not.toContain('gated-pull');
  });
});

// ─── Test 4: Cap with pull-ahead ─────────────────────────────────────────────

describe('useQueue — cap with pull-ahead', () => {
  it('newItemCap applies only to new items; pull-ahead review items are uncapped', async () => {
    const cohort = makeCohort(7);
    const now = SIM_NOW;

    const newItems = ['cap-1', 'cap-2', 'cap-3', 'cap-4', 'cap-5'].map(
      id => makeItem(id, 'pack-1', 1, 1),
    );
    const pullItem = makeItem('cap-pull', 'pack-2', 2, 1);

    for (const item of [...newItems, pullItem]) await contentItemRepo.upsert(item);

    const pullState = makeReviewState('cap-pull', { due: now, stability: 3 });
    await memStateRepo.insert(db, pullState);

    const queue = await computeSessionQueue({
      now, cohort, contentItemRepo, memStateRepo, queueBuilder, examCompressor,
      newItemCap: 3,
    });

    const newCount = queue.filter(e => e.kind === 'new').length;
    const reviewCount = queue.filter(e => e.kind === 'review').length;

    expect(newCount, 'exactly 3 new items (capped)').toBe(3);
    expect(reviewCount, 'exactly 1 review item (pull-ahead, uncapped)').toBe(1);
    expect(queue.length, 'total = 4').toBe(4);
    expect(
      queue.find(e => e.item.id === 'cap-pull')?.kind,
      'pull-ahead must be kind=review',
    ).toBe('review');
  });
});

// ─── Test 5: Abandoned items leave no trace and reappear ─────────────────────

describe('useQueue — abandoned items', () => {
  it('items in queue but not rated leave no MemoryState and reappear next session', async () => {
    const cohort = makeCohort(7);
    const now = SIM_NOW;

    const items = ['ab-1', 'ab-2', 'ab-3', 'ab-4', 'ab-5'].map(
      id => makeItem(id, 'pack-1', 1, 1),
    );
    for (const item of items) await contentItemRepo.upsert(item);

    // Day 1: build queue
    const day1Queue = await computeSessionQueue({
      now, cohort, contentItemRepo, memStateRepo, queueBuilder, examCompressor,
      newItemCap: 5,
    });

    expect(day1Queue.length, 'day 1 must have 5 items').toBe(5);

    // Rate only the first 3 — last 2 are abandoned (never rated, no MemoryState write)
    const abandoned = day1Queue.slice(-2);
    const abandonedIds = new Set(abandoned.map(e => e.item.id));

    for (const entry of day1Queue.slice(0, 3)) {
      await processRating({
        entry, rating: 3, reviewedAt: now, latencyMs: 1000,
        scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
      });
    }

    // No MemoryState for abandoned items
    for (const id of abandonedIds) {
      const state = await memStateRepo.findByItemId(id);
      expect(state, `${id}: must have no MemoryState after being abandoned`).toBeNull();
    }

    // Day 2: abandoned items reappear as new
    const now2 = new Date(SIM_NOW.getTime() + MS_PER_DAY);
    const day2Queue = await computeSessionQueue({
      now: now2, cohort, contentItemRepo, memStateRepo, queueBuilder, examCompressor,
      newItemCap: 5,
    });

    const day2Ids = new Set(day2Queue.map(e => e.item.id));
    for (const entry of abandoned) {
      expect(
        day2Ids.has(entry.item.id),
        `${entry.item.id}: must reappear on day 2`,
      ).toBe(true);
    }
  });
});

// ─── Test 6: Overlapping exam windows (amendment c) ──────────────────────────

describe('useQueue — overlapping exam windows (amendment c)', () => {
  it('shared item below threshold for both overlapping windows appears exactly once as mode=exam', async () => {
    // Two courses share pack-shared; courseA exam in 5 days, courseB exam in 8 days.
    // Both windows are active (≤ 10 days). The shared item is a candidate for both
    // because its retrievability decays below 0.95 at either exam date.
    const baseCohort = makeCohort(7);

    const examDateA = toDateStr(new Date(SIM_NOW.getTime() + 5 * MS_PER_DAY));
    const examDateB = toDateStr(new Date(SIM_NOW.getTime() + 8 * MS_PER_DAY));

    const courseA: CourseInstance = {
      id: 'course-a',
      sessionId: baseCohort.sessions[0].id,
      title: 'Course A',
      contentPackIds: ['pack-shared'],
      examDates: [examDateA],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const courseB: CourseInstance = {
      id: 'course-b',
      sessionId: baseCohort.sessions[0].id,
      title: 'Course B',
      contentPackIds: ['pack-shared'],
      examDates: [examDateB],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const cohortWithExams: Cohort = {
      ...baseCohort,
      sessions: baseCohort.sessions.map((s, i) =>
        i === 0 ? { ...s, courses: [courseA, courseB] } : s,
      ),
    };

    const sharedItem = makeItem('item-shared', 'pack-shared', 1, 1);
    await contentItemRepo.upsert(sharedItem);

    // stability=2, lastReview=1 day ago → elapsed at examA=6d, examB=9d
    // R(6, S=2) ≈ (1+6/18)^-1 ≈ 0.75 < 0.95 ✓
    // R(9, S=2) ≈ (1+9/18)^-1 ≈ 0.67 < 0.95 ✓
    const sharedState = makeReviewState('item-shared', {
      stability: 2,
      lastReview: new Date(SIM_NOW.getTime() - MS_PER_DAY),
      due: new Date(SIM_NOW.getTime() + 10 * MS_PER_DAY), // NOT in dueStates
    });
    await memStateRepo.insert(db, sharedState);

    // Empirically verify candidacy before asserting queue behavior
    const r5 = scheduler.predictRetrievability(
      sharedState.fsrs, new Date(SIM_NOW.getTime() + 5 * MS_PER_DAY),
    );
    const r8 = scheduler.predictRetrievability(
      sharedState.fsrs, new Date(SIM_NOW.getTime() + 8 * MS_PER_DAY),
    );
    expect(r5, `R at examA must be < 0.95 (actual: ${r5.toFixed(4)})`).toBeLessThan(0.95);
    expect(r8, `R at examB must be < 0.95 (actual: ${r8.toFixed(4)})`).toBeLessThan(0.95);

    const queue = await computeSessionQueue({
      now: SIM_NOW,
      cohort: cohortWithExams,
      contentItemRepo,
      memStateRepo,
      queueBuilder,
      examCompressor,
      newItemCap: 0, // suppress new items; focus on exam candidate dedup
    });

    const sharedEntries = queue.filter(e => e.item.id === 'item-shared');
    expect(sharedEntries.length, 'shared item must appear exactly once').toBe(1);
    expect(sharedEntries[0].mode, 'shared item must have mode=exam').toBe('exam');
    expect(sharedEntries[0].kind, 'shared item must be kind=review').toBe('review');
  });
});

// ─── Test 7: Retention wiring (amendment d) ───────────────────────────────────

describe('useReviewSession — retention wiring (amendment d)', () => {
  it('mode=exam uses desiredRetention=0.95; mode=daily uses 0.90; resulting intervals differ', async () => {
    // Two items with identical Review state — one rated via mode=exam, one via mode=daily.
    const itemExam = makeItem('retention-exam', 'pack-r', 1, 1);
    const itemDaily = makeItem('retention-daily', 'pack-r', 1, 1);
    await contentItemRepo.upsert(itemExam);
    await contentItemRepo.upsert(itemDaily);

    const lastReview = new Date(SIM_NOW.getTime() - 10 * MS_PER_DAY);
    const sharedFsrs: FsrsCardState = {
      stability: 10,
      difficulty: 5,
      due: new Date(SIM_NOW.getTime() - 1).toISOString(), // just past due
      state: 'Review',
      elapsedDays: 10,
      scheduledDays: 10,
      learningSteps: 0,
      reps: 3,
      lapses: 0,
      lastReview: lastReview.toISOString(),
    };

    const memExam: ItemMemoryState = {
      itemId: itemExam.id, fsrs: sharedFsrs,
      relearnStreak: 2, graduated: false,
      lastQualifyingDate: lastReview.toISOString(),
      updatedAt: lastReview.toISOString(),
    };
    const memDaily: ItemMemoryState = { ...memExam, itemId: itemDaily.id };

    await memStateRepo.insert(db, memExam);
    await memStateRepo.insert(db, memDaily);

    const examEntry: QueueEntry = {
      kind: 'review', item: itemExam, memoryState: memExam, mode: 'exam',
    };
    const dailyEntry: QueueEntry = {
      kind: 'review', item: itemDaily, memoryState: memDaily, mode: 'daily',
    };

    const resultExam = await processRating({
      entry: examEntry, rating: 3, reviewedAt: SIM_NOW, latencyMs: 1000,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    const resultDaily = await processRating({
      entry: dailyEntry, rating: 3, reviewedAt: SIM_NOW, latencyMs: 1000,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    expect(
      resultExam.fsrs.scheduledDays,
      `exam mode (0.95) must schedule shorter intervals than daily (0.90); ` +
      `exam=${resultExam.fsrs.scheduledDays} daily=${resultDaily.fsrs.scheduledDays}`,
    ).toBeLessThan(resultDaily.fsrs.scheduledDays);
  });

  it('kind=new with mode=daily writes atomic first-review transaction to DB', async () => {
    const cohort = makeCohort(7);
    const item = makeItem('new-tx-item', 'pack-tx', 1, 1);
    await contentItemRepo.upsert(item);

    // Build queue to get a synthetic new entry
    const queue = await computeSessionQueue({
      now: SIM_NOW, cohort, contentItemRepo, memStateRepo, queueBuilder, examCompressor,
      newItemCap: 1,
    });

    expect(queue.length, 'must have one new entry').toBe(1);
    expect(queue[0].kind, 'entry must be kind=new').toBe('new');

    await processRating({
      entry: queue[0], rating: 3, reviewedAt: SIM_NOW, latencyMs: 800,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
    });

    // Both event and MemoryState must now exist in DB
    const events = await reviewEventRepo.findByItemId('new-tx-item');
    const state = await memStateRepo.findByItemId('new-tx-item');

    expect(events, 'ReviewEvent must be written').toHaveLength(1);
    expect(events[0].mode, 'new item review mode must be daily').toBe('daily');
    expect(state, 'ItemMemoryState must be created').not.toBeNull();
    expect(state?.fsrs.state, 'state must no longer be New').not.toBe('New');
  });
});
