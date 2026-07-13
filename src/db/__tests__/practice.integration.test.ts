/**
 * Practice mode integration test — no-write guarantee.
 *
 * Uses a real in-memory SQLite database (BetterSQLiteDatabase) so the
 * assertion is structural: we count actual rows in item_memory_states and
 * review_events before and after a full practice draw and assert they are
 * byte-identical.
 *
 * Covers both items that already have a memory state (would-be kind:'review')
 * and items that do not (would-be kind:'new'). Neither path writes in practice.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb } from '../test-utils/BetterSQLiteDatabase';
import { runSchemaOnly } from '../migrations/runner';
import { ContentItemRepository } from '../repositories/ContentItemRepository';
import { ItemMemoryStateRepository } from '../repositories/ItemMemoryStateRepository';
import { ReviewEventRepository } from '../repositories/ReviewEventRepository';
import type { IDatabase } from '../types';
import type { ContentItem, ItemMemoryState } from '../../domain/types';
import { computePracticeItems } from '../../hooks/usePracticeSession';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(id: string, week = 1, format: ContentItem['format'] = 'cloze'): ContentItem {
  const body: ContentItem['body'] =
    format === 'free_recall'
      ? { type: 'free_recall', prompt: 'Q', rubric: ['A'], modelAnswer: 'A' }
      : { type: 'cloze', front: 'Q {{blank}}', back: 'A' };
  return {
    id,
    pillar: 'terminology',
    format,
    difficultyTier: 1,
    body,
    sourceCitation: 'test',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex: 1, week },
    contentPackId: 'practice-pack',
    contentVersion: 1,
    placeholder: false,
    caseId: null,
    caseOrder: null,
  };
}

function makeMemState(itemId: string): ItemMemoryState {
  return {
    itemId,
    fsrs: {
      stability: 5,
      difficulty: 5,
      due: '2030-01-01T00:00:00.000Z',  // far future — not due in scheduled queue
      state: 'Review',
      elapsedDays: 5,
      scheduledDays: 5,
      learningSteps: 0,
      reps: 3,
      lapses: 0,
      lastReview: '2026-07-01T10:00:00.000Z',
    },
    relearnStreak: 3,
    graduated: true,
    lastQualifyingDate: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  };
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

async function snapMemStates(db: IDatabase) {
  return db.getAllAsync<Record<string, unknown>>('SELECT * FROM item_memory_states ORDER BY item_id');
}

async function snapReviewEvents(db: IDatabase) {
  return db.getAllAsync<Record<string, unknown>>('SELECT * FROM review_events ORDER BY id');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

let db: IDatabase;
let contentItemRepo: ContentItemRepository;
let memStateRepo: ItemMemoryStateRepository;

beforeEach(async () => {
  db = openTestDb();
  await runSchemaOnly(db);
  contentItemRepo = new ContentItemRepository(db);
  memStateRepo = new ItemMemoryStateRepository(db);
});

describe('practice mode — no-write guarantee (integration)', () => {

  it('item_memory_states and review_events unchanged after full practice draw (all-new items)', async () => {
    // Seed 12 items in the pack with NO memory states (all would-be kind:'new').
    for (let i = 0; i < 12; i++) {
      await contentItemRepo.upsert(makeItem(`new-item-${i}`, 1, 'cloze'));
    }

    const beforeMem    = await snapMemStates(db);
    const beforeEvents = await snapReviewEvents(db);

    // computePracticeItems is the entire practice data path — no hook needed.
    const selected = await computePracticeItems(
      contentItemRepo,
      { packId: 'practice-pack' },
      12345, // fixed seed for reproducibility
    );

    // Simulate advancing through all cards (no rating action exists).
    expect(selected.length).toBeGreaterThan(0);

    const afterMem    = await snapMemStates(db);
    const afterEvents = await snapReviewEvents(db);

    expect(afterMem).toEqual(beforeMem);
    expect(afterEvents).toEqual(beforeEvents);
  });

  it('item_memory_states and review_events unchanged after draw that includes introduced items', async () => {
    // 8 items with memory states (would-be kind:'review'), 4 without (kind:'new').
    for (let i = 0; i < 12; i++) {
      await contentItemRepo.upsert(makeItem(`mix-item-${i}`, 1, 'cloze'));
    }
    for (let i = 0; i < 8; i++) {
      await memStateRepo.insert(db, makeMemState(`mix-item-${i}`));
    }

    const beforeMem    = await snapMemStates(db);
    const beforeEvents = await snapReviewEvents(db);

    await computePracticeItems(contentItemRepo, { packId: 'practice-pack' }, 99);

    const afterMem    = await snapMemStates(db);
    const afterEvents = await snapReviewEvents(db);

    expect(afterMem).toEqual(beforeMem);
    expect(afterEvents).toEqual(beforeEvents);
  });

  it('free_recall items in scope are capped at PRACTICE_FREE_RECALL_CAP in DB round-trip', async () => {
    // Seed 8 free_recall + 8 cloze in the pack.
    for (let i = 0; i < 8; i++) {
      await contentItemRepo.upsert(makeItem(`fr-${i}`, 1, 'free_recall'));
    }
    for (let i = 0; i < 8; i++) {
      await contentItemRepo.upsert(makeItem(`cz-${i}`, 1, 'cloze'));
    }

    const selected = await computePracticeItems(
      contentItemRepo,
      { packId: 'practice-pack' },
      77,
    );

    const frCount = selected.filter(i => i.format === 'free_recall').length;
    expect(frCount).toBeLessThanOrEqual(3);
    expect(selected.length).toBeLessThanOrEqual(12);
  });

  it('week filter returns only items for that exact week, not adjacent weeks', async () => {
    // Week 1 and week 2 items in the same pack.
    for (let i = 0; i < 5; i++) {
      await contentItemRepo.upsert(makeItem(`w1-${i}`, 1, 'cloze'));
    }
    for (let i = 0; i < 5; i++) {
      await contentItemRepo.upsert(makeItem(`w2-${i}`, 2, 'cloze'));
    }

    const week1 = await computePracticeItems(contentItemRepo, { packId: 'practice-pack', week: 1 }, 1);
    const week2 = await computePracticeItems(contentItemRepo, { packId: 'practice-pack', week: 2 }, 1);

    expect(week1.every(i => i.id.startsWith('w1-'))).toBe(true);
    expect(week2.every(i => i.id.startsWith('w2-'))).toBe(true);
  });

  it('omitting week returns items from all weeks in the pack', async () => {
    for (let i = 0; i < 3; i++) {
      await contentItemRepo.upsert(makeItem(`w1-${i}`, 1, 'cloze'));
      await contentItemRepo.upsert(makeItem(`w2-${i}`, 2, 'cloze'));
    }

    const all = await computePracticeItems(contentItemRepo, { packId: 'practice-pack' }, 1);
    expect(all.length).toBe(6); // 3+3 = 6, all below session cap
  });
});
