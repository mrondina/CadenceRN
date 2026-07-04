import { describe, it, expect } from 'vitest';
import { NotificationPlanner } from '../NotificationPlanner';
import type { ActiveExam, DayForecast, INotificationPlanner } from '../../types';

const NOW = new Date('2026-07-03T14:00:00.000Z');

const forecast: DayForecast[] = [
  { date: '2026-07-03', dueCount: 42, isWarning: true,  isExamWindow: true  },
  { date: '2026-07-04', dueCount: 5,  isWarning: false, isExamWindow: false },
];

const activeExam: ActiveExam = {
  courseId: 'pharm-101',
  courseTitle: 'Applied Pharmacology',
  examDate: '2026-07-07',
  daysRemaining: 4,
};

describe('NotificationPlanner (Phase 1 stub)', () => {
  // Typed as the interface, not the concrete class, to enforce the sealed contract:
  // Phase 2's replacement must satisfy INotificationPlanner unchanged.
  const planner: INotificationPlanner = new NotificationPlanner();

  it('returns [] with no forecast and no exams', () => {
    expect(planner.propose([], [], NOW)).toEqual([]);
  });

  it('returns [] when forecast has warning days', () => {
    expect(planner.propose(forecast, [], NOW)).toEqual([]);
  });

  it('returns [] when active exams are present', () => {
    expect(planner.propose([], [activeExam], NOW)).toEqual([]);
  });

  it('returns [] with both forecast and active exams', () => {
    expect(planner.propose(forecast, [activeExam], NOW)).toEqual([]);
  });

  it('return value is always an array (never null or undefined)', () => {
    const result = planner.propose(forecast, [activeExam], NOW);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});
