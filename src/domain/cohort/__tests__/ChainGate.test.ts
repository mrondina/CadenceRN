import { describe, it, expect } from 'vitest';
import { ChainGate } from '../ChainGate';
import { CHAIN_PROMOTION_STABILITY_DAYS } from '../../types';
import type { ContentItem, ItemMemoryState, RampChainLink } from '../../types';

// ─── Factories ────────────────────────────────────────────────────────────────

function rampLink(targetId: string): RampChainLink {
  return { linkType: 'rampChain', targetId };
}

let _id = 0;
function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  const id = overrides.id ?? `item-${++_id}`;
  return {
    id,
    pillar: 'terminology',
    format: 'cloze',
    difficultyTier: 1,
    body: { type: 'cloze', front: 'Q', back: 'A' },
    sourceCitation: 'test',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex: 1, week: 1 },
    contentPackId: 'test-pack',
    contentVersion: 1,
    placeholder: false,
    caseId: null,
    caseOrder: null,
    ...overrides,
  } as ContentItem;
}

function makeState(
  itemId: string,
  opts: { graduated?: boolean; stability?: number; due?: string } = {},
): ItemMemoryState {
  return {
    itemId,
    fsrs: {
      stability:     opts.stability ?? 1,
      difficulty:    5,
      due:           opts.due ?? '2099-01-01T00:00:00.000Z',
      state:         'Review',
      elapsedDays:   10,
      scheduledDays: 10,
      learningSteps: 0,
      reps:          5,
      lapses:        0,
    },
    relearnStreak:       0,
    graduated:           opts.graduated ?? false,
    lastQualifyingDate:  null,
    updatedAt:           '2026-07-01T00:00:00.000Z',
  };
}

function stateMap(...states: ItemMemoryState[]): Map<string, ItemMemoryState> {
  return new Map(states.map(s => [s.itemId, s]));
}

// ─── Fixtures: 2-tier chain ───────────────────────────────────────────────────
//
// tier1 ---rampChain---> tier2
//
// successorOf[tier1.id] = tier2.id
// predecessorOf[tier2.id] = tier1.id

const tier1 = makeItem({ id: 'tier1', rampTier: 1, graphLinks: [rampLink('tier2')] });
const tier2 = makeItem({ id: 'tier2', rampTier: 2 });

// ─── Fixtures: 3-tier chain ───────────────────────────────────────────────────
//
// t1 ---rampChain---> t2 ---rampChain---> t3

