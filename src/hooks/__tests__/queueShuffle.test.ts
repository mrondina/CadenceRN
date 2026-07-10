/**
 * Queue-order variety tests.
 *
 * dueStates are shuffled by toDateStr(now) seed before reaching buildQueue.
 * Same study day → same order (stable within a day, safe to resume mid-session).
 * Different study days → different order (breaks cross-day sequence memorisation).
 *
 * The Week-8 determinism replay harness (harness.test.ts Stage 3 Week 8) is
 * unaffected: it calls buildQueue() directly, bypassing computeSessionQueue, so
 * the shuffle never enters that path.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../../db/test-utils/BetterSQLiteDatabase';
import { runSchemaOnly } from '../../db/migrations/runner';
import { ContentItemRepository } from '../../db/repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '../../db/repositories/ItemMemoryStateRepository';
import { CohortBuilder } from '../../domain/cohort/CohortBuilder';
import { QueueBuilder } from '../../domain/scheduler/QueueBuilder';
import { SchedulerService } from '../../domain/scheduler/SchedulerService';
import { ExamModeCompressor } from '../../domain/scheduler/ExamModeCompressor';
import type { IDatabase } from '../../db/types';
import type { Cohort, ContentItem, ItemMemoryState } from '../../domain/types';
import { computeSessionQueue } from '../useQueue';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Two distinct study days — same time-of-day, different calendar days
const DAY_A = new Date('2026-07-04T10:00:00.000Z');
const DAY_B = new Date('2026-07-05T10:00:00.000Z');

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
    contentPackId: 'test-pack',
    contentVersion: 1,
    placeholder: false,
  };
}

function makeOverdueState(itemId: string, referenceDate: Date): ItemMemoryState {
  return {
    itemId,
    fsrs: {
      stability: 1,
      difficulty: 5,
      due: new Date(referenceDate.getTime() - MS_PER_DAY).toISOString(),
      state: 'Review',
      elapsedDays: 1,
      scheduledDays: 1,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      lastReview: new Date(referenceDate.getTime() - 2 * MS_PER_DAY).toISOString(),
    },
    relearnStreak: 0,
    graduated: true,
    lastQualifyingDate: null,
    updatedAt: new Date().toISOString(),
  };
}

// Cohort started 21 days before DAY_A so all session-1 content is unlocked
function makeCohort(): Cohort {
  return new CohortBuilder().build({
    id: 'cohort-shuffle-test',
    startDate: new Date(DAY_A.getTime() - 21 * MS_PER_DAY),
    templateId: 'bellarmine-absn-v1',
  });
}

// ─── Shared domain instances ──────────────────────────────────────────────────

const scheduler = new SchedulerService();
const examCompressor = new ExamModeCompressor(scheduler);
const queueBuilder = new QueueBuilder(scheduler);
const cohort = makeCohort();

// 15 distinct items — enough for the shuffle to produce visibly different orders
const ITEM_IDS = Array.from(
  { length: 15 },
  (_, i) => `shuffle-test-${i.toString().padStart(3, '0')}`,
);

let db: IDatabase;
let contentItemRepo: ContentItemRepository;
let memStateRepo: ItemMemoryStateRepository;

beforeEach(async () => {
  db = openTestDb();
  await runSchemaOnly(db);
  contentItemRepo = new ContentItemRepository(db);
  memStateRepo = new ItemMemoryStateRepository(db);

  for (const id of ITEM_IDS) {
    await contentItemRepo.upsert(makeItem(id));
    await memStateRepo.insert(db, makeOverdueState(id, DAY_A));
  }
});

async function buildQueue(now: Date) {
  return computeSessionQueue({
    now,
    cohort,
    contentItemRepo,
    memStateRepo,
    queueBuilder,
    examCompressor,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('queue-order variety (dueStates shuffled by study-day seed)', () => {
  it('same study day → same queue order on repeated calls', async () => {
    const run1 = (await buildQueue(DAY_A)).map(e => e.item.id);
    const run2 = (await buildQueue(DAY_A)).map(e => e.item.id);

    expect(run1).toHaveLength(ITEM_IDS.length);
    expect(run1).toEqual(run2);
  });

  it('different study days → different queue order', async () => {
    const orderA = (await buildQueue(DAY_A)).map(e => e.item.id);
    const orderB = (await buildQueue(DAY_B)).map(e => e.item.id);

    expect(orderA).toHaveLength(ITEM_IDS.length);
    expect(orderB).toHaveLength(ITEM_IDS.length);
    // Same items present in both queues
    expect([...orderA].sort()).toEqual([...orderB].sort());
    // Different order
    expect(orderA).not.toEqual(orderB);
  });

  it('all due items appear exactly once regardless of day', async () => {
    for (const now of [DAY_A, DAY_B]) {
      const ids = (await buildQueue(now)).map(e => e.item.id);
      expect(new Set(ids).size).toBe(ids.length); // no duplicates
      expect(ids.length).toBe(ITEM_IDS.length);
    }
  });
});
