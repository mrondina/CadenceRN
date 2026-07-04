import type {
  ActiveExam,
  CourseInstance,
  IExamModeCompressor,
  ISchedulerService,
  ItemMemoryState,
} from '../types';

const EXAM_RETENTION = 0.95;
const BASELINE_RETENTION = 0.90;
const DEFAULT_WINDOW_DAYS = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class ExamModeCompressor implements IExamModeCompressor {
  constructor(private readonly scheduler: ISchedulerService) {}

  getRetention(params: {
    courseId: string;
    examDates: string[];
    now: Date;
    windowDays?: number;
  }): number {
    const { examDates, now, windowDays = DEFAULT_WINDOW_DAYS } = params;

    for (const dateStr of examDates) {
      const days = calendarDaysUntil(dateStr, now);
      if (days >= 0 && days <= windowDays) return EXAM_RETENTION;
    }
    return BASELINE_RETENTION;
  }

  getCandidates(params: {
    states: ItemMemoryState[];
    courseItemIds: Set<string>;
    examDate: Date;
    now: Date;
    targetRetention: number;
  }): ItemMemoryState[] {
    const { states, courseItemIds, examDate, targetRetention } = params;

    return states.filter(state => {
      if (!courseItemIds.has(state.itemId)) return false;
      // New state has no stability — no forgetting curve to evaluate.
      if (state.fsrs.state === 'New') return false;
      const predicted = this.scheduler.predictRetrievability(state.fsrs, examDate);
      return predicted < targetRetention;
    });
  }

  getActiveExam(
    courses: CourseInstance[],
    now: Date,
    windowDays: number = DEFAULT_WINDOW_DAYS,
  ): ActiveExam | null {
    let earliest: ActiveExam | null = null;

    for (const course of courses) {
      for (const dateStr of course.examDates) {
        const days = calendarDaysUntil(dateStr, now);
        if (days < 0 || days > windowDays) continue;
        // Prefer the soonest exam; break ties by courseId for determinism.
        if (
          earliest === null ||
          days < earliest.daysRemaining ||
          (days === earliest.daysRemaining && course.id < earliest.courseId)
        ) {
          earliest = {
            courseId: course.id,
            courseTitle: course.title,
            examDate: dateStr,
            daysRemaining: days,
          };
        }
      }
    }

    return earliest;
  }
}

/**
 * Integer calendar-day difference between an ISO date string and a moment.
 * Positive = future, negative = past, 0 = same UTC calendar day.
 *
 * Exam windows use calendar days (UTC midnight), not study days (4am boundary) —
 * intentional. A student at 1am crosses midnight into the next calendar day while
 * still inside the same study day; the ≤4h discrepancy at window edges is harmless
 * for coarse exam-window counts and avoids the complexity of mixing two clocks.
 */
function calendarDaysUntil(isoDateStr: string, now: Date): number {
  const examMs = new Date(isoDateStr + 'T00:00:00.000Z').getTime();
  const nowStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((examMs - nowStartMs) / MS_PER_DAY);
}
