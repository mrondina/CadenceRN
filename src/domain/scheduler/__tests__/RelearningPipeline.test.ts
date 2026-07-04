import { describe, it, expect, beforeEach } from 'vitest';
import { RelearningPipeline } from '../RelearningPipeline';
import { RELEARN_GRADUATION_N, DEFAULT_DAY_BOUNDARY } from '../../types';
import type { DateBoundaryConfig, Rating, RelearningResult } from '../../types';

const cfg = DEFAULT_DAY_BOUNDARY; // { hourOffset: 4 }

// Dates well-separated so isSameStudyDay never ambiguously merges them.
// All at 2pm to stay far from the 4am boundary.
const day1  = new Date(2026, 6, 1,  14, 0, 0);
const day2  = new Date(2026, 6, 2,  14, 0, 0);
const day3  = new Date(2026, 6, 3,  14, 0, 0);
const day4  = new Date(2026, 6, 4,  14, 0, 0);
const day10 = new Date(2026, 6, 10, 14, 0, 0);
const day11 = new Date(2026, 6, 11, 14, 0, 0);
const day12 = new Date(2026, 6, 12, 14, 0, 0);
const day13 = new Date(2026, 6, 13, 14, 0, 0);

/** Run a sequence of reviews through the pipeline, chaining results. */
function chain(
  pipeline: RelearningPipeline,
  start: { streak: number; graduated: boolean; lastQualifyingDate: string | null },
  reviews: Array<{ rating: Rating; reviewDate: Date }>,
  boundaryConfig: DateBoundaryConfig = cfg,
): RelearningResult {
  let state: RelearningResult = { ...start };
  for (const { rating, reviewDate } of reviews) {
    state = pipeline.processRating({
      currentStreak: state.streak,
      graduated: state.graduated,
      rating,
      reviewDate,
      lastQualifyingDate: state.lastQualifyingDate,
      boundaryConfig,
    });
  }
  return state;
}

