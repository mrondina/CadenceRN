import type { Cohort, ICohortBuilder, SessionInstance } from '../types';

// ─── Template course catalogue ────────────────────────────────────────────────

/** Default courses per session for the Bellarmine ABSN template. */
export const BELLARMINE_SESSION_COURSES: Record<number, { title: string; contentPackIds: string[] }[]> = {
  1: [
    { title: 'Health Assessment & Foundations', contentPackIds: ['foundations-pack'] },
    { title: 'Applied Pharmacology', contentPackIds: ['pharm-pack', 'dosage-pack'] },
    { title: 'Nursing Terminology', contentPackIds: ['terminology-pack'] },
  ],
  2: [{ title: 'Pathophysiology & Complex Care I', contentPackIds: [] }],
  3: [{ title: 'Complex Adult Care I', contentPackIds: [] }],
  4: [{ title: 'Psychiatric Mental Health & OB', contentPackIds: [] }],
  5: [{ title: 'Complex Adult Care II', contentPackIds: [] }],
  6: [{ title: 'NCLEX Runway', contentPackIds: [] }],
};

/** Flat list of all template courses — used by the add-course picker. */
export const ALL_TEMPLATE_COURSES: { title: string; contentPackIds: string[] }[] =
  Object.values(BELLARMINE_SESSION_COURSES).flat();

// ─── Template definitions ─────────────────────────────────────────────────────

interface SessionTemplate {
  sessionIndex: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  /** Calendar days from cohort startDate at which this session begins. */
  startDayOffset: number;
  durationWeeks: number;
}

interface CohortTemplate {
  sessions: SessionTemplate[];
}

// Bellarmine ABSN: 6 sessions of 8 weeks each, with 7-day breaks between.
// Actual dates are seeded from these offsets but owned per-session — the user
// confirms and adjusts each session in the setup wizard via applySessionDateEdit().
const TEMPLATES: Record<string, CohortTemplate> = {
  'bellarmine-absn-v1': {
    sessions: [
      { sessionIndex: 1, label: 'Session 1 (Summer A)',  startDayOffset: 0,   durationWeeks: 8 },
      { sessionIndex: 2, label: 'Session 2 (Fall A)',    startDayOffset: 63,  durationWeeks: 8 },
      { sessionIndex: 3, label: 'Session 3 (Fall B)',    startDayOffset: 126, durationWeeks: 8 },
      { sessionIndex: 4, label: 'Session 4 (Spring A)',  startDayOffset: 189, durationWeeks: 8 },
      { sessionIndex: 5, label: 'Session 5 (Spring B)',  startDayOffset: 252, durationWeeks: 8 },
      { sessionIndex: 6, label: 'Session 6 (Summer B)',  startDayOffset: 315, durationWeeks: 8 },
    ],
  },
};

// ─── Implementation ───────────────────────────────────────────────────────────

export class CohortBuilder implements ICohortBuilder {
  build(params: { id: string; startDate: Date; templateId: string }): Cohort {
    const { id, startDate, templateId } = params;
    const template = TEMPLATES[templateId];
    if (!template) throw new Error(`Unknown cohort template: "${templateId}"`);

    // Date arithmetic uses UTC calendar days (no 4am study-day boundary).
    // Content unlock is week-level — sub-day precision doesn't matter here.
    const startStr = toDateStr(startDate);
    const now = new Date().toISOString();

    const sessions: SessionInstance[] = template.sessions.map(t => {
      const sessionStart = addCalendarDays(startStr, t.startDayOffset);
      // endDate is inclusive: start + (7 × weeks) - 1 days.
      const sessionEnd = addCalendarDays(sessionStart, t.durationWeeks * 7 - 1);
      const sessionId = `${id}-s${t.sessionIndex}`;

      return {
        id: sessionId,
        cohortId: id,
        sessionIndex: t.sessionIndex,
        label: t.label,
        startDate: sessionStart,
        endDate: sessionEnd,
        courses: [],
        updatedAt: now,
      };
    });

    return { id, startDate: startStr, templateId, sessions, createdAt: now, updatedAt: now };
  }

  applySessionDateEdit(
    cohort: Cohort,
    sessionIndex: number,
    newStartDate: Date,
    newEndDate: Date,
  ): Cohort {
    // Each session owns its dates independently. Editing Session N does NOT
    // cascade to Sessions N+1…6. This preserves the setup wizard's contract:
    // the user confirms each session individually after the template seeds them.
    const now = new Date().toISOString();
    return {
      ...cohort,
      updatedAt: now,
      sessions: cohort.sessions.map(s =>
        s.sessionIndex === sessionIndex
          ? { ...s, startDate: toDateStr(newStartDate), endDate: toDateStr(newEndDate), updatedAt: now }
          : s,
      ),
    };
  }
}

// ─── Session / week derivation ────────────────────────────────────────────────

/**
 * Returns the session the student is currently in (or about to enter), plus
 * the 1-based week index within that session. Week 1 is returned for any date
 * before the session starts (future cohort start, or in a break before session N).
 */
export function getCurrentSession(
  cohort: Cohort,
  now: Date,
): { session: SessionInstance; weekIndex: number } {
  const todayStr = toDateStr(now);
  const sessions = cohort.sessions; // ordered 1→6 by builder

  for (const s of sessions) {
    if (todayStr <= s.endDate) {
      // today falls within this session, or this session hasn't ended yet
      return { session: s, weekIndex: sessionWeekIndex(s.startDate, todayStr) };
    }
  }

  // today is past all sessions — return session 6
  const last = sessions[sessions.length - 1];
  return { session: last, weekIndex: 8 };
}

function sessionWeekIndex(sessionStart: string, todayStr: string): number {
  const [sy, sm, sd] = sessionStart.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const elapsedDays = Math.max(
    0,
    Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / 86_400_000),
  );
  return Math.min(8, Math.floor(elapsedDays / 7) + 1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toDateStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    String(result.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
