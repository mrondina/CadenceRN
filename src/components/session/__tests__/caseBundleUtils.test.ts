import { describe, it, expect } from 'vitest';
import type { QueueEntry } from '@/domain/types';
import {
  computeLogicalGroups,
  findCurrentGroup,
  isSubmitEnabled,
  buildCaseRowAnswers,
  parseCaseTemplate,
} from '../caseBundleUtils';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeStandaloneEntry(id: string): QueueEntry {
  return {
    kind: 'new',
    item: {
      id,
      pillar: 'concepts',
      format: 'cloze',
      difficultyTier: 1,
      body: { type: 'cloze', front: 'Q', back: 'A' },
      sourceCitation: 'test',
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 1 },
      contentPackId: 'pack-1',
      contentVersion: 1,
      placeholder: false,
      caseId: null,
      caseOrder: null,
    },
    syntheticState: {
      itemId: id,
      fsrs: { stability: 1, difficulty: 5, due: '2026-01-01T00:00:00Z', state: 'New',
              elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0 },
      relearnStreak: 0,
      graduated: false,
    },
    mode: 'daily',
  };
}

function makeCaseEntry(id: string, caseId: string, caseOrder: number, correctColumn = 0): QueueEntry {
  return {
    kind: 'new',
    item: {
      id,
      pillar: 'concepts',
      format: 'matrix_row',
      difficultyTier: 2,
      body: { type: 'matrix_row', rowLabel: `Row ${caseOrder}`, correctColumn, rationale: 'Test rationale' },
      sourceCitation: 'test',
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 1 },
      contentPackId: 'pack-1',
      contentVersion: 1,
      placeholder: false,
      caseId,
      caseOrder,
    },
    syntheticState: {
      itemId: id,
      fsrs: { stability: 1, difficulty: 5, due: '2026-01-01T00:00:00Z', state: 'New',
              elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0 },
      relearnStreak: 0,
      graduated: false,
    },
    mode: 'daily',
  };
}

function makeDropdownEntry(id: string, caseId: string, caseOrder: number, blankIndex: number): QueueEntry {
  return {
    kind: 'new',
    item: {
      id,
      pillar: 'concepts',
      format: 'dropdown_blank',
      difficultyTier: 2,
      body: {
        type: 'dropdown_blank',
        blankIndex,
        options: ['Option A', 'Option B', 'Option C'],
        correctIndex: 1,
        rationale: 'Option B is correct because…',
      },
      sourceCitation: 'test',
      lastReviewedAt: '2026-01-01',
      highAlert: false,
      graphLinks: [],
      releaseGate: { sessionIndex: 1, week: 1 },
      contentPackId: 'pack-1',
      contentVersion: 1,
      placeholder: false,
      caseId,
      caseOrder,
    },
    syntheticState: {
      itemId: id,
      fsrs: { stability: 1, difficulty: 5, due: '2026-01-01T00:00:00Z', state: 'New',
              elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0 },
      relearnStreak: 0,
      graduated: false,
    },
    mode: 'daily',
  };
}

// ─── computeLogicalGroups ─────────────────────────────────────────────────────

