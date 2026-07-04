import type { Cohort, ContentItem, IReleaseGate, ReleaseGateStatus } from '../types';
import { toDateStr } from './CohortBuilder';

export class ReleaseGate implements IReleaseGate {
  check(item: ContentItem, cohort: Cohort, now: Date): ReleaseGateStatus {
    // Gate math uses calendar-day resolution (UTC midnight), not study days (4am boundary).
    // Content unlock boundaries are week-level — the 4am cutoff has no business here.
    // A student at 2am on Session 2's first day is a curiosity the gate doesn't need to resolve.
    const nowStr = toDateStr(now);
    const currentSessionIdx = currentSession(cohort, nowStr);

    if (currentSessionIdx === 0) return 'locked'; // cohort hasn't started yet

    const itemSession = item.releaseGate.sessionIndex;

    if (itemSession > currentSessionIdx + 1) return 'locked';
    if (itemSession === currentSessionIdx + 1) return 'pull-ahead-available';
    if (itemSession < currentSessionIdx) return 'unlocked'; // past session — fully available

    // itemSession === currentSessionIdx: check week within the session.
    const session = cohort.sessions.find(s => s.sessionIndex === currentSessionIdx);
    if (!session) return 'locked'; // data integrity guard

    // Week 1 starts on session.startDate. Weeks are 7-day blocks from there —
    // NOT ISO calendar weeks, NOT Monday-anchored. A session starting Wednesday
    // has weeks running Wednesday → Tuesday. This matches the releaseGate.week
    // values seeded at content authoring time.
    const daysSinceStart = diffCalendarDays(session.startDate, nowStr);
    const weekWithinSession = Math.floor(daysSinceStart / 7) + 1;
    return weekWithinSession >= item.releaseGate.week ? 'unlocked' : 'locked';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the highest sessionIndex whose startDate ≤ nowStr, or 0 if none has started.
 * During a gap period (between sessions) this returns the most-recently-started session,
 * making items from the next session 'pull-ahead-available'.
 */
function currentSession(cohort: Cohort, nowStr: string): number {
  let idx = 0;
  for (const s of cohort.sessions) {
    if (s.startDate <= nowStr && s.sessionIndex > idx) idx = s.sessionIndex;
  }
  return idx;
}

function diffCalendarDays(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / (24 * 60 * 60 * 1000),
  );
}
