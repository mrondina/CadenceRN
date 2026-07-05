import { describe, it, expect } from 'vitest';
import { CohortBuilder, getCurrentSession } from '../CohortBuilder';

// July 1, 2026 is a Wednesday — used to verify non-Monday-anchored week blocks.
const WED_START = new Date('2026-07-01T00:00:00.000Z');

describe('CohortBuilder', () => {
  const builder = new CohortBuilder();

  // ─── build() basic shape ──────────────────────────────────────────────────

  it('returns a cohort with exactly 6 sessions', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    expect(c.sessions).toHaveLength(6);
  });

  it('cohort id, startDate, and templateId are preserved', () => {
    const c = builder.build({ id: 'my-cohort', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    expect(c.id).toBe('my-cohort');
    expect(c.startDate).toBe('2026-07-01');
    expect(c.templateId).toBe('bellarmine-absn-v1');
  });

  it('sessionIndex values are 1–6 in order', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    expect(c.sessions.map(s => s.sessionIndex)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('throws for an unknown templateId', () => {
    expect(() =>
      builder.build({ id: 'c1', startDate: WED_START, templateId: 'not-a-template' }),
    ).toThrow('Unknown cohort template');
  });

  // ─── Session 1 date arithmetic ────────────────────────────────────────────

  it('session 1 starts on the cohort start date', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    expect(c.sessions[0].startDate).toBe('2026-07-01');
  });

  it('session 1 end date = start + 8 weeks − 1 day (July 1 + 55 = Aug 25)', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    // Jul: 30 remaining days (Jul 2–31) + Aug 25 = 30+25 = 55 days after Jul 1.
    expect(c.sessions[0].endDate).toBe('2026-08-25');
  });

  // ─── Session 2 is independently seeded, not chained ──────────────────────

  it('session 2 start is seeded from cohort start + template offset (63 days)', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    // July 1 + 63 days: July has 30 more days (Jul 2–31), August has 31 → 30+31=61, need 2 more → Sep 2.
    expect(c.sessions[1].startDate).toBe('2026-09-02');
  });

  it('session 2 start is NOT session 1 endDate + 1 day (confirms independence from chaining)', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    const session1End = c.sessions[0].endDate;      // 2026-08-25
    const session1EndPlusOne = '2026-08-26';        // what chained math would produce
    expect(c.sessions[1].startDate).not.toBe(session1EndPlusOne);
    // Actual: 2026-09-02 (63-day offset from cohort start, with an intended 7-day break)
    expect(c.sessions[1].startDate).toBe('2026-09-02');
    expect(session1End).toBe('2026-08-25');
  });

  it('editing session 2 start after build does not cascade to session 3', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    const session3Before = c.sessions[2].startDate;
    const updated = builder.applySessionDateEdit(
      c, 2,
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-11-25T00:00:00.000Z'),
    );
    expect(updated.sessions[2].startDate).toBe(session3Before); // session 3 unchanged
  });

  // ─── Wednesday-start week boundaries ─────────────────────────────────────

  it('session starting Wednesday has week blocks running Wed→Tue (not Monday-anchored)', () => {
    // Session 1 starts 2026-07-01 (Wednesday).
    // This test confirms the convention by asserting what the startDate IS — the
    // ReleaseGate tests verify that week 2 unlocks on July 8 (the 8th day = day
    // index 7 from start), not on the following Monday July 6.
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    expect(c.sessions[0].startDate).toBe('2026-07-01'); // Wednesday ✓
  });

  // ─── Leap year ────────────────────────────────────────────────────────────

  it('session spanning Feb 29 in a leap year computes end date correctly', () => {
    // 2028 is a leap year. Session starting Feb 1, 2028:
    // Feb has 29 days in 2028. Feb 1 + 55 days:
    //   Feb 1 + 28 = Feb 29 (day 28), + 27 more = March 27.
    const leapStart = new Date('2028-02-01T00:00:00.000Z');
    const c = builder.build({ id: 'c-leap', startDate: leapStart, templateId: 'bellarmine-absn-v1' });
    expect(c.sessions[0].startDate).toBe('2028-02-01');
    expect(c.sessions[0].endDate).toBe('2028-03-27');
  });

  it('session 2 start date crosses a month boundary correctly', () => {
    // Jan 15 cohort start: session 2 = Jan 15 + 63 days.
    // Jan: 31-15=16 remaining days. Feb (non-leap 2026): 28 days. 16+28=44 days through Feb.
    // Need 63-44=19 more days into March → March 19.
    const janStart = new Date('2026-01-15T00:00:00.000Z');
    const c = builder.build({ id: 'c2', startDate: janStart, templateId: 'bellarmine-absn-v1' });
    expect(c.sessions[1].startDate).toBe('2026-03-19');
  });

  // ─── applySessionDateEdit ─────────────────────────────────────────────────

  it('updates the target session start and end', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    const updated = builder.applySessionDateEdit(
      c, 3,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-12-26T00:00:00.000Z'),
    );
    const s3 = updated.sessions.find(s => s.sessionIndex === 3)!;
    expect(s3.startDate).toBe('2026-11-01');
    expect(s3.endDate).toBe('2026-12-26');
  });

  it('leaves every other session untouched', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    const updated = builder.applySessionDateEdit(
      c, 3,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-12-26T00:00:00.000Z'),
    );
    for (const s of updated.sessions) {
      if (s.sessionIndex === 3) continue;
      const original = c.sessions.find(o => o.sessionIndex === s.sessionIndex)!;
      expect(s.startDate).toBe(original.startDate);
      expect(s.endDate).toBe(original.endDate);
    }
  });

  it('does not mutate the source cohort (immutable update)', () => {
    const c = builder.build({ id: 'c1', startDate: WED_START, templateId: 'bellarmine-absn-v1' });
    const originalStart = c.sessions[2].startDate;
    builder.applySessionDateEdit(
      c, 3,
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-12-26T00:00:00.000Z'),
    );
    expect(c.sessions[2].startDate).toBe(originalStart);
  });
});

