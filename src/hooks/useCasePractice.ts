import { useState, useEffect, useCallback } from 'react';
import type { ContentCase, ContentItem } from '../domain/types';
import type { ContentCaseRepository } from '../db/repositories/ContentCaseRepository';
import type { ContentItemRepository } from '../db/repositories/ContentItemRepository';

// ─── Bundle type ──────────────────────────────────────────────────────────────

export interface CasePracticeBundle {
  caseData: ContentCase;
  rows: ContentItem[];  // sorted by case_order ASC (enforced by findByCaseId SQL)
}

// ─── Pure load function (tested directly) ─────────────────────────────────────

/**
 * Loads all ContentCase records and their ordered rows.
 * Bundles with zero rows are silently dropped — a rowless case is a data gap,
 * not a renderable state.
 *
 * No write-capable dependency — structurally cannot persist anything.
 */
export async function computeCasePracticeItems(
  caseRepo: ContentCaseRepository,
  itemRepo: ContentItemRepository,
): Promise<CasePracticeBundle[]> {
  const cases = await caseRepo.findAll();
  const bundles: CasePracticeBundle[] = [];
  for (const caseData of cases) {
    const rows = await itemRepo.findByCaseId(caseData.caseId);
    if (rows.length > 0) {
      bundles.push({ caseData, rows });
    }
  }
  return bundles;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCasePracticeResult {
  bundles: CasePracticeBundle[];
  loading: boolean;
  error: string | null;
}

export function useCasePractice(
  caseRepo: ContentCaseRepository,
  itemRepo: ContentItemRepository,
): UseCasePracticeResult {
  const [bundles, setBundles] = useState<CasePracticeBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    computeCasePracticeItems(caseRepo, itemRepo)
      .then(result => {
        setBundles(result);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load cases');
        setLoading(false);
      });
  }, [caseRepo, itemRepo]);

  // Load once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  return { bundles, loading, error };
}
