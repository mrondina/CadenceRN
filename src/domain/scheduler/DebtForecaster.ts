import { getStudyDay } from '../utils/DateBoundary';
import type { DayForecast, ForecastParams, IDebtForecaster } from '../types';

export class DebtForecaster implements IDebtForecaster {
  forecast({
    states,
    now,
    days = 7,
    boundaryConfig,
    examCandidates = [],
    activeExam = null,
    excludeRetiredIds,
  }: ForecastParams): DayForecast[] {
    const studyDay0 = getStudyDay(now, boundaryConfig);
    const dayKeys = Array.from({ length: days }, (_, k) => addCalendarDays(studyDay0, k));

    // Count dues per study day. Anything due before or on today's study day
    // folds into day-0 — overdue items ARE today's debt and the forecaster
    // must make that visible. Items beyond the window are silently ignored.
    // Retired chain-tier items are excluded: their successor has taken over;
    // showing them in the forecast would double-count the obligation.
    const counts = new Map<string, number>(dayKeys.map(k => [k, 0]));
    for (const state of states) {
      if (excludeRetiredIds?.has(state.itemId)) continue;
      const dueDay = getStudyDay(new Date(state.fsrs.due), boundaryConfig);
      if (dueDay <= studyDay0) {
        counts.set(studyDay0, counts.get(studyDay0)! + 1);
      } else if (counts.has(dueDay)) {
        counts.set(dueDay, counts.get(dueDay)! + 1);
      }
    }

    // Exam candidates fold into day-0 only when a window is active.
    // They represent today's pull-ahead work, not a future obligation.
    if (examCandidates.length > 0 && activeExam !== null) {
      counts.set(studyDay0, counts.get(studyDay0)! + examCandidates.length);
    }

    // Warning threshold: a day is anomalous when its count exceeds 1.5× the
    // median across all forecast days (including the inflated day-0 when exam
    // candidates are present). Threshold is computed after folding so the spike
    // raises awareness even on the combined count.
    //
    // The absolute floor (WARNING_FLOOR) prevents false alarms during light
    // weeks where the median is 0: a brand-new user with 3 cards due Thursday
    // would otherwise see a red bar because 3 > 1.5 × 0. The floor keeps the
    // meter quiet until the load is materially heavy.
    const WARNING_FLOOR = 10;
    const allCounts = dayKeys.map(k => counts.get(k)!);
    const warningThreshold = 1.5 * median(allCounts);

    return dayKeys.map(dayStr => {
      const dueCount = counts.get(dayStr)!;
      return {
        date: dayStr,
        dueCount,
        isWarning: dueCount > warningThreshold && dueCount > WARNING_FLOOR,
        // isExamWindow: every day from today through the exam date (inclusive).
        // Uses YYYY-MM-DD string comparison, which is lexicographically correct.
        isExamWindow: activeExam !== null && dayStr <= activeExam.examDate,
      };
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Lower median for an odd-length array; mean of two middle values for even.
 * Returns 0 for an empty array so the warning threshold is 0, and 0 > 0
 * is false — no warnings on an empty forecast.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
