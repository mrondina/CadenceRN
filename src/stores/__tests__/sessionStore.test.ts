/**
 * sessionStore tests — verifies in-flight card index management, idempotent flush,
 * and the suspend/resume invariant: after flush + restore, at most the currently
 * displayed card is lost (all previously rated cards remain in DB).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../../db/test-utils/BetterSQLiteDatabase';
import { runSchemaOnly } from '../../db/migrations/runner';
import { ContentItemRepository } from '../../db/repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '../../db/repositories/ItemMemoryStateRepository';
import { ReviewEventRepository } from '../../db/repositories/ReviewEventRepository';
import type { IDatabase } from '../../db/types';
import type { ContentItem, ItemMemoryState, QueueEntry } from '../../domain/types';
import { DEFAULT_DAY_BOUNDARY } from '../../domain/types';
import { SchedulerService } from '../../domain/scheduler/SchedulerService';
import { RelearningPipeline } from '../../domain/scheduler/RelearningPipeline';
import { processRating } from '../../hooks/useReviewSession';
import { useSessionStore } from '../sessionStore';

const SIM_NOW = new Date('2026-07-04T10:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(id: string): ContentItem {
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
    releaseGate: { sessionIndex: 1, week: 1 },
    contentPackId: 'pack-1',
    contentVersion: 1,
    placeholder: false,
  };
}

function makeMemState(itemId: string): ItemMemoryState {
  const lastReview = new Date(SIM_NOW.getTime() - 5 * MS_PER_DAY);
  return {
    itemId,
    fsrs: {
      stability: 5,
      difficulty: 5,
      due: new Date(SIM_NOW.getTime() - 1).toISOString(), // just past due
      state: 'Review',
      elapsedDays: 5,
      scheduledDays: 5,
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

function makeReviewEntry(item: ContentItem, memState: ItemMemoryState): QueueEntry {
  return { kind: 'review', item, memoryState: memState, mode: 'daily' };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

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

  // Reset singleton store state before each test
  useSessionStore.getState().reset();
});

// ─── Basic state management ───────────────────────────────────────────────────

describe('sessionStore — basic state management', () => {
  it('initial state: empty queue, currentIndex=0', () => {
    const { queue, currentIndex } = useSessionStore.getState();
    expect(queue).toHaveLength(0);
    expect(currentIndex).toBe(0);
  });

  it('setQueue: sets queue and resets currentIndex to 0', () => {
    const item = makeItem('sq-1');
    const entry = makeReviewEntry(item, makeMemState('sq-1'));
    useSessionStore.getState().advance(); // move to 1
    useSessionStore.getState().setQueue([entry]);
    expect(useSessionStore.getState().currentIndex).toBe(0);
    expect(useSessionStore.getState().queue).toHaveLength(1);
  });

  it('advance: increments currentIndex', () => {
    const items = ['adv-1', 'adv-2', 'adv-3'].map(id => makeItem(id));
    const queue = items.map(i => makeReviewEntry(i, makeMemState(i.id)));
    useSessionStore.getState().setQueue(queue);

    expect(useSessionStore.getState().currentIndex).toBe(0);
    useSessionStore.getState().advance();
    expect(useSessionStore.getState().currentIndex).toBe(1);
    useSessionStore.getState().advance();
    expect(useSessionStore.getState().currentIndex).toBe(2);
  });

  it('advance does not exceed queue.length', () => {
    const item = makeItem('adv-bounded');
    useSessionStore.getState().setQueue([makeReviewEntry(item, makeMemState('adv-bounded'))]);
    useSessionStore.getState().advance(); // index=1 (past end)
    useSessionStore.getState().advance(); // should stay clamped
    expect(useSessionStore.getState().currentIndex).toBe(1);
  });

  it('reset: clears queue and resets index to 0', () => {
    const item = makeItem('rst-1');
    useSessionStore.getState().setQueue([makeReviewEntry(item, makeMemState('rst-1'))]);
    useSessionStore.getState().advance();
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().queue).toHaveLength(0);
    expect(useSessionStore.getState().currentIndex).toBe(0);
  });
});

// ─── flush / restore ──────────────────────────────────────────────────────────

describe('sessionStore — flush and restore', () => {
  it('flush persists currentIndex to DB; restore reads it back', async () => {
    const items = ['fl-1', 'fl-2', 'fl-3'].map(id => makeItem(id));
    useSessionStore.getState().setQueue(
      items.map(i => makeReviewEntry(i, makeMemState(i.id))),
    );
    useSessionStore.getState().advance(); // currentIndex=1

    await useSessionStore.getState().flush(db);

    // Reset in-memory state (simulate fresh launch)
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().currentIndex).toBe(0);

    await useSessionStore.getState().restore(db);
    expect(useSessionStore.getState().currentIndex, 'restore must recover persisted index').toBe(1);
  });

  it('flush is idempotent: calling multiple times does not corrupt state', async () => {
    const items = ['idem-1', 'idem-2'].map(id => makeItem(id));
    useSessionStore.getState().setQueue(
      items.map(i => makeReviewEntry(i, makeMemState(i.id))),
    );
    useSessionStore.getState().advance(); // currentIndex=1

    // Call flush 3 times — must not error or multiply-insert
    await useSessionStore.getState().flush(db);
    await useSessionStore.getState().flush(db);
    await useSessionStore.getState().flush(db);

    // Restore and verify correct state
    useSessionStore.getState().reset();
    await useSessionStore.getState().restore(db);
    expect(useSessionStore.getState().currentIndex).toBe(1);
  });

  it('restore is a no-op when no persisted state exists', async () => {
    await useSessionStore.getState().restore(db);
    expect(useSessionStore.getState().currentIndex).toBe(0);
  });
});

// ─── Suspend / resume invariant ───────────────────────────────────────────────

describe('sessionStore — suspend/resume: loses at most the displayed card', () => {
  it('rated cards are in DB; only the displayed card might be re-shown after restore', async () => {
    // Set up 3 review items in DB
    const ids = ['sr-a', 'sr-b', 'sr-c'];
    const items = ids.map(id => makeItem(id));
    const memStates = ids.map(id => makeMemState(id));

    for (let i = 0; i < ids.length; i++) {
      await contentItemRepo.upsert(items[i]);
      await memStateRepo.insert(db, memStates[i]);
    }

    const queue: QueueEntry[] = items.map((item, i) =>
      makeReviewEntry(item, memStates[i]),
    );
    useSessionStore.getState().setQueue(queue);

    // Rate card 0 → writes to DB
    await processRating({
      entry: queue[0], rating: 3, reviewedAt: SIM_NOW, latencyMs: 500,
      scheduler, relearningPipeline, memStateRepo, reviewEventRepo,
      boundaryConfig: DEFAULT_DAY_BOUNDARY,
    });
    useSessionStore.getState().advance(); // currentIndex=1

    // Card 1 is now displayed but NOT yet rated
    expect(useSessionStore.getState().currentIndex).toBe(1);

    // Simulate background: flush currentIndex=1 to DB
    await useSessionStore.getState().flush(db);

    // Simulate app kill + resume: fresh store, read persisted index
    useSessionStore.getState().reset();
    await useSessionStore.getState().restore(db);

    // currentIndex is restored to 1 — card B is the displayed card
    expect(
      useSessionStore.getState().currentIndex,
      'after restore, currentIndex must point to the displayed card',
    ).toBe(1);

    // Card A was rated and has a MemoryState in DB
    const eventsSrA = await reviewEventRepo.findByItemId('sr-a');
    expect(eventsSrA, 'card A must have a ReviewEvent in DB').toHaveLength(1);

    // Cards B and C were NOT rated — no review events
    const eventsSrB = await reviewEventRepo.findByItemId('sr-b');
    const eventsSrC = await reviewEventRepo.findByItemId('sr-c');
    expect(eventsSrB, 'card B must have no ReviewEvent (was the displayed card)').toHaveLength(0);
    expect(eventsSrC, 'card C must have no ReviewEvent (not yet reached)').toHaveLength(0);
  });
});
