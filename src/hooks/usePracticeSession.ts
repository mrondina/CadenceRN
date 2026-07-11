import { useState, useCallback } from 'react';
import type { ContentItem, Pillar } from '../domain/types';
import type { ContentItemRepository } from '../db/repositories/ContentItemRepository';
import { shuffleWithSeed } from '../utils/seededRng';

export const PRACTICE_SESSION_SIZE = 12;
export const PRACTICE_FREE_RECALL_CAP = 3;

export interface PracticeScope {
  packId: string;
  week?: number;    // undefined = all weeks in the pack
  pillar?: Pillar;
}

// ─── Pure selection function (tested directly) ────────────────────────────────

/**
 * Fetches items for the given scope, shuffles with a fresh seed, applies the
 * free-recall cap as a selection constraint, and returns at most
 * PRACTICE_SESSION_SIZE items.
 *
 * No write-capable dependency — this function structurally cannot persist
 * anything. It is the only data-access entry point for practice mode.
 *
 * Free-recall cap: Evidence note 3 — free recall has disproportionate cognitive
 * cost. Cap at PRACTICE_FREE_RECALL_CAP even when the student chose the scope,
 * filling the remainder from other formats. A practice draw of 8 free-recalls
 * would defeat "short focused." The cap is a selection constraint here, not a
 * queue filter (nothing is scheduled).
 *
 * seed defaults to Date.now() — fresh per launch, app-layer only. No domain
 * purity issue: Math.random() is banned in src/domain/; Date.now() in a hook
 * is fine and matches the study-day shuffle pattern in useQueue.
 */
export async function computePracticeItems(
  contentItemRepo: ContentItemRepository,
  scope: PracticeScope,
  seed: number = Date.now(),
): Promise<ContentItem[]> {
  const all = await contentItemRepo.findByPackAndWeek(scope.packId, scope.week, scope.pillar);

  // Exclude Phase 2 sequence items (same rule as QueueBuilder).
  const eligible = all.filter(i => i.format !== 'sequence');

  const shuffled = shuffleWithSeed(eligible, seed);

  // Greedy selection: preserve shuffled order, cap free_recall at
  // PRACTICE_FREE_RECALL_CAP while filling other formats up to session size.
  const selected: ContentItem[] = [];
  let frCount = 0;
  for (const item of shuffled) {
    if (selected.length >= PRACTICE_SESSION_SIZE) break;
    if (item.format === 'free_recall') {
      if (frCount < PRACTICE_FREE_RECALL_CAP) {
        selected.push(item);
        frCount++;
      }
      // else skip — cap reached; remaining slots filled by other formats
    } else {
      selected.push(item);
    }
  }
  return selected;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePracticeSessionResult {
  items: ContentItem[];
  currentIndex: number;
  currentItem: ContentItem | undefined;
  isComplete: boolean;
  loading: boolean;
  error: string | null;
  next: () => void;
  load: (scope: PracticeScope) => void;
}

export function usePracticeSession(
  contentItemRepo: ContentItemRepository,
): UsePracticeSessionResult {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((scope: PracticeScope) => {
    setLoading(true);
    setError(null);
    setCurrentIndex(0);
    computePracticeItems(contentItemRepo, scope)
      .then(selected => {
        setItems(selected);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load practice items');
        setLoading(false);
      });
  }, [contentItemRepo]);

  const next = useCallback(() => {
    setCurrentIndex(i => i + 1);
  }, []);

  return {
    items,
    currentIndex,
    currentItem: items[currentIndex],
    isComplete: !loading && items.length > 0 && currentIndex >= items.length,
    loading,
    error,
    next,
    load,
  };
}
