import { describe, it, expect } from 'vitest';
import { ReleaseGate } from '../ReleaseGate';
import type { Cohort, ContentItem, SessionInstance } from '../../types';

// ─── Test cohort ──────────────────────────────────────────────────────────────

// Session 1 starts 2026-07-01 (Wednesday). Week boundaries run Wed→Tue.
// Session 2 starts 2026-09-15 (well after session 1's 8-week end 2026-08-25).
// Sessions 3–6 are far in the future and exist only to satisfy the type.

const S1_START = '2026-07-01'; // Wednesday

function makeCohort(overrides: Partial<Record<number, Partial<SessionInstance>>> = {}): Cohort {
  function session(
    idx: 1 | 2 | 3 | 4 | 5 | 6,
    start: string,
    end: string,
  ): SessionInstance {
    return {
      id: `s${idx}`,
      cohortId: 'cohort-1',
      sessionIndex: idx,
      label: `Session ${idx}`,
      startDate: start,
      endDate: end,
      courses: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides[idx],
    };
  }
  return {
    id: 'cohort-1',
    startDate: S1_START,
    templateId: 'bellarmine-absn-v1',
    sessions: [
      session(1, '2026-07-01', '2026-08-25'),
      session(2, '2026-09-15', '2026-11-09'),
      session(3, '2027-01-05', '2027-03-01'),
      session(4, '2027-04-01', '2027-05-26'),
      session(5, '2027-07-01', '2027-08-25'),
      session(6, '2027-10-01', '2027-11-25'),
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeItem(sessionIndex: number, week: number): ContentItem {
  return {
    id: `item-s${sessionIndex}w${week}`,
    pillar: 'terminology',
    format: 'cloze',
    difficultyTier: 1,
    body: { type: 'cloze', front: 'Q', back: 'A' },
    sourceCitation: 'test',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex, week },
    contentPackId: 'pack-1',
    contentVersion: 1,
    placeholder: false,
    caseId: null,
    caseOrder: null,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ReleaseGate', () => {
  const gate = new ReleaseGate();
  const cohort = makeCohort();

  const check = (item: ContentItem, nowIso: string) =>
    gate.check(item, cohort, new Date(nowIso));

  // ─── Before cohort starts ────────────────────────────────────────────────

  it('before any session has started → locked', () => {
    const now = '2026-06-30T14:00:00.000Z'; // one day before session 1
    expect(check(makeItem(1, 1), now)).toBe('locked');
    expect(check(makeItem(2, 1), now)).toBe('locked');
  });

  // ─── Current session (session 1) ─────────────────────────────────────────

  it('session 1 week 1 item unlocks on session start date (day 0)', () => {
    // Day 0 → daysSinceStart=0 → weekWithin=1 ≥ 1 → unlocked
    expect(check(makeItem(1, 1), '2026-07-01T14:00:00.000Z')).toBe('unlocked');
  });

  it('session 1 week 2 item is locked on day 0 (still week 1)', () => {
    expect(check(makeItem(1, 2), '2026-07-01T14:00:00.000Z')).toBe('locked');
  });

  it('session 1 week 2 item is locked on day 6 (Tuesday, 6 days in, still week 1)', () => {
    // Day 6 → floor(6/7)=0 → week=1 < 2 → locked
    expect(check(makeItem(1, 2), '2026-07-07T14:00:00.000Z')).toBe('locked');
  });

  it('session 1 week 2 item unlocks on day 7 (the following Wednesday, week 2 starts)', () => {
    // Day 7 → floor(7/7)=1 → week=2 ≥ 2 → unlocked
    // This is July 8 (Wednesday), proving weeks are session-anchored, not Monday-anchored.
    expect(check(makeItem(1, 2), '2026-07-08T14:00:00.000Z')).toBe('unlocked');
  });

  it('session 1 week 4 item is locked in week 3', () => {
    // Day 21 → floor(21/7)=3 → week=4... wait, day 21 is first day of week 4.
    // Day 20 → floor(20/7)=2 → week=3 < 4 → locked
    expect(check(makeItem(1, 4), '2026-07-21T14:00:00.000Z')).toBe('locked');
  });

  it('session 1 week 4 item unlocks on day 21 (start of week 4)', () => {
    // Day 21 → floor(21/7)=3 → week=4 ≥ 4 → unlocked
    expect(check(makeItem(1, 4), '2026-07-22T14:00:00.000Z')).toBe('unlocked');
  });

  // ─── Wednesday-start boundary (the named requirement) ────────────────────

  it('Wednesday-start: week boundary falls on Wednesday, not Monday', () => {
    // Session 1 starts July 1 (Wed). Week 2 should unlock July 8 (Wed), not July 6 (Mon).
    const item = makeItem(1, 2);
    expect(check(item, '2026-07-05T14:00:00.000Z')).toBe('locked');   // Sunday (day 4)
    expect(check(item, '2026-07-06T14:00:00.000Z')).toBe('locked');   // Monday (day 5)
    expect(check(item, '2026-07-07T14:00:00.000Z')).toBe('locked');   // Tuesday (day 6) — last day of week 1
    expect(check(item, '2026-07-08T14:00:00.000Z')).toBe('unlocked'); // Wednesday (day 7) — week 2 begins
  });

  // ─── Past session ────────────────────────────────────────────────────────

  it('item from a past session is fully unlocked', () => {
    // In session 2 (now = Sept 15+), session 1 items are past → unlocked regardless of week
    const now = '2026-09-15T14:00:00.000Z'; // session 2 start
    expect(check(makeItem(1, 1), now)).toBe('unlocked');
    expect(check(makeItem(1, 8), now)).toBe('unlocked'); // even last week of past session
  });

  // ─── Pull-ahead-available (one session ahead) ─────────────────────────────

  it('item from the next session is pull-ahead-available (not locked)', () => {
    // During session 1, session 2 items are pull-ahead-available
    expect(check(makeItem(2, 1), '2026-07-15T14:00:00.000Z')).toBe('pull-ahead-available');
  });

  it('item from two or more sessions ahead is locked', () => {
    // During session 1, session 3+ are locked
    expect(check(makeItem(3, 1), '2026-07-15T14:00:00.000Z')).toBe('locked');
    expect(check(makeItem(6, 1), '2026-07-15T14:00:00.000Z')).toBe('locked');
  });

  // ─── Gap period (between sessions) ───────────────────────────────────────

  it('during a gap between sessions, next-session items are pull-ahead-available', () => {
    // Session 1 ends Aug 25; session 2 starts Sep 15; now = Sep 1 (gap)
    // currentSessionIdx = 1 (session 1 started, session 2 not yet)
    const now = '2026-09-01T14:00:00.000Z';
    expect(check(makeItem(1, 1), now)).toBe('unlocked');           // past session
    expect(check(makeItem(2, 1), now)).toBe('pull-ahead-available'); // next session
    expect(check(makeItem(3, 1), now)).toBe('locked');             // too far ahead
  });

  // ─── Session 2 gate (confirms multi-session behavior) ────────────────────

  it('session 2 week 1 item unlocks on session 2 start date', () => {
    expect(check(makeItem(2, 1), '2026-09-15T14:00:00.000Z')).toBe('unlocked');
  });

  it('session 2 week 3 item is locked on session 2 day 6', () => {
    // Sep 15 + 13 = Sep 28 → day 13 → floor(13/7)=1 → week=2 < 3 → locked
    expect(check(makeItem(2, 3), '2026-09-28T14:00:00.000Z')).toBe('locked');
  });

  it('session 2 week 3 item unlocks on day 14 of session 2', () => {
    // Sep 15 + 14 = Sep 29 → day 14 → floor(14/7)=2 → week=3 ≥ 3 → unlocked
    expect(check(makeItem(2, 3), '2026-09-29T14:00:00.000Z')).toBe('unlocked');
  });

  // ─── Week index boundary condition ────────────────────────────────────────

  it('weekWithinSession formula: floor(daysSinceStart / 7) + 1 is correct at boundaries', () => {
    const item = makeItem(1, 5); // needs week 5 (days 28–34)
    // Day 27 (last day of week 4): floor(27/7)=3 → week=4 < 5 → locked
    expect(check(item, '2026-07-28T14:00:00.000Z')).toBe('locked');
    // Day 28 (first day of week 5): floor(28/7)=4 → week=5 ≥ 5 → unlocked
    expect(check(item, '2026-07-29T14:00:00.000Z')).toBe('unlocked');
  });
});
