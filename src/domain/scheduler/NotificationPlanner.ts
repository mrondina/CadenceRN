import type { ActiveExam, DayForecast, INotificationPlanner, ProposedReminder } from '../types';

/**
 * Phase 1 stub. Returns [] always.
 *
 * Phase 2 replaces the body with expo-notifications scheduling logic.
 * The interface (propose signature, ProposedReminder shape) is sealed —
 * callers are written against INotificationPlanner, not this class directly,
 * so the swap happens without touching any call site.
 */
export class NotificationPlanner implements INotificationPlanner {
  propose(
    _forecast: DayForecast[],
    _activeExams: ActiveExam[],
    _now: Date,
  ): ProposedReminder[] {
    return [];
  }
}
