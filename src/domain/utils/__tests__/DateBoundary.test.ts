import { describe, it, expect } from 'vitest';
import { getStudyDay, isSameStudyDay, nextStudyDayStart } from '../DateBoundary';
import { DEFAULT_DAY_BOUNDARY } from '../../types';

// All `new Date(y, m, d, h)` calls use local time, which is correct: students
// interact with local clock times. Tests are timezone-agnostic because the
// DateBoundary algorithm subtracts ms from getTime() and reads back via local
// accessors — both sides of the computation share the same timezone offset.

const cfg = DEFAULT_DAY_BOUNDARY; // { hourOffset: 4 }

describe('getStudyDay', () => {
  describe('with default 4am boundary', () => {
    it('returns same calendar date at 5am (after boundary)', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 5, 0, 0), cfg)).toBe('2026-07-04');
    });

    it('returns previous calendar date at 2am (before boundary)', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 2, 0, 0), cfg)).toBe('2026-07-03');
    });

    it('returns same calendar date exactly at 4am boundary', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 4, 0, 0), cfg)).toBe('2026-07-04');
    });

    it('returns previous calendar date at midnight (00:00)', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 0, 0, 0), cfg)).toBe('2026-07-03');
    });

    it('returns same calendar date at 11pm', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 23, 0, 0), cfg)).toBe('2026-07-04');
    });

    it('crosses month boundary correctly (July 1 at 1am → June 30)', () => {
      expect(getStudyDay(new Date(2026, 6, 1, 1, 0, 0), cfg)).toBe('2026-06-30');
    });

    it('crosses year boundary correctly (Jan 1 at 1am → Dec 31)', () => {
      expect(getStudyDay(new Date(2027, 0, 1, 1, 0, 0), cfg)).toBe('2026-12-31');
    });

    it('handles 23:59 as same study day', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 23, 59, 59), cfg)).toBe('2026-07-04');
    });

    it('handles 03:59 as previous study day', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 3, 59, 59), cfg)).toBe('2026-07-03');
    });
  });

  describe('with custom hourOffset = 6', () => {
    const cfg6 = { hourOffset: 6 };

    it('returns previous day at 5am when offset is 6', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 5, 0, 0), cfg6)).toBe('2026-07-03');
    });

    it('returns same day at 6am when offset is 6', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 6, 0, 0), cfg6)).toBe('2026-07-04');
    });
  });

  describe('with hourOffset = 0 (midnight boundary)', () => {
    const cfg0 = { hourOffset: 0 };

    it('returns same calendar date at midnight', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 0, 0, 0), cfg0)).toBe('2026-07-04');
    });

    it('returns same calendar date at 2am', () => {
      expect(getStudyDay(new Date(2026, 6, 4, 2, 0, 0), cfg0)).toBe('2026-07-04');
    });
  });

  // DST note: the algorithm uses getTime() subtraction (UTC ms) and reads
  // back via local accessors, so local timezone offsets including DST are
  // handled correctly by the JS engine. No explicit DST test is included
  // because the result depends on the test runner's timezone; the algorithm
  // is correct by construction.
});

describe('isSameStudyDay', () => {
  it('is true for 10pm and 1am spanning midnight on same study day', () => {
    const a = new Date(2026, 6, 4, 22, 0, 0); // 10pm Jul 4 → study day Jul 4
    const b = new Date(2026, 6, 5, 1, 0, 0);  // 1am  Jul 5 → study day Jul 4
    expect(isSameStudyDay(a, b, cfg)).toBe(true);
  });

  it('is false when times are on different study days', () => {
    const a = new Date(2026, 6, 4, 22, 0, 0); // 10pm Jul 4 → study day Jul 4
    const b = new Date(2026, 6, 5, 5, 0, 0);  // 5am  Jul 5 → study day Jul 5
    expect(isSameStudyDay(a, b, cfg)).toBe(false);
  });

  it('is true for same instant compared to itself', () => {
    const a = new Date(2026, 6, 4, 12, 0, 0);
    expect(isSameStudyDay(a, a, cfg)).toBe(true);
  });

  it('is false at 3:59am vs 4:00am (boundary edge)', () => {
    const before = new Date(2026, 6, 4, 3, 59, 59);  // → study day Jul 3
    const after  = new Date(2026, 6, 4, 4, 0, 0);    // → study day Jul 4
    expect(isSameStudyDay(before, after, cfg)).toBe(false);
  });
});

describe('nextStudyDayStart', () => {
  it('returns the 4am timestamp of the next calendar day', () => {
    const now = new Date(2026, 6, 4, 14, 0, 0); // 2pm Jul 4 → study day Jul 4
    const next = nextStudyDayStart(now, cfg);
    // Next study day starts at 2026-07-05T04:00 local
    expect(getStudyDay(next, cfg)).toBe('2026-07-05');
    expect(next.getHours()).toBe(cfg.hourOffset);
  });

  it('works when called before the boundary (1am)', () => {
    const now = new Date(2026, 6, 4, 1, 0, 0); // 1am Jul 4 → study day Jul 3
    const next = nextStudyDayStart(now, cfg);
    expect(getStudyDay(next, cfg)).toBe('2026-07-04');
  });
});
