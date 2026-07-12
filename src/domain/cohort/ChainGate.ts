import type {
  ChainGateStatus,
  ContentItem,
  IChainGate,
  ItemMemoryState,
  RampChainLink,
} from '../types';
import { CHAIN_PROMOTION_STABILITY_DAYS } from '../types';

export class ChainGate implements IChainGate {
  // successorOf[id]   = rampChain targetId that `id` points to (id's successor)
  // predecessorOf[id] = the item that holds a rampChain link to `id` (id's predecessor)
  private readonly successorOf: Map<string, string> = new Map();
  private readonly predecessorOf: Map<string, string> = new Map();

  constructor(items: Iterable<ContentItem>) {
    for (const item of items) {
      for (const link of item.graphLinks) {
        if (isRampChainLink(link)) {
          this.successorOf.set(item.id, link.targetId);
          this.predecessorOf.set(link.targetId, item.id);
        }
      }
    }
  }

  check(item: ContentItem, allStates: Map<string, ItemMemoryState>): ChainGateStatus {
    // Fast path: standalone items (no rampTier) are always active.
    // This short-circuits before any map lookup for the all-standalone content set.
    if (!item.rampTier) return 'active';

    // Retired check: does this item have a successor that has been introduced?
    // A tier-N item retires the moment its tier-(N+1) appears in the state map,
    // regardless of whether tier-N is currently due.
    const successorId = this.successorOf.get(item.id);
    if (successorId !== undefined && allStates.has(successorId)) {
      return 'retired';
    }

    // Locked check: does this item have a predecessor that has not yet met the
    // promotion gate (graduated AND stability >= CHAIN_PROMOTION_STABILITY_DAYS)?
    // Note: if the predecessor has NO state at all it has never been introduced,
    // so this item is also locked (cannot admit tier-N+1 without tier-N).
    const predecessorId = this.predecessorOf.get(item.id);
    if (predecessorId !== undefined) {
      const predState = allStates.get(predecessorId);
      if (!predState || !isPromotionReady(predState)) {
        return 'locked';
      }
    }

    return 'active';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRampChainLink(link: unknown): link is RampChainLink {
  return typeof link === 'object' && link !== null && (link as RampChainLink).linkType === 'rampChain';
}

function isPromotionReady(state: ItemMemoryState): boolean {
  return state.graduated && state.fsrs.stability >= CHAIN_PROMOTION_STABILITY_DAYS;
}
