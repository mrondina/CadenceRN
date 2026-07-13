import type { QueueEntry } from '@/domain/types';
import type { CaseRowAnswer } from '@/hooks/useReviewSession';

// ─── Logical queue grouping ───────────────────────────────────────────────────

export type LogicalGroup =
  | { kind: 'standalone'; queueIndex: number }
  | { kind: 'case'; startIndex: number; size: number; caseId: string };

/**
 * Groups the flat queue into logical positions for progress display.
 * Standalone items (caseId === null) → one position each.
 * Case rows (shared caseId) → one position for the whole bundle.
 *
 * Contiguity invariant: QueueBuilder.buildCaseEntries exhausts all rows for one
 * caseId before the loop advances to the next caseId, and buildQueue appends the
 * entire caseEntries block after standalones. This function exploits that guarantee
 * by scanning forward while queue[i].item.caseId matches — it never needs to scan
 * backwards or across the full queue to find a case's extent.
 */
export function computeLogicalGroups(queue: QueueEntry[]): LogicalGroup[] {
  const groups: LogicalGroup[] = [];
  let i = 0;
  while (i < queue.length) {
    const caseId = queue[i].item.caseId;
    if (caseId !== null) {
      let j = i + 1;
      while (j < queue.length && queue[j].item.caseId === caseId) j++;
      groups.push({ kind: 'case', startIndex: i, size: j - i, caseId });
      i = j;
    } else {
      groups.push({ kind: 'standalone', queueIndex: i });
      i++;
    }
  }
  return groups;
}

export function findCurrentGroup(
  groups: LogicalGroup[],
  currentIndex: number,
): { group: LogicalGroup; logicalIndex: number } | null {
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    if (g.kind === 'standalone' && g.queueIndex === currentIndex) {
      return { group: g, logicalIndex: gi };
    }
    if (
      g.kind === 'case' &&
      currentIndex >= g.startIndex &&
      currentIndex < g.startIndex + g.size
    ) {
      return { group: g, logicalIndex: gi };
    }
  }
  return null;
}

// ─── Submit gating ────────────────────────────────────────────────────────────

/** True only when every row has a non-null selection. */
export function isSubmitEnabled(rowSelections: (number | null)[]): boolean {
  return rowSelections.length > 0 && rowSelections.every((s) => s !== null);
}

// ─── Row answer assembly ──────────────────────────────────────────────────────

/**
 * Builds CaseRowAnswer[] from entries + selections in entry order.
 * Entries are already in caseOrder (QueueBuilder invariant — see buildCaseEntries).
 * latencyMs is 0 for all rows — matches the standalone session path where
 * processRating is also called with latencyMs: 0.
 */
export function buildCaseRowAnswers(
  entries: QueueEntry[],
  rowSelections: (number | null)[],
): CaseRowAnswer[] {
  return entries.map((entry, i) => {
    const body = entry.item.body;
    const selection = rowSelections[i] ?? -1;
    let correct = false;
    if (body.type === 'matrix_row') {
      correct = selection === body.correctColumn;
    } else if (body.type === 'dropdown_blank') {
      correct = selection === body.correctIndex;
    }
    return { entry, correct, latencyMs: 0 };
  });
}

// ─── Template parsing ─────────────────────────────────────────────────────────

export type TemplateSegment =
  | { kind: 'text'; value: string }
  | { kind: 'blank'; index: number };

/**
 * Splits a dropdown_sentence template (e.g. "Risk for {{1}} due to {{2}}")
 * into alternating text and blank segments. Empty text segments are omitted.
 */
export function parseCaseTemplate(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  // split on {{n}} produces [text0, n1, text1, n2, text2, ...]
  const parts = template.split(/\{\{(\d+)\}\}/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i].length > 0) segments.push({ kind: 'text', value: parts[i] });
    } else {
      segments.push({ kind: 'blank', index: parseInt(parts[i], 10) });
    }
  }
  return segments;
}
