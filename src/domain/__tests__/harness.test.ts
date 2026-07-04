import { describe, it, expect } from 'vitest';
import { CohortBuilder } from '../cohort/CohortBuilder';
import { ReleaseGate } from '../cohort/ReleaseGate';
import { QueueBuilder } from '../scheduler/QueueBuilder';
import { SchedulerService } from '../scheduler/SchedulerService';
import { RelearningPipeline } from '../scheduler/RelearningPipeline';
import type {
  ContentItem,
  ItemMemoryState,
  ReviewEvent,
  Cohort,
  QueueEntry,
  Rating,
  Pillar,
  ItemFormat,
  DateBoundaryConfig,
} from '../types';
import { DEFAULT_DAY_BOUNDARY } from '../types';

// ─── Injected-clock helper ────────────────────────────────────────────────────

class SimClock {
  private current: Date;
  constructor(start: Date) { this.current = new Date(start); }
  get(): Date { return new Date(this.current); }
  tickDays(n: number): void {
    this.current = new Date(this.current.getTime() + n * 24 * 60 * 60 * 1000);
  }
}

// ─── In-memory state maps ─────────────────────────────────────────────────────

class MemStateRepo {
  private store = new Map<string, ItemMemoryState>();
  has(itemId: string): boolean { return this.store.has(itemId); }
  get(itemId: string): ItemMemoryState | undefined { return this.store.get(itemId); }
  set(state: ItemMemoryState): void { this.store.set(state.itemId, state); }
  all(): ItemMemoryState[] { return [...this.store.values()]; }
  count(): number { return this.store.size; }
  dueBy(now: Date): ItemMemoryState[] {
    return this.all().filter(s => new Date(s.fsrs.due) <= now);
  }
}

class ReviewLog {
  private events: ReviewEvent[] = [];
  append(event: ReviewEvent): void { this.events.push(event); }
  all(): ReviewEvent[] { return [...this.events]; }
}

// ─── Fixture generator ────────────────────────────────────────────────────────

const PILLARS: Pillar[] = ['pharm', 'terminology', 'concepts', 'procedures'];
const FORMATS: ItemFormat[] = ['cloze', 'mcq', 'free_recall', 'numeric'];

function makeItem(
  idx: number,
  contentPackId: string,
  sessionIndex: number,
  week: number,
): ContentItem {
  const pillar = PILLARS[idx % PILLARS.length];
  const format = FORMATS[idx % FORMATS.length];
  const id = `item-${contentPackId}-${idx.toString().padStart(3, '0')}`;

  const body = (() => {
    switch (format) {
      case 'cloze':
        return { type: 'cloze' as const, front: `Q${idx} {{blank}}`, back: `answer${idx}` };
      case 'mcq':
        return {
          type: 'mcq' as const,
          stem: `Stem ${idx}`,
          choices: [{ id: 'a', text: 'Option A' }, { id: 'b', text: 'Option B' }],
          correctId: 'a',
          explanation: 'Explanation',
        };
      case 'free_recall':
        return {
          type: 'free_recall' as const,
          prompt: `Prompt ${idx}`,
          rubric: ['criterion'],
          modelAnswer: `answer ${idx}`,
        };
      default:
        return {
          type: 'numeric' as const,
          problem: `Calc ${idx}`,
          answer: idx,
          unit: 'mg',
          tolerance: 0.1,
        };
    }
  })();

  return {
    id,
    pillar,
    format,
    difficultyTier: ((idx % 4) + 1) as 1 | 2 | 3 | 4,
    body,
    sourceCitation: 'test fixture',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex, week },
    contentPackId,
    contentVersion: 1,
    placeholder: false,
  };
}

/**
 * Generates 120 ContentItems: 60 per course, session 1, weeks 1–4 (15/week).
 * No sequence-format items — those are Phase 2.
 */
function buildFixtures(): {
  items: ContentItem[];
  courseAPackId: string;
  courseBPackId: string;
} {
  const courseAPackId = 'pack-a';
  const courseBPackId = 'pack-b';
  const items: ContentItem[] = [];
  let idx = 0;

  for (const packId of [courseAPackId, courseBPackId]) {
    for (let week = 1; week <= 4; week++) {
      for (let w = 0; w < 15; w++) {
        items.push(makeItem(idx++, packId, 1, week));
      }
    }
  }

  return { items, courseAPackId, courseBPackId };
}

// ─── Day-loop orchestrator ────────────────────────────────────────────────────

interface OrchestratorDeps {
  clock: SimClock;
  cohort: Cohort;
  allItems: ContentItem[];
  memRepo: MemStateRepo;
  reviewLog: ReviewLog;
  /** Per-item lastQualifyingDate — kept separate because ItemMemoryState omits it. */
  relearningDates: Map<string, string | null>;
  releaseGate: ReleaseGate;
  queueBuilder: QueueBuilder;
  scheduler: SchedulerService;
  relearningPipeline: RelearningPipeline;
  boundaryConfig: DateBoundaryConfig;
  newItemCap: number;
}

/**
 * Simulates one study session:
 *   ReleaseGate → QueueBuilder → rate each entry Good (3) →
 *   SchedulerService → RelearningPipeline → write MemStateRepo + ReviewLog.
 *
 * Returns the queue that was built (for assertions).
 */
