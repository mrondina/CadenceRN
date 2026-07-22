import type { Rating } from '@/domain/types';

/**
 * Rating to write to FSRS for a standalone card.
 *
 * - Objective wrong (revealResult === false): forced Again (1). The answer was
 *   demonstrably wrong; the user has no rating choice.
 * - All other cases: the user's chosen rating passes through unchanged.
 */
export function resolveRating(revealResult: boolean | null, attempted: Rating): Rating {
  return revealResult === false ? 1 : attempted;
}

/**
 * Whether this card should increment the session's correct counter.
 *
 * - Objective correct (revealResult === true): always correct regardless of
 *   which FSRS rating the user chooses (they got the answer right).
 * - Self-graded (revealResult === null): correct when rating >= 3 (Good/Easy).
 * - Objective wrong (revealResult === false): never correct.
 */
export function isCorrectForAccuracy(revealResult: boolean | null, rating: Rating): boolean {
  if (revealResult === true) return true;
  if (revealResult === null) return rating >= 3;
  return false;
}
