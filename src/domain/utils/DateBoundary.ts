import type { DateBoundaryConfig } from '../types';

/**
 * Returns the study-day ISO date string for a wall-clock Date, shifted by
 * the configured hour offset. Students who study past midnight (common in
 * this population) should not see phantom day-breaks or accidental
 * relearn-streak advances.
 *
 * Algorithm: subtract hourOffset hours from the timestamp, then read the
 * local calendar date. This is correct because Date.getTime() is UTC-based
 * arithmetic, while getFullYear/getMonth/getDate return local time — so the
 * local timezone offset (including DST) is already accounted for in the read.
 *
 * Example (hourOffset = 4):
 *   2026-07-04T02:30 local → shifted to 2026-07-03T22:30 local → '2026-07-03'
 *   2026-07-04T04:00 local → shifted to 2026-07-04T00:00 local → '2026-07-04'
 */
export function getStudyDay(date: Date, config: DateBoundaryConfig): string {
  const shifted = new Date(date.getTime() - config.hourOffset * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns true when two wall-clock dates belong to the same study day. */
export function isSameStudyDay(
  a: Date,
  b: Date,
  config: DateBoundaryConfig,
): boolean {
  return getStudyDay(a, config) === getStudyDay(b, config);
}

/**
 * Returns a Date representing midnight (00:00:00) of the next study day
 * boundary after `now`. Used by DebtForecaster to align bucket cutoffs.
 */
export function nextStudyDayStart(date: Date, config: DateBoundaryConfig): Date {
  const currentStudyDay = getStudyDay(date, config);
  // Start of the following calendar day + hourOffset = next study day boundary
  const [y, m, d] = currentStudyDay.split('-').map(Number);
  const nextCalendarDay = new Date(y, m - 1, d + 1); // local midnight of next day
  return new Date(nextCalendarDay.getTime() + config.hourOffset * 60 * 60 * 1000);
}
