import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulerService } from '../SchedulerService';
import type { FsrsCardState } from '../../types';

// Fixed review timestamp used across determinism tests — must never change.
const REVIEW_AT = new Date('2026-07-01T10:00:00.000Z');
const NOW       = new Date('2026-07-01T10:05:00.000Z');

describe('SchedulerService', () => {
  let svc: SchedulerService;

  beforeEach(() => {
    svc = new SchedulerService();
  });

  // ─── createInitialState ─────────────────────────────────────────────────────

  describe('createInitialState', () => {
    it('returns state=New', () => {
      const s = svc.createInitialState('item-1', NOW);
      expect(s.state).toBe('New');
    });

    it('returns stability=0', () => {
      const s = svc.createInitialState('item-1', NOW);
      expect(s.stability).toBe(0);
    });

    it('returns reps=0 lapses=0', () => {
      const s = svc.createInitialState('item-1', NOW);
      expect(s.reps).toBe(0);
      expect(s.lapses).toBe(0);
    });

    it('returns learningSteps=0', () => {
      const s = svc.createInitialState('item-1', NOW);
      expect(s.learningSteps).toBe(0);
    });

    it('sets due to the provided now timestamp', () => {
      const s = svc.createInitialState('item-1', NOW);
      expect(new Date(s.due).getTime()).toBe(NOW.getTime());
    });
  });

  // ─── schedule — state transitions ───────────────────────────────────────────

  describe('schedule (New card)', () => {
    let initial: FsrsCardState;

    beforeEach(() => {
      initial = svc.createInitialState('item-1', REVIEW_AT);
    });

    it('Again (1): card is not still in New state after rating', () => {
      const { nextState } = svc.schedule(initial, 1, REVIEW_AT);
      // Again on New → Learning (step 1, ~1 minute)
      expect(nextState.state).toBe('Learning');
    });

    it('Hard (2): card moves out of New state', () => {
      const { nextState } = svc.schedule(initial, 2, REVIEW_AT);
      expect(['Learning', 'Review']).toContain(nextState.state);
    });

    it('Good (3): card moves out of New state', () => {
      const { nextState } = svc.schedule(initial, 3, REVIEW_AT);
      expect(['Learning', 'Review']).toContain(nextState.state);
    });

    it('Easy (4): card graduates directly to Review', () => {
      const { nextState } = svc.schedule(initial, 4, REVIEW_AT);
      // Easy on a New card skips short-term steps → Review
      expect(nextState.state).toBe('Review');
    });

    it('Easy (4): scheduledDays > 0', () => {
      const { scheduledDays } = svc.schedule(initial, 4, REVIEW_AT);
      expect(scheduledDays).toBeGreaterThan(0);
    });

    it('reps increments after rating', () => {
      const { nextState } = svc.schedule(initial, 3, REVIEW_AT);
      expect(nextState.reps).toBe(1);
    });
  });

  describe('schedule (Review card)', () => {
    // Construct a card already in Review state with known stability
    const reviewCard: FsrsCardState = {
      due:           '2026-07-01T10:00:00.000Z',
      stability:     10,
      difficulty:    5,
      state:         'Review',
      elapsedDays:   10,
      scheduledDays: 10,
      learningSteps: 0,
      reps:          5,
      lapses:        0,
      lastReview:    '2026-06-21T10:00:00.000Z',
    };

    it('Again (1) on Review → Relearning', () => {
      const { nextState } = svc.schedule(reviewCard, 1, REVIEW_AT);
      expect(nextState.state).toBe('Relearning');
    });

    it('Again (1) increments lapses', () => {
      const { nextState } = svc.schedule(reviewCard, 1, REVIEW_AT);
      expect(nextState.lapses).toBe(1);
    });

    it('Good (3) on Review → stays in Review', () => {
      const { nextState } = svc.schedule(reviewCard, 3, REVIEW_AT);
      expect(nextState.state).toBe('Review');
    });

    it('Good (3): scheduledDays > elapsedDays (interval grows)', () => {
      const { scheduledDays } = svc.schedule(reviewCard, 3, REVIEW_AT);
      expect(scheduledDays).toBeGreaterThan(reviewCard.elapsedDays);
    });

    it('retrievability at next due date is in (0, 1]', () => {
      const { retrievability } = svc.schedule(reviewCard, 3, REVIEW_AT);
      expect(retrievability).toBeGreaterThan(0);
      expect(retrievability).toBeLessThanOrEqual(1);
    });
  });

  // ─── Determinism — the fuzz regression guard ─────────────────────────────────
  //
  // If enable_fuzz were true, FSRS would randomize intervals. This test would
  // then be flaky ~10% of the time (fuzz range is ±10–15%). A consistently
  // passing determinism test means fuzz is disabled. A future ts-fsrs upgrade
  // that changes the default will be caught here.

  describe('determinism', () => {
    // Use createInitialState (wraps ts-fsrs createEmptyCard) so difficulty=0,
    // stability=0 — the only valid New-card state. Manual construction of
    // difficulty=5, stability=0 is rejected by ts-fsrs as an inconsistent
    // memory state (non-zero difficulty implies prior learning history).
    const initial = (s: SchedulerService): FsrsCardState =>
      s.createInitialState('item-det', REVIEW_AT);

    it('same input → identical nextState.due for all ratings', () => {
      for (const rating of [1, 2, 3, 4] as const) {
        const r1 = svc.schedule(initial(svc), rating, REVIEW_AT);
        const r2 = svc.schedule(initial(svc), rating, REVIEW_AT);
        expect(r1.nextState.due).toBe(r2.nextState.due);
        expect(r1.scheduledDays).toBe(r2.scheduledDays);
      }
    });

    it('same event log replayed produces identical final state', () => {
      // Simulate three reviews: Good, Good, Easy
      const ratings = [3, 3, 4] as const;
      const dates = [
        new Date('2026-07-01T10:00:00Z'),
        new Date('2026-07-11T10:00:00Z'),
        new Date('2026-07-25T10:00:00Z'),
      ];

      function replay(s: SchedulerService): FsrsCardState {
        let state = s.createInitialState('item-x', dates[0]);
        for (let i = 0; i < ratings.length; i++) {
          state = s.schedule(state, ratings[i], dates[i]).nextState;
        }
        return state;
      }

      const final1 = replay(new SchedulerService());
      const final2 = replay(new SchedulerService());

      expect(final1.due).toBe(final2.due);
      expect(final1.stability).toBe(final2.stability);
      expect(final1.difficulty).toBe(final2.difficulty);
      expect(final1.state).toBe(final2.state);
    });
  });

  // ─── Exam mode — desiredRetention effect ─────────────────────────────────────

  describe('exam mode (desiredRetention)', () => {
    const reviewCard: FsrsCardState = {
      due:           '2026-07-01T10:00:00.000Z',
      stability:     14,
      difficulty:    5,
      state:         'Review',
      elapsedDays:   14,
      scheduledDays: 14,
      learningSteps: 0,
      reps:          6,
      lapses:        0,
      lastReview:    '2026-06-17T10:00:00.000Z',
    };

    it('higher desiredRetention produces a shorter or equal interval (Good)', () => {
      const { scheduledDays: days90 } = svc.schedule(reviewCard, 3, REVIEW_AT, 0.90);
      const { scheduledDays: days95 } = svc.schedule(reviewCard, 3, REVIEW_AT, 0.95);
      // 0.95 target = stricter = shorter interval
      expect(days95).toBeLessThanOrEqual(days90);
    });

    it('desiredRetention=0.95 produces meaningfully shorter interval than 0.90 for Easy', () => {
      const { scheduledDays: days90 } = svc.schedule(reviewCard, 4, REVIEW_AT, 0.90);
      const { scheduledDays: days95 } = svc.schedule(reviewCard, 4, REVIEW_AT, 0.95);
      expect(days95).toBeLessThan(days90);
    });
  });

  // ─── Retrievability ───────────────────────────────────────────────────────────

  describe('getRetrievability', () => {
    it('returns 0 for a New card', () => {
      const s = svc.createInitialState('item-1', NOW);
      expect(svc.getRetrievability(s, NOW)).toBe(0);
    });

    it('returns a value in (0, 1] for a Review card at due date', () => {
      const s: FsrsCardState = {
        due: '2026-07-10T10:00:00.000Z',
        stability: 10,
        difficulty: 5,
        state: 'Review',
        elapsedDays: 10,
        scheduledDays: 10,
        learningSteps: 0,
        reps: 3,
        lapses: 0,
        lastReview: '2026-06-30T10:00:00.000Z',
      };
      const r = svc.getRetrievability(s, new Date('2026-07-10T10:00:00.000Z'));
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(1);
    });

    it('retrievability decreases over time past due date', () => {
      const s: FsrsCardState = {
        due: '2026-07-10T10:00:00.000Z',
        stability: 10,
        difficulty: 5,
        state: 'Review',
        elapsedDays: 10,
        scheduledDays: 10,
        learningSteps: 0,
        reps: 3,
        lapses: 0,
        lastReview: '2026-06-30T10:00:00.000Z',
      };
      const atDue    = svc.getRetrievability(s, new Date('2026-07-10T10:00:00.000Z'));
      const twoWeeks = svc.getRetrievability(s, new Date('2026-07-24T10:00:00.000Z'));
      expect(twoWeeks).toBeLessThan(atDue);
    });
  });

  // ─── predictRetrievability ────────────────────────────────────────────────────

  describe('predictRetrievability', () => {
    it('returns 0 for a New card at any future date', () => {
      const s = svc.createInitialState('item-1', NOW);
      expect(svc.predictRetrievability(s, new Date('2026-12-01T00:00:00Z'))).toBe(0);
    });

    it('returns lower value at exam date than at due date for same card', () => {
      const s: FsrsCardState = {
        due: '2026-07-10T10:00:00.000Z',
        stability: 10,
        difficulty: 5,
        state: 'Review',
        elapsedDays: 10,
        scheduledDays: 10,
        learningSteps: 0,
        reps: 3,
        lapses: 0,
        lastReview: '2026-06-30T10:00:00.000Z',
      };
      const atDue   = svc.predictRetrievability(s, new Date('2026-07-10T10:00:00.000Z'));
      const tenDaysLater = svc.predictRetrievability(s, new Date('2026-07-20T10:00:00.000Z'));
      expect(tenDaysLater).toBeLessThan(atDue);
    });
  });
});
