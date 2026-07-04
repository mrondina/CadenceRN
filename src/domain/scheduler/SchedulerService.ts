import {
  fsrs,
  createEmptyCard,
  State,
  type Card,
  type Grade,
  type FSRSParameters,
} from 'ts-fsrs';
import type { FsrsCardState, FsrsState, ISchedulerService, Rating, ScheduleResult } from '../types';

// ts-fsrs State enum → our FsrsState string union
const STATE_TO_STRING: Record<State, FsrsState> = {
  [State.New]:        'New',
  [State.Learning]:   'Learning',
  [State.Review]:     'Review',
  [State.Relearning]: 'Relearning',
};

const STRING_TO_STATE: Record<FsrsState, State> = {
  New:        State.New,
  Learning:   State.Learning,
  Review:     State.Review,
  Relearning: State.Relearning,
};

/**
 * Wraps ts-fsrs behind a stable interface so the algorithm is swappable
 * and parameters are injectable.
 *
 * enable_fuzz is ALWAYS false — determinism invariant. ts-fsrs 5.4.1
 * already defaults to false, but it is set explicitly here so the
 * determinism unit test catches any future upgrade that changes that default.
 */
export class SchedulerService implements ISchedulerService {
  // Cached instance used only for retrievability queries (no retention mutation).
  private readonly retriever = fsrs({ enable_fuzz: false });

  private readonly baseParams: Partial<FSRSParameters>;

  constructor(params: Partial<FSRSParameters> = {}) {
    this.baseParams = params;
  }

  schedule(
    current: FsrsCardState,
    rating: Rating,
    reviewedAt: Date,
    desiredRetention = 0.90,
  ): ScheduleResult {
    // Create a fresh instance per call so request_retention changes (e.g. exam
    // mode) never bleed into subsequent calls. FSRS construction is lightweight.
    const f = fsrs({
      ...this.baseParams,
      enable_fuzz: false,
      request_retention: desiredRetention,
    });

    const card = toTsFsrsCard(current);
    const result = f.next(card, reviewedAt, rating as unknown as Grade);
    const nextState = fromTsFsrsCard(result.card);

    // Retrievability at the newly scheduled due date (≈ desiredRetention for Review cards)
    const retrievability = this.retriever.get_retrievability(result.card, result.card.due, false);

    return { nextState, scheduledDays: result.card.scheduled_days, retrievability };
  }

  getRetrievability(state: FsrsCardState, now: Date): number {
    if (state.state === 'New') return 0;
    return this.retriever.get_retrievability(toTsFsrsCard(state), now, false);
  }

  predictRetrievability(state: FsrsCardState, at: Date): number {
    if (state.state === 'New') return 0;
    return this.retriever.get_retrievability(toTsFsrsCard(state), at, false);
  }

  createInitialState(itemId: string, now: Date): FsrsCardState {
    void itemId; // id is used by callers to associate the state; not needed here
    return fromTsFsrsCard(createEmptyCard(now));
  }
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

function toTsFsrsCard(state: FsrsCardState): Card {
  return {
    due:            new Date(state.due),
    stability:      state.stability,
    difficulty:     state.difficulty,
    elapsed_days:   state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps:           state.reps,
    lapses:         state.lapses,
    state:          STRING_TO_STATE[state.state],
    last_review:    state.lastReview ? new Date(state.lastReview) : undefined,
  };
}

function fromTsFsrsCard(card: Card): FsrsCardState {
  return {
    due:           card.due.toISOString(),
    stability:     card.stability,
    difficulty:    card.difficulty,
    elapsedDays:   card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps:          card.reps,
    lapses:        card.lapses,
    state:         STATE_TO_STRING[card.state],
    lastReview:    card.last_review?.toISOString(),
  };
}
