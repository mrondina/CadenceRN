/**
 * advanceDrillStreak — unit tests confirming boundary config flows through correctly.
 *
 * Key invariant: the caller-supplied DateBoundaryConfig, not DEFAULT_DAY_BOUNDARY,
 * determines which study day "now" and "yesterday" resolve to.
 *
 * Date construction: use new Date(y, m-1, d, h) (local time) — same convention as
 * DateBoundary.test.ts, which notes that the algorithm is timezone-agnostic because
 * both the input and the shifted read use the same local offset.
 */
import { describe, it, expect } from 'vitest';
import { advanceDrillStreak } from '../useDrillSession';
import type { DrillStreak } from '../../domain/types';

const emptyStreak: DrillStreak = {
  currentStreak: 0,
  longestStreak: 0,
  lastDrillDate: null,
};

// 3am local July 5 2026 — straddles 2am and 4am boundaries.
// Under 4am: study day = July 4 (3 < 4 → previous day)
// Under 2am: study day = July 5 (3 ≥ 2 → current day)
const AT_3AM_LOCAL_JULY_5 = new Date(2026, 6, 5, 3, 0, 0);

describe('advanceDrillStreak — boundary config flows through', () => {
  it('default 4am boundary: 3am July 5 resolves to study day July 4', () => {
    const result = advanceDrillStreak(emptyStreak, AT_3AM_LOCAL_JULY_5);
    expect(result.lastDrillDate).toBe('2026-07-04');
    expect(result.currentStreak).toBe(1);
  });

  it('non-default 2am boundary: 3am July 5 resolves to study day July 5', () => {
    const result = advanceDrillStreak(emptyStreak, AT_3AM_LOCAL_JULY_5, { hourOffset: 2 });
    expect(result.lastDrillDate).toBe('2026-07-05');
    expect(result.currentStreak).toBe(1);
  });

  it('same-study-day guard: two 3am drills under 4am boundary — no double-count', () => {
    const first  = advanceDrillStreak(emptyStreak, AT_3AM_LOCAL_JULY_5);
    const second = advanceDrillStreak(first, AT_3AM_LOCAL_JULY_5);
    // Both are study day July 4 → second call is a same-day no-op
    expect(second.currentStreak).toBe(1);
    expect(second.lastDrillDate).toBe('2026-07-04');
  });

  it('2am boundary: lastDrillDate=July 4, now=3am July 5 → consecutive → streak increments', () => {
    // Under 2am: today=July 5, yesterday=July 4 → lastDate === yesterday → +1
    const prev: DrillStreak = { currentStreak: 2, longestStreak: 3, lastDrillDate: '2026-07-04' };
    const result = advanceDrillStreak(prev, AT_3AM_LOCAL_JULY_5, { hourOffset: 2 });
    expect(result.currentStreak).toBe(3);
    expect(result.lastDrillDate).toBe('2026-07-05');
  });

  it('4am boundary: lastDrillDate=July 4, now=3am July 5 → same study day → no change', () => {
    // Under 4am: today=July 4 → lastDate === todayStr → streak unchanged
    const prev: DrillStreak = { currentStreak: 2, longestStreak: 3, lastDrillDate: '2026-07-04' };
    const result = advanceDrillStreak(prev, AT_3AM_LOCAL_JULY_5);
    expect(result.currentStreak).toBe(2);
    expect(result.lastDrillDate).toBe('2026-07-04');
  });

  it('streak broken by two-day gap resets to 1', () => {
    // Under 4am: today=July 4; yesterday=July 3; lastDate=July 2 → gap → reset
    const prev: DrillStreak = { currentStreak: 5, longestStreak: 5, lastDrillDate: '2026-07-02' };
    const result = advanceDrillStreak(prev, AT_3AM_LOCAL_JULY_5);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(5); // longest preserved
  });

  it('longestStreak updated when new streak surpasses it', () => {
    // Under 4am: today=July 4; yesterday=July 3 → consecutive → +1
    const prev: DrillStreak = { currentStreak: 3, longestStreak: 3, lastDrillDate: '2026-07-03' };
    const result = advanceDrillStreak(prev, AT_3AM_LOCAL_JULY_5);
    expect(result.currentStreak).toBe(4);
    expect(result.longestStreak).toBe(4);
  });

  it('first-ever drill (null lastDate) always starts streak at 1', () => {
    const result = advanceDrillStreak(emptyStreak, new Date(2026, 6, 5, 10, 0, 0));
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });
});
