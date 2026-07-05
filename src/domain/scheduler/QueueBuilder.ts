import type {
  ContentItem,
  IQueueBuilder,
  ISchedulerService,
  ItemMemoryState,
  QueueEntry,
  ReviewMode,
  SyntheticItemState,
} from '../types';

type ReviewEntry = {
  item: ContentItem;
  memoryState: ItemMemoryState;
  mode: ReviewMode;
};

/** Maximum free_recall entries allowed in a single session. */
export const FREE_RECALL_CAP = 3;

export class QueueBuilder implements IQueueBuilder {
  constructor(private readonly scheduler: ISchedulerService) {}

  buildQueue(params: {
    dueStates: ItemMemoryState[];
    examCandidates: ItemMemoryState[];
    allItems: Map<string, ContentItem>;
    newItems: ContentItem[];
    newItemCap: number;
    now: Date;
  }): QueueEntry[] {
    const { dueStates, examCandidates, allItems, newItems, newItemCap, now } = params;

    // 1. Merge due reviews + exam candidates into one review pool.
    //    Exam mode wins on dual membership — the analytics label is more informative,
    //    and the mode tag is what routes the event to the correct FSRS parameters.
    const reviewPool = buildReviewPool(dueStates, examCandidates, allItems);

    // 2. Exclude sequence-format items from the review pool (Phase 2, Procedures).
    const filteredReview = reviewPool.filter(e => e.item.format !== 'sequence');

    // 3. Select new items: exclude sequences, sort by curriculum order, apply cap.
    //    Sort is deterministic: (sessionIndex, week, id) preserves teaching sequence
    //    and tie-breaks stably so "which 20 of 40" is not a Map-iteration accident.
    const selectedNew = newItems
      .filter(item => item.format !== 'sequence')
      .sort(compareByReleaseGate)
      .slice(0, newItemCap);

    // 4. Interleave review pool by pillar — deterministic accumulated-credit algorithm,
    //    no Math.random. Queue-order variety is a future seeded-shuffle feature.
    const interleavedReview = interleaveByPillar(filteredReview);

    // 5. Assemble QueueEntry[] for reviews.
    const reviewEntries: QueueEntry[] = interleavedReview.map(({ item, memoryState, mode }) => ({
      kind: 'review',
      item,
      memoryState,
      mode,
    }));

    // 6. Assemble QueueEntry[] for new items.
    //    Synthesize in-memory initial state — nothing written to DB until first rating.
    const newEntries: QueueEntry[] = selectedNew.map(item => {
      const syntheticState: SyntheticItemState = {
        itemId: item.id,
        fsrs: this.scheduler.createInitialState(item.id, now),
        relearnStreak: 0,
        graduated: false,
      };
      return { kind: 'new', item, syntheticState, mode: 'daily' };
    });

    // 7. Apply per-session free_recall cap — cognitively expensive format.
    //    Reviews get priority (forgetting pressure); new items fill remaining slots.
    //    Excess free_recall entries stay due and surface in later sessions.
    //    Exam-mode entries are exempt: ExamModeCompressor selected them deliberately
    //    for a compressed review window; overriding that with the session cap would
    //    undermine the exam feature for high-value application items.
    let frUsed = 0;
    const cappedReviews = reviewEntries.filter(e => {
      if (e.item.format !== 'free_recall') return true;
      if (e.mode === 'exam') return true; // exam candidates bypass cap
      return frUsed++ < FREE_RECALL_CAP;
    });
    const cappedNew = newEntries.filter(e => {
      if (e.item.format !== 'free_recall') return true;
      return frUsed++ < FREE_RECALL_CAP;
    });

    return [...cappedReviews, ...cappedNew];
  }
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

/**
 * Build deduplicated review pool from dueStates + examCandidates.
 * exam mode wins when an item appears in both.
 * Items missing from allItems are skipped (data integrity guard).
 */
function buildReviewPool(
  dueStates: ItemMemoryState[],
  examCandidates: ItemMemoryState[],
  allItems: Map<string, ContentItem>,
): ReviewEntry[] {
  const pool = new Map<string, ReviewEntry>();

  for (const state of dueStates) {
    const item = allItems.get(state.itemId);
    if (!item) continue;
    pool.set(state.itemId, { item, memoryState: state, mode: 'daily' });
  }

  for (const state of examCandidates) {
    const item = allItems.get(state.itemId);
    if (!item) continue;
    // Overwrite unconditionally — exam mode wins over daily, even if item was
    // already present from dueStates (dual-membership dedup: one entry, mode='exam').
    pool.set(state.itemId, { item, memoryState: state, mode: 'exam' });
  }

  return [...pool.values()];
}

// ─── New-item sort ────────────────────────────────────────────────────────────

/**
 * Curriculum order: sessionIndex asc → week asc → id asc.
 * Stable, deterministic; tie-broken by id so Map iteration order is never the
 * deciding factor when unlocked items exceed the daily cap.
 */
function compareByReleaseGate(a: ContentItem, b: ContentItem): number {
  const si = a.releaseGate.sessionIndex - b.releaseGate.sessionIndex;
  if (si !== 0) return si;
  const w = a.releaseGate.week - b.releaseGate.week;
  if (w !== 0) return w;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ─── Pillar interleaver ───────────────────────────────────────────────────────

/**
 * Deterministic accumulated-credit interleaver. No Math.random — the output
 * for a given input is always identical, which the replay harness depends on.
 *
 * Algorithm (integer-scaled to avoid floating-point drift):
 *   weight[p] = bucket size
 *   credit[p] starts equal to weight[p]
 *   Each step: select non-empty pillar with highest credit (alphabetical tie-break);
 *   then all credits += weight; selected credit -= total.
 *
 * Properties:
 *   - Single-pillar input: round-robin over that one pillar, no loop risk.
 *   - Empty input: returns [] immediately.
 *   - Proportional: larger buckets contribute items across more rounds.
 *   - Within each pillar, items appear in arrival order.
 */
function interleaveByPillar(entries: ReviewEntry[]): ReviewEntry[] {
  if (entries.length === 0) return [];

  const buckets = new Map<string, ReviewEntry[]>();
  for (const entry of entries) {
    const { pillar } = entry.item;
    if (!buckets.has(pillar)) buckets.set(pillar, []);
    buckets.get(pillar)!.push(entry);
  }

  const total = entries.length;
  // Sort alphabetically → deterministic tie-breaking when credits are equal
  const pillars = [...buckets.keys()].sort();

  const weights: Record<string, number> = {};
  const credits: Record<string, number> = {};
  for (const p of pillars) {
    weights[p] = buckets.get(p)!.length;
    credits[p] = weights[p];
  }

  const result: ReviewEntry[] = [];
  while (result.length < total) {
    // Select non-empty pillar with highest credit.
    // Iterate sorted pillars and update best only on strict improvement →
    // first-encountered (alphabetically earliest) wins ties.
    let best: string | null = null;
    for (const p of pillars) {
      if ((buckets.get(p)?.length ?? 0) === 0) continue;
      if (best === null || credits[p] > credits[best]) best = p;
    }
    if (best === null) break;

    result.push(buckets.get(best)!.shift()!);
    for (const p of pillars) credits[p] += weights[p];
    credits[best] -= total;
  }

  return result;
}
