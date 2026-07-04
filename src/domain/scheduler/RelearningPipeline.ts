import { isSameStudyDay } from '../utils/DateBoundary';
import { RELEARN_GRADUATION_N } from '../types';
import type { DateBoundaryConfig, IRelearningPipeline, Rating, RelearningResult } from '../types';

/**
 * Tracks successive-relearning progress for one item.
 *
 * Graduation rules:
 *  - Again (1)    — resets streak to 0, sets graduated=false in ALL states,
 *                   including already-graduated items (PRD: lapsed items
 *                   re-enter the relearning pipeline automatically).
 *                   lastQualifyingDate is set to the lapse timestamp so the
 *                   first recovery review must be on a *different* study day,
 *                   enforcing "successive SPACED retrievals" not same-session retries.
 *  - Hard (2)     — neutral in all states. Never advances or resets streak,
 *                   never changes graduated.
 *  - Good/Easy (3/4) on an already-graduated item — no-op; item has already
 *                   completed the pipeline.
 *  - Good/Easy on an ungraduated item — advances streak only when reviewDate
 *                   is on a different study day than lastQualifyingDate.
 *                   Streak reaching RELEARN_GRADUATION_N sets graduated=true.
 */
export class RelearningPipeline implements IRelearningPipeline {
  processRating(params: {
    currentStreak: number;
    graduated: boolean;
    rating: Rating;
    reviewDate: Date;
    lastQualifyingDate: string | null;
    boundaryConfig: DateBoundaryConfig;
  }): RelearningResult {
    const { currentStreak, graduated, rating, reviewDate, lastQualifyingDate, boundaryConfig } = params;

    if (rating === 1) {
      // Again: reset pipeline regardless of current state.
      // Store the lapse timestamp as lastQualifyingDate so recovery reviews
      // must land on a different study day to count.
      return {
        streak: 0,
        graduated: false,
        lastQualifyingDate: reviewDate.toISOString(),
      };
    }

    if (rating === 2) {
      // Hard: neutral — no state changes.
      return { streak: currentStreak, graduated, lastQualifyingDate };
    }

    // Good (3) or Easy (4).

    if (graduated) {
      // Item has already completed the pipeline; no further tracking needed.
      return { streak: currentStreak, graduated: true, lastQualifyingDate };
    }

    // Check for same-study-day repeat — does not advance streak.
    if (
      lastQualifyingDate !== null &&
      isSameStudyDay(new Date(lastQualifyingDate), reviewDate, boundaryConfig)
    ) {
      return { streak: currentStreak, graduated: false, lastQualifyingDate };
    }

    // Qualifying retrieval: different study day (or no prior qualifying date).
    const newStreak = currentStreak + 1;
    return {
      streak: newStreak,
      graduated: newStreak >= RELEARN_GRADUATION_N,
      lastQualifyingDate: reviewDate.toISOString(),
    };
  }
}
