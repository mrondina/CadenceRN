import { describe, it, expect } from 'vitest';
import { fnv1a32, shuffleWithSeed } from '../seededRng';

// ─── fnv1a32 ─────────────────────────────────────────────────────────────────

describe('fnv1a32', () => {
  it('returns an unsigned 32-bit integer (0 ≤ n < 2^32)', () => {
    const h = fnv1a32('cc2-001');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  it('is deterministic — same input always produces the same hash', () => {
    expect(fnv1a32('pharm-005')).toBe(fnv1a32('pharm-005'));
  });

  it('produces different hashes for different inputs', () => {
    expect(fnv1a32('cc2-001')).not.toBe(fnv1a32('cc2-002'));
    expect(fnv1a32('pharm-001')).not.toBe(fnv1a32('fnd-001'));
  });

  it('handles the empty string without throwing', () => {
    expect(() => fnv1a32('')).not.toThrow();
  });
});

// ─── shuffleWithSeed ──────────────────────────────────────────────────────────

const CHOICES = [
  { id: 'a', text: 'Choice A' },
  { id: 'b', text: 'Choice B' },
  { id: 'c', text: 'Choice C' },
  { id: 'd', text: 'Choice D' },
];

describe('shuffleWithSeed', () => {
  it('(a) same seed always produces the same order', () => {
    const seed = fnv1a32('cc2-007');
    const run1 = shuffleWithSeed(CHOICES, seed).map(c => c.id);
    const run2 = shuffleWithSeed(CHOICES, seed).map(c => c.id);
    expect(run1).toEqual(run2);
  });

  it('(b) different itemIds produce different orders', () => {
    const order1 = shuffleWithSeed(CHOICES, fnv1a32('cc2-001')).map(c => c.id);
    const order2 = shuffleWithSeed(CHOICES, fnv1a32('pharm-003')).map(c => c.id);
    // Not guaranteed to differ for every pair, but these specific IDs do differ
    expect(order1).not.toEqual(order2);
  });

  it('(c) correctId is always present in the output — no choices are dropped', () => {
    const correctId = 'b';
    for (const seedStr of ['cc2-001', 'cc2-005', 'pharm-001', 'fnd-007']) {
      const shuffled = shuffleWithSeed(CHOICES, fnv1a32(seedStr));
      expect(shuffled.map(c => c.id)).toContain(correctId);
      expect(shuffled).toHaveLength(CHOICES.length);
    }
  });

  it('(c) every original choice appears exactly once — no duplicates', () => {
    const shuffled = shuffleWithSeed(CHOICES, fnv1a32('cc2-010'));
    const ids = shuffled.map(c => c.id).sort();
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns a new array without mutating the input', () => {
    const original = [...CHOICES];
    shuffleWithSeed(CHOICES, fnv1a32('cc2-001'));
    expect(CHOICES).toEqual(original);
  });

  it('handles a single-element array', () => {
    expect(shuffleWithSeed([CHOICES[0]], 42)).toEqual([CHOICES[0]]);
  });

  it('handles an empty array', () => {
    expect(shuffleWithSeed([], 42)).toEqual([]);
  });

  it('produces a non-trivial shuffle — not all seeds leave the array in original order', () => {
    const original = CHOICES.map(c => c.id).join('');
    const shuffled = shuffleWithSeed(CHOICES, fnv1a32('cc2-001')).map(c => c.id).join('');
    // This seed happens to produce a permutation; if it didn't we'd catch it in the distribution test
    expect(shuffled).not.toBe(original);
  });
});

// ─── Distribution sanity ──────────────────────────────────────────────────────

describe('shuffleWithSeed distribution', () => {
  it('distributes 4-choice arrays reasonably — no position above 50% across 20 IDs', () => {
    const testIds = Array.from({ length: 20 }, (_, i) => `item-${i.toString().padStart(3, '0')}`);
    const positionCounts = [0, 0, 0, 0];

    for (const id of testIds) {
      const shuffled = shuffleWithSeed(CHOICES, fnv1a32(id));
      // Check where choice 'b' (the "correct" answer in our test) lands
      const pos = shuffled.findIndex(c => c.id === 'b');
      positionCounts[pos]++;
    }

    const max = Math.max(...positionCounts);
    expect(max / testIds.length).toBeLessThanOrEqual(0.5);
  });
});