describe('computeLogicalGroups', () => {
  it('empty queue → empty groups', () => {
    expect(computeLogicalGroups([])).toEqual([]);
  });

  it('standalone-only queue → one group per entry', () => {
    const q = [makeStandaloneEntry('a'), makeStandaloneEntry('b'), makeStandaloneEntry('c')];
    const groups = computeLogicalGroups(q);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ kind: 'standalone', queueIndex: 0 });
    expect(groups[1]).toEqual({ kind: 'standalone', queueIndex: 1 });
    expect(groups[2]).toEqual({ kind: 'standalone', queueIndex: 2 });
  });

  it('case-only queue → one group for the bundle', () => {
    const q = [
      makeCaseEntry('r1', 'case-x', 1),
      makeCaseEntry('r2', 'case-x', 2),
      makeCaseEntry('r3', 'case-x', 3),
    ];
    const groups = computeLogicalGroups(q);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ kind: 'case', startIndex: 0, size: 3, caseId: 'case-x' });
  });

  it('mixed queue → standalones then one case group', () => {
    const q = [
      makeStandaloneEntry('s1'),
      makeStandaloneEntry('s2'),
      makeCaseEntry('r1', 'case-a', 1),
      makeCaseEntry('r2', 'case-a', 2),
    ];
    const groups = computeLogicalGroups(q);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ kind: 'standalone', queueIndex: 0 });
    expect(groups[1]).toEqual({ kind: 'standalone', queueIndex: 1 });
    expect(groups[2]).toEqual({ kind: 'case', startIndex: 2, size: 2, caseId: 'case-a' });
  });

  it('two case groups are separate logical positions', () => {
    const q = [
      makeCaseEntry('a1', 'case-a', 1),
      makeCaseEntry('a2', 'case-a', 2),
      makeCaseEntry('b1', 'case-b', 1),
      makeCaseEntry('b2', 'case-b', 2),
    ];
    const groups = computeLogicalGroups(q);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ kind: 'case', startIndex: 0, size: 2, caseId: 'case-a' });
    expect(groups[1]).toEqual({ kind: 'case', startIndex: 2, size: 2, caseId: 'case-b' });
  });
});

// ─── findCurrentGroup ─────────────────────────────────────────────────────────

describe('findCurrentGroup', () => {
  it('finds standalone group by exact queueIndex', () => {
    const q = [makeStandaloneEntry('a'), makeStandaloneEntry('b')];
    const groups = computeLogicalGroups(q);
    const result = findCurrentGroup(groups, 1);
    expect(result?.group).toEqual({ kind: 'standalone', queueIndex: 1 });
    expect(result?.logicalIndex).toBe(1);
  });

  it('finds case group by any row index within the bundle', () => {
    const q = [
      makeStandaloneEntry('s'),
      makeCaseEntry('r1', 'cx', 1),
      makeCaseEntry('r2', 'cx', 2),
      makeCaseEntry('r3', 'cx', 3),
    ];
    const groups = computeLogicalGroups(q);
    // All of queue indices 1, 2, 3 should resolve to the same case group at logicalIndex 1
    const r1 = findCurrentGroup(groups, 1);
    const r2 = findCurrentGroup(groups, 2);
    const r3 = findCurrentGroup(groups, 3);
    expect(r1?.group.kind).toBe('case');
    expect(r2?.group.kind).toBe('case');
    expect(r3?.group.kind).toBe('case');
    expect(r1?.logicalIndex).toBe(1);
    expect(r2?.logicalIndex).toBe(1);
    expect(r3?.logicalIndex).toBe(1);
  });

  it('returns null for an out-of-bounds currentIndex', () => {
    const q = [makeStandaloneEntry('a')];
    const groups = computeLogicalGroups(q);
    expect(findCurrentGroup(groups, 99)).toBeNull();
  });
});

// ─── isSubmitEnabled ──────────────────────────────────────────────────────────

describe('isSubmitEnabled', () => {
  it('empty array → false', () => {
    expect(isSubmitEnabled([])).toBe(false);
  });

  it('all null → false', () => {
    expect(isSubmitEnabled([null, null, null])).toBe(false);
  });

  it('partial selections → false', () => {
    expect(isSubmitEnabled([0, null, 1])).toBe(false);
  });

  it('all non-null → true', () => {
    expect(isSubmitEnabled([0, 1, 2])).toBe(true);
  });

  it('single non-null selection → true', () => {
    expect(isSubmitEnabled([2])).toBe(true);
  });

  it('selection of 0 is truthy (0 is a valid column index)', () => {
    expect(isSubmitEnabled([0, 0])).toBe(true);
  });
});

// ─── buildCaseRowAnswers ──────────────────────────────────────────────────────

