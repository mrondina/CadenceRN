/**
 * Practice mode unit tests.
 *
 * Load-bearing assertions:
 *   (1) computePracticeItems calls no write methods — structurally guaranteed
 *       (no write-capable dependency) but explicitly verified via mock.
 *   (2) Free-recall selection cap: at most PRACTICE_FREE_RECALL_CAP free_recall
 *       items in the drawn set, regardless of how many are in scope.
 *   (3) Session size cap: at most PRACTICE_SESSION_SIZE items returned.
 *   (4) N < 12 scope: all N items returned, no padding.
 *   (5) Sequence items always excluded.
 *
 * These tests operate on the pure computePracticeItems function — no hook
 * lifecycle, no React rendering required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computePracticeItems, PRACTICE_FREE_RECALL_CAP, PRACTICE_SESSION_SIZE } from '../usePracticeSession';
import type { ContentItem } from '../../domain/types';
import type { ContentItemRepository } from '../../db/repositories/ContentItemRepository';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeItem(
  id: string,
  format: ContentItem['format'] = 'cloze',
): ContentItem {
  const body: ContentItem['body'] =
    format === 'mcq'
      ? { type: 'mcq', stem: 'Q', choices: [{ id: 'a', text: 'A' }], correctId: 'a', explanation: 'E' }
      : format === 'free_recall'
      ? { type: 'free_recall', prompt: 'Q', rubric: ['A'], modelAnswer: 'A' }
      : format === 'numeric'
      ? { type: 'numeric', problem: 'Q', answer: 1, unit: 'mg', tolerance: 0.1 }
      : format === 'sequence'
      ? { type: 'sequence', prompt: 'Q', steps: [{ id: 's1', text: 'step' }], correctOrder: ['s1'] }
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
    releaseGate: { sessionIndex: 1, week: 1 },
    contentPackId: 'test-pack',
    contentVersion: 1,
    placeholder: false,
  };
}

// Build a mock repository. write methods are tracked stubs; findByPackAndWeek
// returns whatever items the test supplies.
function makeRepo(items: ContentItem[]): ContentItemRepository {
  return {
    findByPackAndWeek: vi.fn().mockResolvedValue(items),
    // Write methods — must never be called by practice.
    upsert:          vi.fn().mockResolvedValue(undefined),
    findById:        vi.fn().mockResolvedValue(null),
    findByPack:      vi.fn().mockResolvedValue([]),
    findUnlocked:    vi.fn().mockResolvedValue([]),
    countByPack:     vi.fn().mockResolvedValue(0),
  } as unknown as ContentItemRepository;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computePracticeItems', () => {

  it('returns at most PRACTICE_SESSION_SIZE items when scope is large', async () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem(`item-${i}`, 'cloze'));
    const repo = makeRepo(items);
    const result = await computePracticeItems(repo, { packId: 'test-pack' }, 42);
    expect(result.length).toBeLessThanOrEqual(PRACTICE_SESSION_SIZE);
  });

  it('returns all N items when scope has fewer than PRACTICE_SESSION_SIZE items', async () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`item-${i}`, 'cloze'));
    const repo = makeRepo(items);
    const result = await computePracticeItems(repo, { packId: 'test-pack' }, 42);
    expect(result).toHaveLength(5);
  });

  it('caps free_recall items at PRACTICE_FREE_RECALL_CAP regardless of scope composition', async () => {
    // Scope has 8 free_recall + 4 cloze
    const frItems = Array.from({ length: 8 }, (_, i) => makeItem(`fr-${i}`, 'free_recall'));
    const clozeItems = Array.from({ length: 4 }, (_, i) => makeItem(`cloze-${i}`, 'cloze'));
    const repo = makeRepo([...frItems, ...clozeItems]);
    const result = await computePracticeItems(repo, { packId: 'test-pack' }, 42);
    const frCount = result.filter(i => i.format === 'free_recall').length;
    expect(frCount).toBeLessThanOrEqual(PRACTICE_FREE_RECALL_CAP);
  });

  it('fills remaining slots from non-free_recall when cap is reached', async () => {
    const frItems  = Array.from({ length: 10 }, (_, i) => makeItem(`fr-${i}`, 'free_recall'));
    const cloze    = Array.from({ length: 10 }, (_, i) => makeItem(`c-${i}`, 'cloze'));
    const repo = makeRepo([...frItems, ...cloze]);
    const result = await computePracticeItems(repo, { packId: 'test-pack' }, 42);
    const frCount = result.filter(i => i.format === 'free_recall').length;
    const otherCount = result.filter(i => i.format !== 'free_recall').length;
    expect(frCount).toBe(PRACTICE_FREE_RECALL_CAP);
    expect(frCount + otherCount).toBe(Math.min(PRACTICE_SESSION_SIZE, PRACTICE_FREE_RECALL_CAP + 10));
  });

  it('excludes sequence-format items', async () => {
    const seqItems = Array.from({ length: 5 }, (_, i) => makeItem(`seq-${i}`, 'sequence'));
    const cloze    = Array.from({ length: 3 }, (_, i) => makeItem(`c-${i}`, 'cloze'));
    const repo = makeRepo([...seqItems, ...cloze]);
    const result = await computePracticeItems(repo, { packId: 'test-pack' }, 42);
    expect(result.every(i => i.format !== 'sequence')).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('different seeds produce different orderings for the same scope', async () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem(`item-${i}`, 'cloze'));
    const repo = makeRepo(items);
    const r1 = (await computePracticeItems(repo, { packId: 'test-pack' }, 1)).map(i => i.id);
    const r2 = (await computePracticeItems(repo, { packId: 'test-pack' }, 2)).map(i => i.id);
    // Same items, different order (with high probability for distinct seeds over 12 items)
    expect([...r1].sort()).toEqual([...r2].sort());
    expect(r1).not.toEqual(r2);
  });

  it('same seed produces identical ordering (determinism)', async () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem(`item-${i}`, 'cloze'));
    const repo = makeRepo(items);
    const r1 = (await computePracticeItems(repo, { packId: 'test-pack' }, 999)).map(i => i.id);
    const r2 = (await computePracticeItems(repo, { packId: 'test-pack' }, 999)).map(i => i.id);
    expect(r1).toEqual(r2);
  });

  it('empty scope returns empty array', async () => {
    const repo = makeRepo([]);
    const result = await computePracticeItems(repo, { packId: 'test-pack' }, 42);
    expect(result).toHaveLength(0);
  });

  // ── No-write assertion ────────────────────────────────────────────────────
  // Practice has no write-capable dependency by construction, but we verify
  // explicitly that repository write methods are never called during a full
  // practice draw.

  it('never calls any write method on the repository', async () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem(`item-${i}`, 'cloze'));
    const repo = makeRepo(items);
    await computePracticeItems(repo, { packId: 'test-pack' }, 42);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('passes week and pillar params to findByPackAndWeek when provided', async () => {
    const repo = makeRepo([]);
    await computePracticeItems(repo, { packId: 'my-pack', week: 3, pillar: 'pharm' }, 42);
    expect(repo.findByPackAndWeek).toHaveBeenCalledWith('my-pack', 3, 'pharm');
  });

  it('passes undefined week when "all weeks" scope selected', async () => {
    const repo = makeRepo([]);
    await computePracticeItems(repo, { packId: 'my-pack' }, 42);
    expect(repo.findByPackAndWeek).toHaveBeenCalledWith('my-pack', undefined, undefined);
  });
});