function simulateDay(deps: OrchestratorDeps): QueueEntry[] {
  const {
    clock, cohort, allItems, memRepo, reviewLog, relearningDates,
    releaseGate, queueBuilder, scheduler, relearningPipeline,
    boundaryConfig, newItemCap,
  } = deps;
  const now = clock.get();

  const itemMap = new Map<string, ContentItem>(allItems.map(i => [i.id, i]));

  const unlockedItems = allItems.filter(
    item => releaseGate.check(item, cohort, now) === 'unlocked',
  );
  const newItems = unlockedItems.filter(item => !memRepo.has(item.id));
  const dueStates = memRepo.dueBy(now);

  const queue = queueBuilder.buildQueue({
    dueStates,
    examCandidates: [],
    allItems: itemMap,
    newItems,
    newItemCap,
    now,
  });

  const RATING: Rating = 3; // Good — simulating ideal performance

  for (const entry of queue) {
    const { item } = entry;
    const currentFsrs =
      entry.kind === 'review' ? entry.memoryState.fsrs : entry.syntheticState.fsrs;
    const currentStreak =
      entry.kind === 'review' ? entry.memoryState.relearnStreak : 0;
    const currentGraduated =
      entry.kind === 'review' ? entry.memoryState.graduated : false;

    const { nextState } = scheduler.schedule(currentFsrs, RATING, now);

    const relearn = relearningPipeline.processRating({
      currentStreak,
      graduated: currentGraduated,
      rating: RATING,
      reviewDate: now,
      lastQualifyingDate: relearningDates.get(item.id) ?? null,
      boundaryConfig,
    });

    relearningDates.set(item.id, relearn.lastQualifyingDate);

    memRepo.set({
      itemId: item.id,
      fsrs: nextState,
      relearnStreak: relearn.streak,
      graduated: relearn.graduated,
      updatedAt: now.toISOString(),
    });

    reviewLog.append({
      id: `evt-${item.id}-${now.getTime()}`,
      itemId: item.id,
      ts: now.toISOString(),
      rating: RATING,
      latencyMs: 1000,
      mode: entry.kind === 'new' ? 'daily' : entry.mode,
      stabilityBefore: currentFsrs.stability,
      difficultyBefore: currentFsrs.difficulty,
      dueBefore: currentFsrs.due,
    });
  }

  return queue;
}

// ─── Smoke test ───────────────────────────────────────────────────────────────

describe('Harness stage 1: orchestrator + fixture', () => {
  it('3-day simulation: queue is non-empty; MemoryStates created only on first rating', () => {
    // Cohort started 14 days ago → session 1, week 3 started today.
    // ReleaseGate: weeks 1–3 unlocked = 45 items/course = 90 items total available on day 1.
    const cohortStart = new Date(Date.UTC(2026, 5, 20)); // 2026-06-20
    const clock = new SimClock(new Date(Date.UTC(2026, 6, 4, 10, 0, 0))); // 2026-07-04 10:00 UTC

    const cohort = new CohortBuilder().build({
      id: 'cohort-harness-1',
      startDate: cohortStart,
      templateId: 'bellarmine-absn-v1',
    });

    const { items } = buildFixtures();

    const memRepo = new MemStateRepo();
    const reviewLog = new ReviewLog();
    const relearningDates = new Map<string, string | null>();

    const scheduler = new SchedulerService();
    const deps: OrchestratorDeps = {
      clock,
      cohort,
      allItems: items,
      memRepo,
      reviewLog,
      relearningDates,
      releaseGate: new ReleaseGate(),
      queueBuilder: new QueueBuilder(scheduler),
      scheduler,
      relearningPipeline: new RelearningPipeline(),
      boundaryConfig: DEFAULT_DAY_BOUNDARY,
      newItemCap: 20,
    };

    // ── Day 1 ──
    expect(memRepo.count()).toBe(0); // no MemoryStates before any rating

    const day1Queue = simulateDay(deps);

    expect(day1Queue.length).toBeGreaterThan(0);
    // All day-1 entries are new — memRepo was empty, so no item could be in dueStates.
    expect(day1Queue.every(e => e.kind === 'new')).toBe(true);
    // MemoryStates created exactly for the items that were rated — not before.
    expect(memRepo.count()).toBe(day1Queue.length);

    // ── Day 2 ──
    clock.tickDays(1);
    const day2Queue = simulateDay(deps);

    expect(day2Queue.length).toBeGreaterThan(0);
    // Day-1 items are in Learning state (due ~10min after rating), all past due now.
    // Queue will contain both re-due items (kind='review') and fresh new items.
    expect(day2Queue.some(e => e.kind === 'review')).toBe(true);

    // ── Day 3 ──
    clock.tickDays(1);
    const day3Queue = simulateDay(deps);

    expect(day3Queue.length).toBeGreaterThan(0);

    // Core invariant: every reviewed item has exactly one MemoryState row.
    // Since MemStateRepo is backed by a Map<itemId, ...>, structural uniqueness holds.
    // The explicit count check proves no item was silently skipped.
    const distinctRatedItemIds = new Set(reviewLog.all().map(e => e.itemId));
    expect(memRepo.count()).toBe(distinctRatedItemIds.size);

    // Every item that appears in the review log has a MemoryState.
    for (const evt of reviewLog.all()) {
      expect(memRepo.has(evt.itemId)).toBe(true);
    }

    // After at least one rating, no MemoryState should still be in 'New' FSRS state.
    for (const state of memRepo.all()) {
      expect(state.fsrs.state).not.toBe('New');
    }
  });
});