describe('buildCaseRowAnswers', () => {
  it('matrix_row: correct when selection matches correctColumn', () => {
    const entry = makeCaseEntry('r1', 'cx', 1, /* correctColumn= */ 2);
    const answers = buildCaseRowAnswers([entry], [2]);
    expect(answers[0].correct).toBe(true);
    expect(answers[0].latencyMs).toBe(0);
  });

  it('matrix_row: incorrect when selection does not match correctColumn', () => {
    const entry = makeCaseEntry('r1', 'cx', 1, /* correctColumn= */ 2);
    const answers = buildCaseRowAnswers([entry], [0]);
    expect(answers[0].correct).toBe(false);
  });

  it('dropdown_blank: correct when selection matches correctIndex', () => {
    const entry = makeDropdownEntry('d1', 'cx', 1, 1);
    const answers = buildCaseRowAnswers([entry], [1]); // body.correctIndex = 1
    expect(answers[0].correct).toBe(true);
  });

  it('dropdown_blank: incorrect when selection does not match correctIndex', () => {
    const entry = makeDropdownEntry('d1', 'cx', 1, 1);
    const answers = buildCaseRowAnswers([entry], [0]);
    expect(answers[0].correct).toBe(false);
  });

  it('null selection (guard path) → incorrect', () => {
    const entry = makeCaseEntry('r1', 'cx', 1, 0);
    const answers = buildCaseRowAnswers([entry], [null]);
    expect(answers[0].correct).toBe(false);
  });

  it('preserves entry reference', () => {
    const entry = makeCaseEntry('r1', 'cx', 1, 0);
    const answers = buildCaseRowAnswers([entry], [0]);
    expect(answers[0].entry).toBe(entry);
  });

  it('multi-row: grades each row independently', () => {
    const e1 = makeCaseEntry('r1', 'cx', 1, /* correctColumn= */ 0);
    const e2 = makeCaseEntry('r2', 'cx', 2, /* correctColumn= */ 1);
    const e3 = makeCaseEntry('r3', 'cx', 3, /* correctColumn= */ 2);
    const answers = buildCaseRowAnswers([e1, e2, e3], [0, 0, 2]);
    expect(answers[0].correct).toBe(true);  // 0 === 0
    expect(answers[1].correct).toBe(false); // 0 !== 1
    expect(answers[2].correct).toBe(true);  // 2 === 2
  });
});

// ─── parseCaseTemplate ────────────────────────────────────────────────────────

describe('parseCaseTemplate', () => {
  it('plain text only → single text segment', () => {
    const segs = parseCaseTemplate('Hello world');
    expect(segs).toEqual([{ kind: 'text', value: 'Hello world' }]);
  });

  it('single blank → text + blank', () => {
    const segs = parseCaseTemplate('Risk for {{1}} complication');
    expect(segs).toEqual([
      { kind: 'text', value: 'Risk for ' },
      { kind: 'blank', index: 1 },
      { kind: 'text', value: ' complication' },
    ]);
  });

  it('multiple blanks → alternating text and blanks', () => {
    const segs = parseCaseTemplate('The patient has {{1}} and {{2}} symptoms');
    expect(segs).toEqual([
      { kind: 'text', value: 'The patient has ' },
      { kind: 'blank', index: 1 },
      { kind: 'text', value: ' and ' },
      { kind: 'blank', index: 2 },
      { kind: 'text', value: ' symptoms' },
    ]);
  });

  it('leading blank (no preceding text) → blank only, no empty text segment', () => {
    const segs = parseCaseTemplate('{{1}} is the answer');
    expect(segs).toEqual([
      { kind: 'blank', index: 1 },
      { kind: 'text', value: ' is the answer' },
    ]);
  });

  it('trailing blank (no following text) → no trailing empty text segment', () => {
    const segs = parseCaseTemplate('The answer is {{2}}');
    expect(segs).toEqual([
      { kind: 'text', value: 'The answer is ' },
      { kind: 'blank', index: 2 },
    ]);
  });

  it('blank index is parsed as integer', () => {
    const segs = parseCaseTemplate('{{10}}');
    expect(segs).toEqual([{ kind: 'blank', index: 10 }]);
  });
});
