import { useState, useCallback } from 'react';
import { uuidv7 } from 'uuidv7';
import type {
  DateBoundaryConfig,
  FirstReviewTransaction,
  IRelearningPipeline,
  ISchedulerService,
  ItemMemoryState,
  QueueEntry,
  Rating,
  ReviewEvent,
} from '../domain/types';
import { DEFAULT_DAY_BOUNDARY } from '../domain/types';
import type { ItemMemoryStateRepository } from '../db/repositories/ItemMemoryStateRepository';
import type { ReviewEventRepository } from '../db/repositories/ReviewEventRepository';

// Amendment (d): exam mode raises desiredRetention to 0.95; daily uses 0.90 baseline.
// Without this wiring, exam compression adjusts candidate selection but not intervals.
const EXAM_RETENTION = 0.95;
const BASELINE_RETENTION = 0.90;

// ─── Rating deps ──────────────────────────────────────────────────────────────

export interface RatingDeps {
  entry: QueueEntry;
  rating: Rating;
  reviewedAt: Date;
  latencyMs: number;
  scheduler: ISchedulerService;
  relearningPipeline: IRelearningPipeline;
  memStateRepo: ItemMemoryStateRepository;
  reviewEventRepo: ReviewEventRepository;
  boundaryConfig?: DateBoundaryConfig;
}

// ─── Pure rating function (tested directly) ───────────────────────────────────

/**
 * Processes one rating:
 *  - Computes next FSRS state via SchedulerService using retention appropriate
 *    for the entry's mode (exam=0.95, daily/drill=0.90).
 *  - Advances the relearning streak via RelearningPipeline.
 *  - For kind='new': atomic first-review transaction (INSERT event + INSERT state).
 *  - For kind='review': append event + UPDATE state (two separate writes).
 *
 * Returns the updated ItemMemoryState so callers can read scheduledDays etc.
 * without a second DB fetch.
 */
export async function processRating(deps: RatingDeps): Promise<ItemMemoryState> {
  const {
    entry,
    rating,
    reviewedAt,
    latencyMs,
    scheduler,
    relearningPipeline,
    memStateRepo,
    reviewEventRepo,
    boundaryConfig = DEFAULT_DAY_BOUNDARY,
  } = deps;

  const { item } = entry;
  const desiredRetention = entry.mode === 'exam' ? EXAM_RETENTION : BASELINE_RETENTION;

  // Extract pre-review FSRS state — synthetic for new items, persisted for reviews.
  const currentFsrs = entry.kind === 'review'
    ? entry.memoryState.fsrs
    : entry.syntheticState.fsrs;
  const currentStreak = entry.kind === 'review' ? entry.memoryState.relearnStreak : 0;
  const currentGraduated = entry.kind === 'review' ? entry.memoryState.graduated : false;
  const currentLqd = entry.kind === 'review' ? entry.memoryState.lastQualifyingDate : null;

  const { nextState } = scheduler.schedule(currentFsrs, rating, reviewedAt, desiredRetention);

  const relearn = relearningPipeline.processRating({
    currentStreak,
    graduated: currentGraduated,
    rating,
    reviewDate: reviewedAt,
    lastQualifyingDate: currentLqd,
    boundaryConfig,
  });

  const updatedAt = reviewedAt.toISOString();
  const nextMemState: ItemMemoryState = {
    itemId: item.id,
    fsrs: nextState,
    relearnStreak: relearn.streak,
    graduated: relearn.graduated,
    lastQualifyingDate: relearn.lastQualifyingDate,
    updatedAt,
  };

  // Pre-review snapshot: synthetic state values for kind='new', real values for kind='review'.
  // Per the ReviewEvent spec, kind='new' records synthetic values (not nulls) so the log
  // is self-describing and replay tools need no special-casing.
  const event: ReviewEvent = {
    id: uuidv7(),
    itemId: item.id,
    ts: updatedAt,
    rating,
    latencyMs,
    mode: entry.mode,
    stabilityBefore: currentFsrs.stability,
    difficultyBefore: currentFsrs.difficulty,
    dueBefore: currentFsrs.due,
  };

  if (entry.kind === 'new') {
    const tx: FirstReviewTransaction = { event, initialMemoryState: nextMemState };
    await reviewEventRepo.recordFirstReview(tx);
  } else {
    await reviewEventRepo.append(event);
    await memStateRepo.update(nextMemState);
  }

  return nextMemState;
}

// ─── React hook ───────────────────────────────────────────────────────────────

export interface UseReviewSessionDeps {
  queue: QueueEntry[];
  scheduler: ISchedulerService;
  relearningPipeline: IRelearningPipeline;
  memStateRepo: ItemMemoryStateRepository;
  reviewEventRepo: ReviewEventRepository;
  boundaryConfig?: DateBoundaryConfig;
  onComplete?: () => void;
}

export interface UseReviewSessionResult {
  currentIndex: number;
  currentEntry: QueueEntry | undefined;
  rate: (rating: Rating, latencyMs: number) => Promise<void>;
  advance: () => void;
  isComplete: boolean;
}

export function useReviewSession(deps: UseReviewSessionDeps): UseReviewSessionResult {
  const {
    queue,
    scheduler,
    relearningPipeline,
    memStateRepo,
    reviewEventRepo,
    boundaryConfig = DEFAULT_DAY_BOUNDARY,
    onComplete,
  } = deps;

  const [currentIndex, setCurrentIndex] = useState(0);

  const currentEntry = queue[currentIndex];
  const isComplete = currentIndex >= queue.length;

  const rate = useCallback(async (rating: Rating, latencyMs: number) => {
    if (!currentEntry) return;
    await processRating({
      entry: currentEntry,
      rating,
      reviewedAt: new Date(),
      latencyMs,
      scheduler,
      relearningPipeline,
      memStateRepo,
      reviewEventRepo,
      boundaryConfig,
    });
    setCurrentIndex(i => {
      const next = i + 1;
      if (next >= queue.length) onComplete?.();
      return next;
    });
  }, [
    currentEntry, scheduler, relearningPipeline, memStateRepo,
    reviewEventRepo, boundaryConfig, queue.length, onComplete,
  ]);

  const advance = useCallback(() => {
    setCurrentIndex(i => Math.min(i + 1, queue.length));
  }, [queue.length]);

  return { currentIndex, currentEntry, rate, advance, isComplete };
}