describe('RelearningPipeline', () => {
  let pipeline: RelearningPipeline;

  beforeEach(() => {
    pipeline = new RelearningPipeline();
  });

  // ─── Again (1) ─────────────────────────────────────────────────────────────

  describe('Again (1)', () => {
    it('resets streak from 0 to 0 (idempotent on new items)', () => {
      const result = pipeline.processRating({
        currentStreak: 0, graduated: false, rating: 1,
        reviewDate: day1, lastQualifyingDate: null, boundaryConfig: cfg,
      });
      expect(result.streak).toBe(0);
      expect(result.graduated).toBe(false);
    });

    it('resets streak=2 to 0 (pre-graduation lapse)', () => {
      const result = pipeline.processRating({
        currentStreak: 2, graduated: false, rating: 1,
        reviewDate: day3, lastQualifyingDate: day2.toISOString(), boundaryConfig: cfg,
      });
      expect(result.streak).toBe(0);
      expect(result.graduated).toBe(false);
    });

    it('stores the lapse date as lastQualifyingDate (recovery must be a different day)', () => {
      const result = pipeline.processRating({
        currentStreak: 2, graduated: false, rating: 1,
        reviewDate: day3, lastQualifyingDate: day2.toISOString(), boundaryConfig: cfg,
      });
      expect(result.lastQualifyingDate).toBe(day3.toISOString());
    });

    // ── PRD: lapsed items re-enter the relearning pipeline automatically ─────

    it('un-graduates a graduated item (streak resets to 0, graduated=false)', () => {
      const result = pipeline.processRating({
        currentStreak: RELEARN_GRADUATION_N,
        graduated: true,
        rating: 1,
        reviewDate: day10,
        lastQualifyingDate: day3.toISOString(),
        boundaryConfig: cfg,
      });
      expect(result.graduated).toBe(false);
      expect(result.streak).toBe(0);
    });

    it('sets lastQualifyingDate to lapse date after un-graduation', () => {
      const result = pipeline.processRating({
        currentStreak: RELEARN_GRADUATION_N,
        graduated: true,
        rating: 1,
        reviewDate: day10,
        lastQualifyingDate: day3.toISOString(),
        boundaryConfig: cfg,
      });
      expect(result.lastQualifyingDate).toBe(day10.toISOString());
    });
  });

  // ─── Hard (2) — neutral in all states ─────────────────────────────────────

  describe('Hard (2)', () => {
    it('does not advance streak on an ungraduated item', () => {
      const result = pipeline.processRating({
        currentStreak: 1, graduated: false, rating: 2,
        reviewDate: day2, lastQualifyingDate: day1.toISOString(), boundaryConfig: cfg,
      });
      expect(result.streak).toBe(1);
    });

    it('does not reset a partial streak', () => {
      const result = pipeline.processRating({
        currentStreak: 2, graduated: false, rating: 2,
        reviewDate: day3, lastQualifyingDate: day2.toISOString(), boundaryConfig: cfg,
      });
      expect(result.streak).toBe(2);
      expect(result.graduated).toBe(false);
    });

    it('does not change lastQualifyingDate', () => {
      const lqd = day1.toISOString();
      const result = pipeline.processRating({
        currentStreak: 1, graduated: false, rating: 2,
        reviewDate: day2, lastQualifyingDate: lqd, boundaryConfig: cfg,
      });
      expect(result.lastQualifyingDate).toBe(lqd);
    });

    // ── Hard on graduated item — the "neutral in all states" clause ───────────

    it('leaves a graduated item graduated', () => {
      const result = pipeline.processRating({
        currentStreak: RELEARN_GRADUATION_N,
        graduated: true,
        rating: 2,
        reviewDate: day10,
        lastQualifyingDate: day3.toISOString(),
        boundaryConfig: cfg,
      });
      expect(result.graduated).toBe(true);
      expect(result.streak).toBe(RELEARN_GRADUATION_N);
    });

    it('does not mutate lastQualifyingDate on a graduated item', () => {
      const lqd = day3.toISOString();
      const result = pipeline.processRating({
        currentStreak: RELEARN_GRADUATION_N, graduated: true, rating: 2,
        reviewDate: day10, lastQualifyingDate: lqd, boundaryConfig: cfg,
      });
      expect(result.lastQualifyingDate).toBe(lqd);
    });
  });

  // ─── Good (3) and Easy (4) — progression toward graduation ────────────────

  describe('Good (3) and Easy (4)', () => {
    describe('qualifying retrievals', () => {
      it('first review with lastQualifyingDate=null advances streak to 1', () => {
        const result = pipeline.processRating({
          currentStreak: 0, graduated: false, rating: 3,
          reviewDate: day1, lastQualifyingDate: null, boundaryConfig: cfg,
        });
        expect(result.streak).toBe(1);
        expect(result.graduated).toBe(false);
      });

      it('second qualifying review on a different day advances streak to 2', () => {
        const result = chain(pipeline, { streak: 0, graduated: false, lastQualifyingDate: null }, [
          { rating: 3, reviewDate: day1 },
          { rating: 3, reviewDate: day2 },
        ]);
        expect(result.streak).toBe(2);
        expect(result.graduated).toBe(false);
      });

      it('third qualifying review graduates the item (N=3)', () => {
        const result = chain(pipeline, { streak: 0, graduated: false, lastQualifyingDate: null }, [
          { rating: 3, reviewDate: day1 },
          { rating: 3, reviewDate: day2 },
          { rating: 3, reviewDate: day3 },
        ]);
        expect(result.streak).toBe(RELEARN_GRADUATION_N);
        expect(result.graduated).toBe(true);
      });

      it('Easy (4) counts identically to Good (3)', () => {
        const withGood = chain(pipeline, { streak: 0, graduated: false, lastQualifyingDate: null }, [
          { rating: 3, reviewDate: day1 },
          { rating: 3, reviewDate: day2 },
          { rating: 3, reviewDate: day3 },
        ]);
        const withEasy = chain(pipeline, { streak: 0, graduated: false, lastQualifyingDate: null }, [
          { rating: 4, reviewDate: day1 },
          { rating: 4, reviewDate: day2 },
          { rating: 4, reviewDate: day3 },
        ]);
        expect(withGood.graduated).toBe(withEasy.graduated);
        expect(withGood.streak).toBe(withEasy.streak);
      });

      it('updates lastQualifyingDate to the qualifying review date', () => {
        const result = pipeline.processRating({
          currentStreak: 0, graduated: false, rating: 3,
          reviewDate: day2, lastQualifyingDate: day1.toISOString(), boundaryConfig: cfg,
        });
        expect(result.lastQualifyingDate).toBe(day2.toISOString());
      });
    });

    describe('same-study-day repeat (does not advance)', () => {
      it('Good at 10am then 3pm on the same study day does not advance streak', () => {
        const morning = new Date(2026, 6, 5, 10, 0, 0);
        const afternoon = new Date(2026, 6, 5, 15, 0, 0);

        const r1 = pipeline.processRating({
          currentStreak: 0, graduated: false, rating: 3,
          reviewDate: morning, lastQualifyingDate: null, boundaryConfig: cfg,
        });
        expect(r1.streak).toBe(1);

        const r2 = pipeline.processRating({
          currentStreak: r1.streak, graduated: r1.graduated, rating: 3,
          reviewDate: afternoon, lastQualifyingDate: r1.lastQualifyingDate, boundaryConfig: cfg,
        });
        expect(r2.streak).toBe(1); // no advance — same study day
      });

      it('10pm and 1am (spanning midnight) are the same study day — no advance', () => {
        const lateNight = new Date(2026, 6, 5, 22, 0, 0);  // 10pm Jul 5 → study day Jul 5
        const earlyMorn = new Date(2026, 6, 6,  1, 0, 0);  //  1am Jul 6 → study day Jul 5

        const r1 = pipeline.processRating({
          currentStreak: 1, graduated: false, rating: 3,
          reviewDate: lateNight, lastQualifyingDate: day4.toISOString(), boundaryConfig: cfg,
        });
        const r2 = pipeline.processRating({
          currentStreak: r1.streak, graduated: r1.graduated, rating: 3,
          reviewDate: earlyMorn, lastQualifyingDate: r1.lastQualifyingDate, boundaryConfig: cfg,
        });
        expect(r2.streak).toBe(r1.streak); // 1am counts as same study day as 10pm
      });
    });

    describe('Good on a graduated item', () => {
      it('leaves a graduated item graduated with streak unchanged', () => {
        const result = pipeline.processRating({
          currentStreak: RELEARN_GRADUATION_N,
          graduated: true,
          rating: 3,
          reviewDate: day10,
          lastQualifyingDate: day3.toISOString(),
          boundaryConfig: cfg,
        });
        expect(result.graduated).toBe(true);
        expect(result.streak).toBe(RELEARN_GRADUATION_N);
      });
    });
  });

  // ─── Again on graduated item + full recovery path ──────────────────────────
  // Covers the PRD requirement: lapsed items re-enter the full N=3 cycle.

  describe('Again on graduated item → full re-entry into relearning pipeline', () => {
    it('un-graduates and resets streak to 0 (explicit row)', () => {
      const afterLapse = pipeline.processRating({
        currentStreak: RELEARN_GRADUATION_N,
        graduated: true,
        lastQualifyingDate: day3.toISOString(),
        rating: 1,
        reviewDate: day10,
        boundaryConfig: cfg,
      });
      expect(afterLapse.graduated).toBe(false);
      expect(afterLapse.streak).toBe(0);
    });

    it('recovery: Good on same day as lapse does NOT qualify (requires separate day)', () => {
      const afterLapse = chain(pipeline,
        { streak: RELEARN_GRADUATION_N, graduated: true, lastQualifyingDate: day3.toISOString() },
        [
          { rating: 1, reviewDate: day10 },  // lapse — lastQualifyingDate becomes day10
          { rating: 3, reviewDate: day10 },  // same study day → no advance
        ],
      );
      expect(afterLapse.streak).toBe(0);
      expect(afterLapse.graduated).toBe(false);
    });

    it('recovery path: three qualifying retrievals on separate days re-graduates', () => {
      const result = chain(pipeline,
        { streak: RELEARN_GRADUATION_N, graduated: true, lastQualifyingDate: day3.toISOString() },
        [
          { rating: 1, reviewDate: day10 },  // lapse: streak=0, graduated=false
          { rating: 3, reviewDate: day11 },  // recovery 1: streak=1
          { rating: 3, reviewDate: day12 },  // recovery 2: streak=2
          { rating: 3, reviewDate: day13 },  // recovery 3: streak=3 → re-graduated
        ],
      );
      expect(result.streak).toBe(RELEARN_GRADUATION_N);
      expect(result.graduated).toBe(true);
    });

    it('Hard immediately after un-graduation leaves item un-graduated (Hard is neutral)', () => {
      const result = chain(pipeline,
        { streak: RELEARN_GRADUATION_N, graduated: true, lastQualifyingDate: day3.toISOString() },
        [
          { rating: 1, reviewDate: day10 },  // un-graduate
          { rating: 2, reviewDate: day11 },  // Hard — neutral
        ],
      );
      expect(result.graduated).toBe(false);
      expect(result.streak).toBe(0);
    });
  });

  // ─── RELEARN_GRADUATION_N constant ────────────────────────────────────────

  it('RELEARN_GRADUATION_N is 3', () => {
    expect(RELEARN_GRADUATION_N).toBe(3);
  });
});
