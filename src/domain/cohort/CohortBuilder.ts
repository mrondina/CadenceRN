import type { Cohort, ICohortBuilder, SessionInstance } from '../types';

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