const t1 = makeItem({ id: 't1', rampTier: 1, graphLinks: [rampLink('t2')] });
const t2 = makeItem({ id: 't2', rampTier: 2, graphLinks: [rampLink('t3')] });
const t3 = makeItem({ id: 't3', rampTier: 3 });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChainGate', () => {
  // ── Standalone fast path ──────────────────────────────────────────────────

  it('standalone item (no rampTier) is always active — fast path, no map lookup', () => {
    const standalone = makeItem({ id: 'sa' });
    const gate = new ChainGate([standalone]);
    // Even with a states map that has 'sa' state, a standalone item returns 'active'
    expect(gate.check(standalone, stateMap(makeState('sa')))).toBe('active');
  });

  it('standalone item returns active regardless of empty states map', () => {
    const standalone = makeItem({ id: 'sb' });
    const gate = new ChainGate([standalone]);
    expect(gate.check(standalone, new Map())).toBe('active');
  });

  // ── All-standalone no-op ──────────────────────────────────────────────────

  it('all-standalone set: constructing ChainGate adds no links; every item is active', () => {
    // Simulates the current content set where no items have rampTier.
    // 150 items with no rampChain graphLinks → zero index entries.
    const items = Array.from({ length: 150 }, (_, i) =>
      makeItem({ id: `standalone-${i}` }),
    );
    const gate = new ChainGate(items);
    const populated = stateMap(...items.map(i => makeState(i.id)));
    // All items must be 'active' — no rampTier means fast-path return.
    const statuses = items.map(i => gate.check(i, populated));
    expect(statuses.every(s => s === 'active')).toBe(true);
  });

  // ── 2-tier chain transitions ──────────────────────────────────────────────

  describe('2-tier chain (tier1 → tier2)', () => {
    const gate = new ChainGate([tier1, tier2]);

    it('tier1: active when successor (tier2) has no state', () => {
      expect(gate.check(tier1, new Map())).toBe('active');
    });

    it('tier1: retired as soon as successor (tier2) has ANY state (even not due)', () => {
      const states = stateMap(makeState('tier2', { due: '2099-01-01T00:00:00.000Z' }));
      expect(gate.check(tier1, states)).toBe('retired');
    });

    it('tier2: locked when predecessor (tier1) has no state', () => {
      expect(gate.check(tier2, new Map())).toBe('locked');
    });

    it('tier2: locked when predecessor graduated=false', () => {
      const states = stateMap(makeState('tier1', { graduated: false, stability: 10 }));
      expect(gate.check(tier2, states)).toBe('locked');
    });

    it(`tier2: locked when predecessor graduated=true but stability < ${CHAIN_PROMOTION_STABILITY_DAYS}`, () => {
      const states = stateMap(makeState('tier1', {
        graduated: true,
        stability: CHAIN_PROMOTION_STABILITY_DAYS - 1,
      }));
      expect(gate.check(tier2, states)).toBe('locked');
    });

    it(`tier2: active when predecessor graduated=true and stability = ${CHAIN_PROMOTION_STABILITY_DAYS} (boundary)`, () => {
      const states = stateMap(makeState('tier1', {
        graduated: true,
        stability: CHAIN_PROMOTION_STABILITY_DAYS,
      }));
      expect(gate.check(tier2, states)).toBe('active');
    });

    it('tier2: active when predecessor graduated=true and stability exceeds threshold', () => {
      const states = stateMap(makeState('tier1', { graduated: true, stability: 30 }));
      expect(gate.check(tier2, states)).toBe('active');
    });

    // Amendment requirement: complete-states-map contract.
    // tier-1 is not due (far future due date) but IS in allKnownStates → tier-2 must be active.
    it('amendment: tier-1 stable and not currently due → tier-2 is still active', () => {
      const tier1NotDue = makeState('tier1', {
        graduated: true,
        stability: CHAIN_PROMOTION_STABILITY_DAYS,
        due: '2099-12-31T00:00:00.000Z', // far future — not due today
      });
      const states = stateMap(tier1NotDue);
      // ChainGate evaluates promotion gate from complete states map,
      // not from the due subset — so tier-2 is unlocked.
      expect(gate.check(tier2, states)).toBe('active');
    });

    // Amendment requirement: retirement is state-presence only, not due-ness.
    // tier-2 has a state but is not due today → tier-1 must still retire.
    it('amendment: tier-2 introduced but not currently due → tier-1 is retired', () => {
      const tier2NotDue = makeState('tier2', {
        due: '2099-12-31T00:00:00.000Z', // not due today
      });
      const states = stateMap(tier2NotDue);
      // Retirement fires the moment the successor appears in allStates,
      // regardless of whether it's scheduled for review today.
      expect(gate.check(tier1, states)).toBe('retired');
    });
  });

  // ── 3-tier chain ──────────────────────────────────────────────────────────

  describe('3-tier chain (t1 → t2 → t3)', () => {
    const gate = new ChainGate([t1, t2, t3]);

    const promotionReady = (id: string) =>
      makeState(id, { graduated: true, stability: CHAIN_PROMOTION_STABILITY_DAYS });

    it('no states: t1 active, t2 locked (no t1 state), t3 locked (no t2 state)', () => {
      const s = new Map<string, ItemMemoryState>();
      expect(gate.check(t1, s)).toBe('active');
      expect(gate.check(t2, s)).toBe('locked');
      expect(gate.check(t3, s)).toBe('locked');
    });

    it('only t1 promotion-ready: t1 active (t2 not introduced), t2 active, t3 locked (no t2 state)', () => {
      const s = stateMap(promotionReady('t1'));
      expect(gate.check(t1, s)).toBe('active');
      expect(gate.check(t2, s)).toBe('active');
      expect(gate.check(t3, s)).toBe('locked');
    });

    it('t1 retired (t2 introduced), t2 promotion-ready: t1 retired, t2 active, t3 active', () => {
      const s = stateMap(promotionReady('t1'), promotionReady('t2'));
      expect(gate.check(t1, s)).toBe('retired');
      expect(gate.check(t2, s)).toBe('active');
      expect(gate.check(t3, s)).toBe('active');
    });

    it('all tiers introduced and t2 promotion-ready: t1 retired, t2 retired (t3 present), t3 active', () => {
      const s = stateMap(promotionReady('t1'), promotionReady('t2'), makeState('t3'));
      expect(gate.check(t1, s)).toBe('retired');
      expect(gate.check(t2, s)).toBe('retired');
      expect(gate.check(t3, s)).toBe('active');
    });
  });

  // ── State map immutability ────────────────────────────────────────────────

  it('check() does not mutate the allStates map', () => {
    const gate = new ChainGate([tier1, tier2]);
    const states = stateMap(makeState('tier1', { graduated: true, stability: 10 }));
    const sizeBefore = states.size;
    gate.check(tier2, states);
    expect(states.size).toBe(sizeBefore);
  });
});
