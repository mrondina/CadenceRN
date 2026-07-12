import { useState, useEffect, useCallback } from 'react';
import type {
  Cohort,
  ContentItem,
  IExamModeCompressor,
  IQueueBuilder,
  ItemMemoryState,
  QueueEntry,
} from '../domain/types';
import type { ContentItemRepository } from '../db/repositories/ContentItemRepository';
import type { ItemMemoryStateRepository } from '../db/repositories/ItemMemoryStateRepository';
import { toDateStr } from '../domain/cohort/CohortBuilder';
import { fnv1a32, shuffleWithSeed } from '../utils/seededRng';

export const NEW_ITEM_CAP = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Queue deps ───────────────────────────────────────────────────────────────

export interface QueueDeps {
  now: Date;
  cohort: Cohort;
  contentItemRepo: ContentItemRepository;
  memStateRepo: ItemMemoryStateRepository;
  queueBuilder: IQueueBuilder;
  examCompressor: IExamModeCompressor;
  newItemCap?: number;
}

// ─── Pure composition function (tested directly) ──────────────────────────────

/**
 * Builds the session queue by composing ReleaseGate (via SQL gate params),
 * QueueBuilder, and ExamModeCompressor.
 *
 * Pull-ahead items: if a 'pull-ahead-available' item has an ItemMemoryState
 * with fsrs.due ≤ now (created when the user tapped "pull ahead"), it arrives
 * through dueStates and is treated as a kind='review' entry. It does NOT
 * consume a newItemCap slot — the cap only applies to genuinely new items.
 *
 * Exam candidates: computed for every active exam window across all courses.
 * Results are merged by itemId (exam mode wins on duplicates).
 */
export async function computeSessionQueue(deps: QueueDeps): Promise<QueueEntry[]> {
  const {
    now,
    cohort,
    contentItemRepo,
    memStateRepo,
    queueBuilder,
    examCompressor,
    newItemCap = NEW_ITEM_CAP,
  } = deps;

  const nowIso = now.toISOString();

  // 1. Load all memory states; split into due/not-due in memory.
  //    Shuffle dueStates by study-day seed so the same due set presents in a
  //    different order each day. Domain layer (buildQueue) stays pure and
  //    deterministic — it receives the (already shuffled) dueStates array and
  //    processes them identically regardless of order.
  const allMemStates = await memStateRepo.findAll();
  const memStateIds = new Set(allMemStates.map(s => s.itemId));
  const dueStates = shuffleWithSeed(
    allMemStates.filter(s => s.fsrs.due <= nowIso),
    fnv1a32(toDateStr(now)),
  );

  // 2. Unlocked new items — SQL gate handles session/week resolution.
  const { sessionIndex, week } = getGateParams(cohort, now);
  const unlockedItems = sessionIndex === 0
    ? []
    : await contentItemRepo.findUnlocked({ sessionIndex, week });
  const newItems = unlockedItems.filter(i => !memStateIds.has(i.id));

  // 3. Seed allItems map from unlocked items.
  //    Items in dueStates from past/future sessions not covered by findUnlocked
  //    (e.g. pull-ahead items) are fetched individually via findById below.
  const allItems = new Map<string, ContentItem>(unlockedItems.map(i => [i.id, i]));

  for (const state of dueStates) {
    if (!allItems.has(state.itemId)) {
      const item = await contentItemRepo.findById(state.itemId);
      if (item) allItems.set(item.id, item);
    }
  }

  // 4. Exam candidates — iterate every course in every session independently
  //    so that overlapping exam windows are each evaluated. Results are merged
  //    by itemId; the last writer wins (mode='exam' in all cases so order is
  //    irrelevant for deduplication correctness).
  const examCandidateMap = new Map<string, ItemMemoryState>();

  for (const session of cohort.sessions) {
    for (const course of session.courses) {
      const activeForCourse = examCompressor.getActiveExam([course], now);
      if (!activeForCourse) continue;

      const courseItemIds = new Set<string>();
      for (const packId of course.contentPackIds) {
        const packItems = await contentItemRepo.findByPack(packId);
        for (const item of packItems) {
          courseItemIds.add(item.id);
          if (!allItems.has(item.id)) allItems.set(item.id, item);
        }
      }

      const targetRetention = examCompressor.getRetention({
        courseId: course.id,
        examDates: course.examDates,
        now,
      });

      const candidates = examCompressor.getCandidates({
        states: allMemStates,
        courseItemIds,
        examDate: new Date(activeForCourse.examDate + 'T00:00:00.000Z'),
        now,
        targetRetention,
      });

      for (const c of candidates) {
        examCandidateMap.set(c.itemId, c);
      }
    }
  }

  const examCandidates = [...examCandidateMap.values()];

  // 5. Delegate to QueueBuilder for interleaving and cap enforcement.
  //    Pass allMemStates so ChainGate evaluates against the complete repository
  //    map — not merely the items that happen to be due or exam candidates today.
  return queueBuilder.buildQueue({
    dueStates,
    examCandidates,
    allItems,
    newItems,
    newItemCap,
    now,
    allKnownStates: allMemStates,
  });
}

// ─── Gate param helper ─────────────────────────────────────────────────────────

/**
 * Derives (sessionIndex, week) for ContentItemRepository.findUnlocked() from
 * the cohort's session dates and now. Uses the same calendar-day arithmetic as
 * ReleaseGate — UTC midnight, not the 4am study-day boundary (content unlock
 * is week-level; sub-day precision doesn't matter here).
 */
export function getGateParams(cohort: Cohort, now: Date): { sessionIndex: number; week: number } {
  const nowStr = toDateStr(now);
  let sessionIndex = 0;
  let sessionStartStr = '';

  for (const s of cohort.sessions) {
    if (s.startDate <= nowStr && s.sessionIndex > sessionIndex) {
      sessionIndex = s.sessionIndex;
      sessionStartStr = s.startDate;
    }
  }

  if (sessionIndex === 0) return { sessionIndex: 0, week: 0 };

  const [sy, sm, sd] = sessionStartStr.split('-').map(Number);
  const [ny, nm, nd] = nowStr.split('-').map(Number);
  const daysSinceStart = Math.round(
    (Date.UTC(ny, nm - 1, nd) - Date.UTC(sy, sm - 1, sd)) / MS_PER_DAY,
  );
  const week = Math.floor(daysSinceStart / 7) + 1;
  return { sessionIndex, week };
}

// ─── React hook ───────────────────────────────────────────────────────────────

export interface UseQueueResult {
  queue: QueueEntry[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useQueue(deps: Omit<QueueDeps, 'now'> & { now?: Date }): UseQueueResult {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const now = deps.now ?? new Date();
    computeSessionQueue({ ...deps, now })
      .then(q => {
        if (!cancelled) { setQueue(q); setLoading(false); }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { queue, loading, error, refresh };
}
