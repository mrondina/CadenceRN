import { describe, it, expect, beforeEach } from 'vitest';
import { DebtForecaster } from '../DebtForecaster';
import type { ActiveExam, DateBoundaryConfig, ItemMemoryState } from '../../types';

// ─── Fixed reference points ───────────────────────────────────────────────────

// 2pm UTC — unambiguous calendar date at any US timezone offset
const NOW = new Date('2026-07-03T14:00:00.000Z');
const cfg: DateBoundaryConfig = { hourOffset: 4 };

// ─── Factories ────────────────────────────────────────────────────────────────

function makeStateDue(itemId: string, dueIso: string): ItemMemoryState {
  return {
    itemId,
    fsrs: {
      stability: 10,
      difficulty: 5,
      due: dueIso,
      state: 'Review',
      elapsedDays: 10,
      scheduledDays: 10,
      learningSteps: 0,
      reps: 5,
      lapses: 0,
      lastReview: '2026-06-20T14:00:00.000Z',
    },
    relearnStreak: 0,
    graduated: true,
    lastQualifyingDate: null,
    updatedAt: '2026-06-20T14:00:00.000Z',
  };
}

function makeExam(examDate: string, daysRemaining: number): ActiveExam {
  return { courseId: 'c1', courseTitle: 'Course 1', examDate, daysRemaining };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('DebtForecaster', () => {
  let forecaster: DebtForecaster;

  beforeEach(() => {
    forecaster = new DebtForecaster();
  });

  const forecast = (overrides: Partial<Parameters<DebtForecaster['forecast']>[0]> = {}) =>
    forecaster.forecast({ states: [], now: NOW, boundaryConfig: cfg, ...overrides });

  // ─── Basic output shape ────────────────────────────────────────────────────

  it('returns exactly `days` entries (default 7)', () => {
    expect(forecast().length).toBe(7);
  });

  it('returns exactly `days` entries when days=3', () => {
    expect(forecast({ days: 3 }).length).toBe(3);
  });

  it('day 0 date matches current study day', () => {
    const result = forecast();
    expect(result[0].date).toBe('2026-07-03');
  });

  it('consecutive entries are consecutive calendar days', () => {
    const result = forecast();
    expect(result.map(d => d.date)).toEqual([
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
    ]);
  });

  // ─── Due count bucketing ───────────────────────────────────────────────────

  it('empty states → all dueCount=0', () => {
    expect(forecast().every(d => d.dueCount === 0)).toBe(true);
  });

  it('item due on day 2 of the window is bucketed on day 2', () => {
    // Day 2 = 2026-07-05; item due at 2pm UTC that day
    const state = makeStateDue('a', '2026-07-05T14:00:00.000Z');
    const result = forecast({ states: [state] });
    expect(result[0].dueCount).toBe(0); // day 0
    expect(result[2].dueCount).toBe(1); // day 2
    expect(result[3].dueCount).toBe(0); // day 3
  });

  it('multiple items due on the same day accumulate correctly', () => {
    const items = ['a', 'b', 'c'].map(id => makeStateDue(id, '2026-07-05T14:00:00.000Z'));
    const result = forecast({ states: items });
    expect(result[2].dueCount).toBe(3);
  });

  it('items spread across different days are each bucketed correctly', () => {
    const states = [
      makeStateDue('a', '2026-07-03T14:00:00.000Z'), // day 0
      makeStateDue('b', '2026-07-05T14:00:00.000Z'), // day 2
      makeStateDue('c', '2026-07-05T14:00:00.000Z'), // day 2
      makeStateDue('d', '2026-07-07T14:00:00.000Z'), // day 4
    ];
    const result = forecast({ states });
    expect(result[0].dueCount).toBe(1);
    expect(result[2].dueCount).toBe(2);
    expect(result[4].dueCount).toBe(1);
  });

  it('item due beyond the forecast window is not counted', () => {
    const state = makeStateDue('future', '2026-07-15T14:00:00.000Z'); // day 12, out of 7-day window
    expect(forecast({ states: [state] }).every(d => d.dueCount === 0)).toBe(true);
  });

  it('overdue item folds into day-0 — overdue debt IS today\'s load', () => {
    const state = makeStateDue('overdue', '2026-07-01T14:00:00.000Z'); // 2 days ago
    const result = forecast({ states: [state] });
    expect(result[0].dueCount).toBe(1);
    expect(result.slice(1).every(d => d.dueCount === 0)).toBe(true);
  });

  it('due date from three weeks ago still lands in day-0, not a discarded bucket', () => {
    const ancient = makeStateDue('old', '2026-06-10T14:00:00.000Z');
    const result = forecast({ states: [ancient] });
    expect(result[0].dueCount).toBe(1);
  });

  it('140 overdue + 10 due today → day-0 = 150, warning fires', () => {
    const overdue = Array.from({ length: 140 }, (_, i) =>
      makeStateDue(`o${i}`, '2026-06-20T14:00:00.000Z'),
    );
    const today = Array.from({ length: 10 }, (_, i) =>
      makeStateDue(`t${i}`, '2026-07-03T14:00:00.000Z'),
    );
    const result = forecast({ states: [...overdue, ...today] });
    expect(result[0].dueCount).toBe(150);
    expect(result[0].isWarning).toBe(true);
  });

  // ─── Study-day boundary: 4am cutoff ───────────────────────────────────────

  it('item due at 2am next calendar day falls in current study day (4am boundary)', () => {
    // 2026-07-04T02:00Z − 4h = 2026-07-03T22:00Z → study day '2026-07-03'
    const state = makeStateDue('a', '2026-07-04T02:00:00.000Z');
    const result = forecast({ states: [state] });
    expect(result[0].date).toBe('2026-07-03');
    expect(result[0].dueCount).toBe(1); // bucketed in study day 0
    expect(result[1].dueCount).toBe(0); // NOT in study day 1
  });

  it('item due at 2pm UTC next calendar day falls in the next study day', () => {
    // 2026-07-04T14:00Z is 2pm UTC = well past 4am local in any US timezone.
    // shifted = 10am UTC July 4 → local date = July 4 everywhere → study day '2026-07-04'
    const state = makeStateDue('a', '2026-07-04T14:00:00.000Z');
    const result = forecast({ states: [state] });
    expect(result[0].dueCount).toBe(0); // NOT in study day 0
    expect(result[1].dueCount).toBe(1); // bucketed in study day 1
  });

  // ─── Exam candidates ──────────────────────────────────────────────────────

  it('exam candidates add to day-0 count when activeExam is present', () => {
    const candidates = ['x', 'y', 'z'].map(id => makeStateDue(id, '2026-07-08T14:00:00.000Z'));
    const result = forecast({
      examCandidates: candidates,
      activeExam: makeExam('2026-07-07', 4),
    });
    expect(result[0].dueCount).toBe(3); // candidates folded into day 0
  });

  it('exam candidates do NOT add to day-0 when activeExam is null', () => {
    const candidates = ['x', 'y'].map(id => makeStateDue(id, '2026-07-08T14:00:00.000Z'));
    const result = forecast({ examCandidates: candidates, activeExam: null });
    expect(result[0].dueCount).toBe(0);
  });

  it('exam candidates do NOT add to day-0 when activeExam is undefined (not provided)', () => {
    const candidates = ['x'].map(id => makeStateDue(id, '2026-07-08T14:00:00.000Z'));
    const result = forecast({ examCandidates: candidates }); // activeExam omitted
    expect(result[0].dueCount).toBe(0);
  });

  it('exam candidates + natural dues on day 0 are summed correctly', () => {
    const due = makeStateDue('nat', '2026-07-03T14:00:00.000Z'); // natural due today
    const candidates = ['x', 'y'].map(id => makeStateDue(id, '2026-07-08T14:00:00.000Z'));
    const result = forecast({
      states: [due],
      examCandidates: candidates,
      activeExam: makeExam('2026-07-07', 4),
    });
    expect(result[0].dueCount).toBe(3); // 1 natural + 2 candidates
  });

  // ─── isExamWindow annotation ──────────────────────────────────────────────

  it('all days false when activeExam is null', () => {
    expect(forecast({ activeExam: null }).every(d => !d.isExamWindow)).toBe(true);
  });

  it('all days false when activeExam is not provided', () => {
    expect(forecast().every(d => !d.isExamWindow)).toBe(true);
  });

  it('days up to and including examDate are true; days after are false', () => {
    // Exam on July 7 (4 days from July 3)
    // Days 0-4 (Jul 3–Jul 7) → isExamWindow=true; days 5-6 (Jul 8–9) → false
    const result = forecast({ activeExam: makeExam('2026-07-07', 4) });
    const window = result.map(d => d.isExamWindow);
    expect(window).toEqual([true, true, true, true, true, false, false]);
  });

  it('exam date beyond forecast window → all 7 days are in exam window', () => {
    // Exam on Jul 15, forecast covers Jul 3-9 — all inside the window
    const result = forecast({ activeExam: makeExam('2026-07-15', 12) });
    expect(result.every(d => d.isExamWindow)).toBe(true);
  });

  it('exam date is today → only day 0 is in exam window', () => {
    const result = forecast({ activeExam: makeExam('2026-07-03', 0) });
    expect(result[0].isExamWindow).toBe(true);
    expect(result.slice(1).every(d => !d.isExamWindow)).toBe(true);
  });

  // ─── Warning threshold ────────────────────────────────────────────────────

  it('all-zero counts → no warnings', () => {
    expect(forecast().every(d => !d.isWarning)).toBe(true);
  });

  it('zero-median week: small spike does not warn (floor=10 prevents false alarm)', () => {
    // [0,0,0,3,0,0,0]: median=0, 1.5×0=0 → 3>0 is true, but 3>10 is false → no warning
    const states = [makeStateDue('a', '2026-07-06T14:00:00.000Z'),
                    makeStateDue('b', '2026-07-06T14:00:00.000Z'),
                    makeStateDue('c', '2026-07-06T14:00:00.000Z')];
    const result = forecast({ states });
    expect(result.every(d => !d.isWarning)).toBe(true);
  });

  it('uniform load → no warnings (counts equal the median, not above 1.5×)', () => {
    const states = Array.from({ length: 7 }, (_, i) =>
      makeStateDue(`item${i}`, `2026-07-0${3 + i}T14:00:00.000Z`),
    );
    // One item per day → all counts=1; median=1; threshold=1.5; 1 > 1.5 is false
    const result = forecast({ states });
    expect(result.every(d => !d.isWarning)).toBe(true);
  });

  it('spike day triggers warning; normal days do not', () => {
    // 5 items on each of days 1–6, but 20 items on day 0
    const normal = Array.from({ length: 30 }, (_, i) => {
      const day = (i % 6) + 1; // days 1–6, 5 items each
      return makeStateDue(`n${i}`, `2026-07-0${3 + day}T14:00:00.000Z`);
    });
    const spike = Array.from({ length: 20 }, (_, i) =>
      makeStateDue(`s${i}`, '2026-07-03T14:00:00.000Z'),
    );
    const result = forecast({ states: [...normal, ...spike] });
    // counts: day0=20, days1-6=5 each
    // sorted: [5,5,5,5,5,5,20] → median=5 → threshold=7.5
    expect(result[0].isWarning).toBe(true);   // 20 > 7.5
    expect(result.slice(1).every(d => !d.isWarning)).toBe(true); // 5 ≤ 7.5
  });

  it('warning threshold is strictly greater-than (not ≥)', () => {
    // If count equals 1.5× median exactly, it should NOT be a warning.
    // [10, 10, 10, 10, 10, 10, 15]: median=10, threshold=15; 15 > 15 = false
    const normal = Array.from({ length: 60 }, (_, i) => {
      const day = (i % 6) + 1;
      return makeStateDue(`n${i}`, `2026-07-0${3 + day}T14:00:00.000Z`);
    }); // 10 per day across days 1-6
    const atThreshold = Array.from({ length: 15 }, (_, i) =>
      makeStateDue(`t${i}`, '2026-07-03T14:00:00.000Z'),
    ); // day 0 = 15
    const result = forecast({ states: [...normal, ...atThreshold] });
    // counts: day0=15, days1-6=10; sorted=[10,10,10,10,10,10,15]; median=10; threshold=15
    expect(result[0].dueCount).toBe(15);
    expect(result[0].isWarning).toBe(false); // 15 > 15 is false
  });

  it('exam candidate spike inflates day-0 and can trigger a warning', () => {
    const natural = ['a', 'b', 'c'].map(id => makeStateDue(id, '2026-07-03T14:00:00.000Z'));
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeStateDue(`c${i}`, '2026-07-09T14:00:00.000Z'),
    );
    const result = forecast({
      states: natural,
      examCandidates: candidates,
      activeExam: makeExam('2026-07-07', 4),
    });
    // day 0: 3 natural + 20 candidates = 23; days 1-6: 0
    // sorted: [0,0,0,0,0,0,23]; median=0; threshold=0; 23 > 0 = true
    expect(result[0].dueCount).toBe(23);
    expect(result[0].isWarning).toBe(true);
  });

  it('days parameter controls number of returned entries', () => {
    const result = forecast({ days: 14 });
    expect(result.length).toBe(14);
    expect(result[13].date).toBe('2026-07-16');
  });

  it('days=1 returns exactly one entry for today', () => {
    const result = forecast({ days: 1 });
    expect(result.length).toBe(1);
    expect(result[0].date).toBe('2026-07-03');
  });
});