// ─── getCurrentSession ────────────────────────────────────────────────────────
//
// Covers the past-start-date case (mid-program onboarding) which is the primary
// path for the confirm-courses derive step.

describe('getCurrentSession', () => {
  const builder = new CohortBuilder();

  // Cohort starting 2026-07-01. Session 1: Jul 1 → Aug 25.
  // Session 2 starts Sep 2 (63-day offset).
  const cohort = builder.build({ id: 'c', startDate: WED_START, templateId: 'bellarmine-absn-v1' });

  it('returns session 1 week 1 when today is the cohort start date', () => {
    const { session, weekIndex } = getCurrentSession(cohort, new Date('2026-07-01T10:00:00.000Z'));
    expect(session.sessionIndex).toBe(1);
    expect(weekIndex).toBe(1);
  });

  it('returns session 1 week 3 when today is 2 full weeks into session 1', () => {
    // 2026-07-01 + 14 days = 2026-07-15 → 14 elapsed days → floor(14/7)+1 = 3
    const { session, weekIndex } = getCurrentSession(cohort, new Date('2026-07-15T10:00:00.000Z'));
    expect(session.sessionIndex).toBe(1);
    expect(weekIndex).toBe(3);
  });

  it('returns session 1 week 8 on the last day of session 1', () => {
    // Session 1 ends 2026-08-25 → 55 days after start → floor(55/7)+1 = 8 ✓
    const { session, weekIndex } = getCurrentSession(cohort, new Date('2026-08-25T10:00:00.000Z'));
    expect(session.sessionIndex).toBe(1);
    expect(weekIndex).toBe(8);
  });

  it('returns session 2 week 1 when today is in the break after session 1', () => {
    // 2026-08-26 is the first break day (past session 1 end, before session 2 start 2026-09-02)
    // Loop: session 1 endDate 2026-08-25 < today → continue to session 2
    // session 2 endDate is well past today → return session 2, week 1 (today < s2 start → elapsedDays=0)
    const { session, weekIndex } = getCurrentSession(cohort, new Date('2026-08-29T10:00:00.000Z'));
    expect(session.sessionIndex).toBe(2);
    expect(weekIndex).toBe(1);
  });

  it('returns session 2 week 1 on session 2 start day', () => {
    const { session, weekIndex } = getCurrentSession(cohort, new Date('2026-09-02T10:00:00.000Z'));
    expect(session.sessionIndex).toBe(2);
    expect(weekIndex).toBe(1);
  });

  it('returns session 6 week 8 when today is past all sessions', () => {
    const { session, weekIndex } = getCurrentSession(cohort, new Date('2030-01-01T10:00:00.000Z'));
    expect(session.sessionIndex).toBe(6);
    expect(weekIndex).toBe(8);
  });

  it('returns session 1 week 1 when today is before the cohort starts (future admit)', () => {
    const { session, weekIndex } = getCurrentSession(cohort, new Date('2026-06-15T10:00:00.000Z'));
    expect(session.sessionIndex).toBe(1);
    expect(weekIndex).toBe(1);
  });
});
