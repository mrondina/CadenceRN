import type {
  ContentItem,
  IQueueBuilder,
  ISchedulerService,
  ItemMemoryState,
  QueueEntry,
  ReviewMode,
  SyntheticItemState,
} from '../types';
import { ChainGate } from '../cohort/ChainGate';

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
    allKnownStates: ItemMemoryState[];
  }): QueueEntry[] {
    const { dueStates, examCandidates, allItems, newItems, newItemCap, now, allKnownStates } = params;

    // Build ChainGate from all known content items so the predecessor/successor
    // index is complete. For the current all-standalone content set this is a
    // no-op index (zero rampChain links); check() fast-paths every item.
    const chainGate = new ChainGate(allItems.values());
    const allStatesMap = new Map<string, ItemMemoryState>(
      allKnownStates.map(s => [s.itemId, s]),
    );

    // 1. Merge due reviews + exam candidates into one review pool.
    //    Exam mode wins on dual membership — the analytics label is more informative,
    //    and the mode tag is what routes the event to the correct FSRS parameters.
    //    Filter retired items BEFORE merging — a retired tier-N must not resurface
    //    via the due set even if its fsrs.due <= now.
    const activeDue = dueStates.filter(s => {
      const item = allItems.get(s.itemId);
      return item ? chainGate.check(item, allStatesMap) !== 'retired' : true;
    });
    const activeExamCandidates = examCandidates.filter(s => {
      const item = allItems.get(s.itemId);
      return item ? chainGate.check(item, allStatesMap) !== 'retired' : true;
    });
    const reviewPool = buildReviewPool(activeDue, activeExamCandidates, allItems);

    // 2. Exclude sequence-format items from the review pool (Phase 2, Procedures).
    const filteredReview = reviewPool.filter(e => e.item.format !== 'sequence');

    // 3. Select new items: exclude sequences and locked chain tiers, sort by
    //    curriculum order, apply cap.
    //    Sort is deterministic: (sessionIndex, week, id) preserves teaching sequence
    //    and tie-breaks stably so "which 20 of 40" is not a Map-iteration accident.
    const selectedNew = newItems
      .filter(item => item.format !== 'sequence')
      .filter(item => chainGate.check(item, allStatesMap) !== 'locked')
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
 * Generic deterministic accumulated-credit interleaver over pre-built buckets.
 * No Math.random — same input always produces the same output order.
 *
 * Algorithm (integer-scaled to avoid floating-point drift):
 *   weight[k] = bucket size at call time
 *   credit[k] starts equal to weight[k]
 *   Each step: select non-empty bucket with highest credit (alphabetical key
 *   tie-break); then all credits += weight; selected credit -= total.
 *
 * Mutates the arrays inside `buckets` (shift). Pass a fresh Map each call.
 */
function interleaveBuckets<T>(buckets: Map<string, T[]>): T[] {
  const total = [...buckets.values()].reduce((s, b) => s + b.length, 0);
  if (total === 0) return [];

  const keys = [...buckets.keys()].sort();
  const weights: Record<string, number> = {};
  const credits: Record<string, number> = {};
  for (const k of keys) {
    weights[k] = buckets.get(k)!.length;
    credits[k] = weights[k];
  }

  const result: T[] = [];
  while (result.length < total) {
    let best: string | null = null;
    for (const k of keys) {
      if ((buckets.get(k)?.length ?? 0) === 0) continue;
      if (best === null || credits[k] > credits[best]) best = k;
    }
    if (best === null) break;

    result.push(buckets.get(best)!.shift()!);
    for (const k of keys) credits[k] += weights[k];
    credits[best] -= total;
  }

  return result;
}

/**
 * Two-level interleaver: proportional by pillar, then within each pillar
 * proportional by contentPackId.
 *
 * Step 1 — bucket entries by pillar.
 * Step 2 — within each pillar, sub-bucket by contentPackId and run the
 *           accumulated-credit algorithm to produce a pack-interleaved sequence.
 * Step 3 — run the accumulated-credit algorithm across those pillar sequences.
 *
 * Deterministic, no Math.random. Same algorithm at both levels.
 */
function interleaveByPillar(entries: ReviewEntry[]): ReviewEntry[] {
  if (entries.length === 0) return [];

  // Step 1 — bucket by pillar
  const pillarBuckets = new Map<string, ReviewEntry[]>();
  for (const entry of entries) {
    const { pillar } = entry.item;
    if (!pillarBuckets.has(pillar)) pillarBuckets.set(pillar, []);
    pillarBuckets.get(pillar)!.push(entry);
  }

  // Step 2 — within each pillar, sub-interleave by contentPackId
  const pillarMixed = new Map<string, ReviewEntry[]>();
  for (const [pillar, pillarEntries] of pillarBuckets) {
    const packBuckets = new Map<string, ReviewEntry[]>();
    for (const entry of pillarEntries) {
      const pack = entry.item.contentPackId;
      if (!packBuckets.has(pack)) packBuckets.set(pack, []);
      packBuckets.get(pack)!.push(entry);
    }
    pillarMixed.set(pillar, interleaveBuckets(packBuckets));
  }

  // Step 3 — interleave across pillars
  return interleaveBuckets(pillarMixed);
}
