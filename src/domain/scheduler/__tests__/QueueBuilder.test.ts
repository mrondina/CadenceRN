import { describe, it, expect, beforeEach } from 'vitest';
import { QueueBuilder, FREE_RECALL_CAP } from '../QueueBuilder';
import { SchedulerService } from '../SchedulerService';
import type { ContentItem, ItemMemoryState, Pillar, QueueEntry } from '../../types';

// ─── Factories ────────────────────────────────────────────────────────────────

let idCounter = 0;

function makeItem(overrides: Partial<ContentItem> & { id?: string; pillar?: Pillar } = {}): ContentItem {
  const id = overrides.id ?? `item-${++idCounter}`;
  return {
    id,
    pillar: 'terminology',
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
    ...overrides,
  };
}

function makeState(itemId: string, overrides: Partial<ItemMemoryState> = {}): ItemMemoryState {
  return {
    itemId,
    fsrs: {
      stability: 10,
      difficulty: 5,
      due: '2026-07-01T10:00:00.000Z',
      state: 'Review',
      elapsedDays: 10,
      scheduledDays: 10,
      learningSteps: 0,
      reps: 5,
      lapses: 0,
    },
    relearnStreak: 0,
    graduated: false,
    lastQualifyingDate: null,
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

function itemsToMap(items: ContentItem[]): Map<string, ContentItem> {
  return new Map(items.map(i => [i.id, i]));
}

const NOW = new Date('2026-07-01T10:00:00.000Z');

const ids = (entries: QueueEntry[]): string[] => entries.map(e => e.item.id);
const modes = (entries: QueueEntry[]): string[] => entries.map(e => e.mode);
const kinds = (entries: QueueEntry[]): string[] => entries.map(e => e.kind);

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('QueueBuilder', () => {
  let builder: QueueBuilder;

  beforeEach(() => {
    idCounter = 0; // reset so each test gets deterministic item ids
    builder = new QueueBuilder(new SchedulerService());
  });

  const build = (params: {
    dueStates?: ItemMemoryState[];
    examCandidates?: ItemMemoryState[];
    allItems?: Map<string, ContentItem>;
    newItems?: ContentItem[];
    newItemCap?: number;
    allKnownStates?: ItemMemoryState[];
  }): QueueEntry[] =>
    builder.buildQueue({
      dueStates:      params.dueStates      ?? [],
      examCandidates: params.examCandidates ?? [],
      allItems:       params.allItems       ?? new Map(),
      newItems:       params.newItems       ?? [],
      newItemCap:     params.newItemCap     ?? 20,
      now:            NOW,
      allKnownStates: params.allKnownStates ?? params.dueStates ?? [],
    });

  // ─── Review pool merge ─────────────────────────────────────────────────────

  describe('review pool merge', () => {
    it('due-only item → mode=daily', () => {
      const item = makeItem();
      const state = makeState(item.id);
      const result = build({ dueStates: [state], allItems: itemsToMap([item]) });
      expect(result).toHaveLength(1);
      expect(result[0].mode).toBe('daily');
      expect(result[0].kind).toBe('review');
    });

    it('exam-candidate-only item → mode=exam', () => {
      const item = makeItem();
      const state = makeState(item.id);
      const result = build({ examCandidates: [state], allItems: itemsToMap([item]) });
      expect(result).toHaveLength(1);
      expect(result[0].mode).toBe('exam');
      expect(result[0].kind).toBe('review');
    });

    it('dual-membership: item in both dueStates and examCandidates → exactly one entry, mode=exam', () => {
      const item = makeItem();
      const dueState  = makeState(item.id);
      const examState = makeState(item.id);
      const result = build({
        dueStates:      [dueState],
        examCandidates: [examState],
        allItems:       itemsToMap([item]),
      });
      expect(result).toHaveLength(1);
      expect(result[0].mode).toBe('exam');
    });

    it('dual-membership: the surviving MemoryState is the examCandidates version', () => {
      const item = makeItem();
      const dueState  = makeState(item.id, { fsrs: { ...makeState(item.id).fsrs, reps: 3 } });
      const examState = makeState(item.id, { fsrs: { ...makeState(item.id).fsrs, reps: 7 } });
      const result = build({
        dueStates:      [dueState],
        examCandidates: [examState],
        allItems:       itemsToMap([item]),
      });
      expect(result[0].kind).toBe('review');
      if (result[0].kind === 'review') {
        expect(result[0].memoryState.fsrs.reps).toBe(7); // examCandidates version
      }
    });

    it('multiple items: some daily, some exam, one dual → correct modes', () => {
      const daily = makeItem({ id: 'd1' });
      const exam  = makeItem({ id: 'e1' });
      const both  = makeItem({ id: 'b1' });
      const result = build({
        dueStates:      [makeState(daily.id), makeState(both.id)],
        examCandidates: [makeState(exam.id),  makeState(both.id)],
        allItems:       itemsToMap([daily, exam, both]),
      });
      expect(result).toHaveLength(3);
      const modeById = Object.fromEntries(result.map(e => [e.item.id, e.mode]));
      expect(modeById['d1']).toBe('daily');
      expect(modeById['e1']).toBe('exam');
      expect(modeById['b1']).toBe('exam');
    });

    it('item missing from allItems is silently skipped', () => {
      const state = makeState('ghost-id');
      const result = build({ dueStates: [state], allItems: new Map() });
      expect(result).toHaveLength(0);
    });
  });

  // ─── Sequence format exclusion from all three streams ─────────────────────

  describe('sequence format exclusion (Phase 2)', () => {
    it('sequence item in dueStates is excluded', () => {
      const seq = makeItem({ format: 'sequence' });
      const result = build({ dueStates: [makeState(seq.id)], allItems: itemsToMap([seq]) });
      expect(result).toHaveLength(0);
    });

    it('sequence item in examCandidates is excluded', () => {
      const seq = makeItem({ format: 'sequence' });
      const result = build({ examCandidates: [makeState(seq.id)], allItems: itemsToMap([seq]) });
      expect(result).toHaveLength(0);
    });

    it('sequence item in newItems is excluded', () => {
      const seq = makeItem({ format: 'sequence' });
      const result = build({ newItems: [seq] });
      expect(result).toHaveLength(0);
    });

    it('sequence items in all three streams simultaneously — all excluded', () => {
      const seqDue  = makeItem({ id: 'seq-due',  format: 'sequence' });
      const seqExam = makeItem({ id: 'seq-exam', format: 'sequence' });
      const seqNew  = makeItem({ id: 'seq-new',  format: 'sequence' });
      const good    = makeItem({ id: 'good',     format: 'cloze' });
      const result = build({
        dueStates:      [makeState(seqDue.id)],
        examCandidates: [makeState(seqExam.id)],
        allItems:       itemsToMap([seqDue, seqExam, good]),
        newItems:       [seqNew, good],
      });
      // only the good cloze item appears (once as due review, once skipped as new duplicate
      // — actually good is a review since it's in dueStates via allItems, not in newItems)
      const returnedIds = ids(result);
      expect(returnedIds).not.toContain('seq-due');
      expect(returnedIds).not.toContain('seq-exam');
      expect(returnedIds).not.toContain('seq-new');
    });

    it('non-sequence formats are not excluded', () => {
      const formats = ['cloze', 'mcq', 'free_recall', 'numeric'] as const;
      for (const format of formats) {
        const item = makeItem({ format });
        const result = build({ newItems: [item] });
        expect(result).toHaveLength(1);
        idCounter = 0; // reset between sub-cases
      }
    });
  });

  // ─── New item selection and determinism ────────────────────────────────────

  describe('new item selection', () => {
    it('returns exactly newItemCap items when unlocked > cap', () => {
      const items = Array.from({ length: 40 }, (_, i) =>
        makeItem({ id: `new-${i}`, releaseGate: { sessionIndex: 1, week: 1 } }),
      );
      const result = build({ newItems: items, newItemCap: 20 });
      const newEntries = result.filter(e => e.kind === 'new');
      expect(newEntries).toHaveLength(20);
    });

    it('returns all items when unlocked < cap', () => {
      const items = [makeItem(), makeItem(), makeItem()];
      const result = build({ newItems: items, newItemCap: 20 });
      expect(result.filter(e => e.kind === 'new')).toHaveLength(3);
    });

    it('deterministic: same input produces same 20 items, twice', () => {
      const items = Array.from({ length: 40 }, (_, i) =>
        makeItem({ id: `stable-${String(i).padStart(3, '0')}`, releaseGate: { sessionIndex: 1, week: 1 } }),
      );
      const run1 = build({ newItems: items, newItemCap: 20 }).filter(e => e.kind === 'new');
      const run2 = build({ newItems: [...items], newItemCap: 20 }).filter(e => e.kind === 'new');
      expect(ids(run1)).toEqual(ids(run2));
    });

    it('sorts by curriculum order: sessionIndex asc → week asc → id asc', () => {
      // Four items across two sessions and two weeks, intentionally out of order
      const s2w2 = makeItem({ id: 'z-s2w2', releaseGate: { sessionIndex: 2, week: 2 } });
      const s1w2 = makeItem({ id: 'm-s1w2', releaseGate: { sessionIndex: 1, week: 2 } });
      const s1w1b = makeItem({ id: 'b-s1w1', releaseGate: { sessionIndex: 1, week: 1 } });
      const s1w1a = makeItem({ id: 'a-s1w1', releaseGate: { sessionIndex: 1, week: 1 } });

      const result = build({ newItems: [s2w2, s1w2, s1w1b, s1w1a], newItemCap: 4 });
      expect(ids(result)).toEqual(['a-s1w1', 'b-s1w1', 'm-s1w2', 'z-s2w2']);
    });

    it('newItemCap=0 → no new entries', () => {
      const items = [makeItem(), makeItem()];
      const result = build({ newItems: items, newItemCap: 0 });
      expect(result.filter(e => e.kind === 'new')).toHaveLength(0);
    });

    it('new entries carry kind=new and mode=daily', () => {
      const item = makeItem();
      const result = build({ newItems: [item], newItemCap: 1 });
      const entry = result[0];
      expect(entry.kind).toBe('new');
      expect(entry.mode).toBe('daily');
    });

    it('new entry carries a synthesized SyntheticItemState with state=New', () => {
      const item = makeItem();
      const result = build({ newItems: [item], newItemCap: 1 });
      expect(result[0].kind).toBe('new');
      if (result[0].kind === 'new') {
        expect(result[0].syntheticState.fsrs.state).toBe('New');
        expect(result[0].syntheticState.relearnStreak).toBe(0);
        expect(result[0].syntheticState.graduated).toBe(false);
      }
    });
  });

  // ─── Ordering: reviews before new items ───────────────────────────────────

  describe('output ordering', () => {
    it('reviews (daily + exam) appear before new items', () => {
      const dueItem  = makeItem({ id: 'due' });
      const examItem = makeItem({ id: 'exam' });
      const newItem  = makeItem({ id: 'new' });
      const result = build({
        dueStates:      [makeState(dueItem.id)],
        examCandidates: [makeState(examItem.id)],
        allItems:       itemsToMap([dueItem, examItem]),
        newItems:       [newItem],
        newItemCap:     1,
      });
      const firstNewIdx = result.findIndex(e => e.kind === 'new');
      const lastReviewIdx = result.reduce(
        (acc, e, i) => (e.kind === 'review' ? i : acc), -1,
      );
      expect(firstNewIdx).toBeGreaterThan(lastReviewIdx);
    });

    it('exam candidates are in the review pool, not appended after new items', () => {
      const examItem = makeItem({ id: 'exam', pillar: 'pharm' });
      const newItem  = makeItem({ id: 'new',  pillar: 'concepts' });
      const result = build({
        examCandidates: [makeState(examItem.id)],
        allItems:       itemsToMap([examItem]),
        newItems:       [newItem],
        newItemCap:     1,
      });
      // exam review should come before the new item
      const examIdx = result.findIndex(e => e.item.id === 'exam');
      const newIdx  = result.findIndex(e => e.item.id === 'new');
      expect(examIdx).toBeLessThan(newIdx);
    });
  });

  // ─── Interleaver ──────────────────────────────────────────────────────────

  describe('interleaver', () => {
    it('all-empty inputs → returns []', () => {
      expect(build({})).toEqual([]);
    });

    it('single-pillar pool → all items returned, no infinite loop', () => {
      const items = Array.from({ length: 10 }, () => makeItem({ pillar: 'pharm' }));
      const states = items.map(i => makeState(i.id));
      const result = build({ dueStates: states, allItems: itemsToMap(items) });
      expect(result).toHaveLength(10);
      expect(result.every(e => e.item.pillar === 'pharm')).toBe(true);
    });

    it('single-item pool → returns that one item', () => {
      const item = makeItem({ pillar: 'concepts' });
      const result = build({ dueStates: [makeState(item.id)], allItems: itemsToMap([item]) });
      expect(result).toHaveLength(1);
      expect(result[0].item.id).toBe(item.id);
    });

    it('deterministic: same inputs → identical output order, twice', () => {
      const pharms = Array.from({ length: 5 }, () => makeItem({ pillar: 'pharm' }));
      const terms  = Array.from({ length: 3 }, () => makeItem({ pillar: 'terminology' }));
      const concs  = Array.from({ length: 2 }, () => makeItem({ pillar: 'concepts' }));
      const all = [...pharms, ...terms, ...concs];
      const states = all.map(i => makeState(i.id));
      const map = itemsToMap(all);

      const run1 = build({ dueStates: states, allItems: map });
      const run2 = build({ dueStates: [...states], allItems: new Map(map) });
      expect(ids(run1)).toEqual(ids(run2));
    });

    it('multi-pillar: all items appear exactly once', () => {
      const pharms = Array.from({ length: 5 }, () => makeItem({ pillar: 'pharm' }));
      const terms  = Array.from({ length: 3 }, () => makeItem({ pillar: 'terminology' }));
      const concs  = Array.from({ length: 2 }, () => makeItem({ pillar: 'concepts' }));
      const all = [...pharms, ...terms, ...concs];
      const states = all.map(i => makeState(i.id));
      const result = build({ dueStates: states, allItems: itemsToMap(all) });

      expect(result).toHaveLength(10);
      const idSet = new Set(ids(result));
      expect(idSet.size).toBe(10);
    });

    it('multi-pillar: no consecutive run exceeds the largest bucket size', () => {
      // 5 pharm, 3 terminology, 2 concepts
      // The interleaver should break up runs: worst case is the largest bucket
      // never appears more times consecutively than ⌈bucket/smallest_bucket⌉
      // — this test uses the loose bound of "no run of 5 same-pillar cards"
      const pharms = Array.from({ length: 5 }, () => makeItem({ pillar: 'pharm' }));
      const terms  = Array.from({ length: 3 }, () => makeItem({ pillar: 'terminology' }));
      const concs  = Array.from({ length: 2 }, () => makeItem({ pillar: 'concepts' }));
      const all = [...pharms, ...terms, ...concs];
      const result = build({ dueStates: all.map(i => makeState(i.id)), allItems: itemsToMap(all) });

      let maxRun = 1, run = 1;
      for (let i = 1; i < result.length; i++) {
        if (result[i].item.pillar === result[i - 1].item.pillar) {
          run++;
          maxRun = Math.max(maxRun, run);
        } else {
          run = 1;
        }
      }
      // With accumulated-credit interleaving on 5:3:2, no run should be ≥ 5
      expect(maxRun).toBeLessThan(5);
    });

    it('two equal-sized pillars alternate', () => {
      const pharms = Array.from({ length: 3 }, (_, i) => makeItem({ id: `p${i}`, pillar: 'pharm' }));
      const terms  = Array.from({ length: 3 }, (_, i) => makeItem({ id: `t${i}`, pillar: 'terminology' }));
      const all = [...pharms, ...terms];
      const result = build({ dueStates: all.map(i => makeState(i.id)), allItems: itemsToMap(all) });

      // With equal weights, pillars should alternate (or near-alternate)
      const pillars = result.map(e => e.item.pillar);
      let maxRun = 1, run = 1;
      for (let i = 1; i < pillars.length; i++) {
        run = pillars[i] === pillars[i - 1] ? run + 1 : 1;
        maxRun = Math.max(maxRun, run);
      }
      expect(maxRun).toBe(1); // perfect alternation for equal buckets
    });

    it('mono-pillar with three equal packs: no contiguous same-pack run > 1', () => {
      // 6 items each from three packs, all same pillar.
      // Equal-size packs → accumulated-credit round-robins perfectly:
      // no two consecutive entries from the same pack.
      const packs = ['alpha-pack', 'beta-pack', 'gamma-pack'];
      const all = packs.flatMap(packId =>
        Array.from({ length: 6 }, (_, i) =>
          makeItem({ id: `${packId}-${i}`, pillar: 'concepts', contentPackId: packId }),
        ),
      );
      const result = build({ dueStates: all.map(i => makeState(i.id)), allItems: itemsToMap(all) });

      expect(result).toHaveLength(18);

      let maxRun = 1, run = 1;
      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1].item.contentPackId;
        const curr = result[i].item.contentPackId;
        run = curr === prev ? run + 1 : 1;
        maxRun = Math.max(maxRun, run);
      }
      expect(maxRun).toBe(1);
    });

    it('mono-pillar with three unequal packs: maxRun is exactly 2', () => {
      // packA=6, packB=3, packC=1 — total 10, all same pillar.
      // Traced output: a-0, b-0, a-1, a-2, b-1, a-3, c-0, a-4, b-2, a-5
      // The one run of 2 (a-1, a-2) occurs because pack-a and pack-c credit-tie
      // at that step (both at 4) and the alphabetical tie-break selects pack-a again.
      // That is correct proportional behavior — not a clustering defect.
      const packA = Array.from({ length: 6 }, (_, i) => makeItem({ id: `a-${i}`, pillar: 'pharm', contentPackId: 'pack-a' }));
      const packB = Array.from({ length: 3 }, (_, i) => makeItem({ id: `b-${i}`, pillar: 'pharm', contentPackId: 'pack-b' }));
      const packC = Array.from({ length: 1 }, (_, i) => makeItem({ id: `c-${i}`, pillar: 'pharm', contentPackId: 'pack-c' }));
      const all = [...packA, ...packB, ...packC];
      const result = build({ dueStates: all.map(i => makeState(i.id)), allItems: itemsToMap(all) });

      expect(result).toHaveLength(10);
      expect(new Set(result.map(e => e.item.id)).size).toBe(10);

      let maxRun = 1, run = 1;
      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1].item.contentPackId;
        const curr = result[i].item.contentPackId;
        run = curr === prev ? run + 1 : 1;
        maxRun = Math.max(maxRun, run);
      }
      expect(maxRun).toBe(2);
    });
  });

  // ─── New-user day-one: empty review pool ──────────────────────────────────

  describe('new-user day-one (no due reviews, only new items)', () => {
    it('returns only new entries when dueStates and examCandidates are empty', () => {
      const items = [makeItem(), makeItem(), makeItem()];
      const result = build({ newItems: items, newItemCap: 3 });
      expect(result).toHaveLength(3);
      expect(kinds(result).every(k => k === 'new')).toBe(true);
    });

    it('modes are all daily', () => {
      const items = [makeItem()];
      const result = build({ newItems: items, newItemCap: 1 });
      expect(modes(result)).toEqual(['daily']);
    });
  });

  // ─── free_recall session cap ──────────────────────────────────────────────

  describe('free_recall session cap', () => {
    it('10 due free-recall + 10 due cloze → exactly FREE_RECALL_CAP free-recall, all cloze retained', () => {
      const frItems = Array.from({ length: 10 }, (_, i) =>
        makeItem({ id: `fr-${i}`, format: 'free_recall', pillar: 'concepts' }),
      );
      const clozeItems = Array.from({ length: 10 }, (_, i) =>
        makeItem({ id: `cl-${i}`, format: 'cloze', pillar: 'pharm' }),
      );
      const dueStates = [
        ...frItems.map(i => makeState(i.id)),
        ...clozeItems.map(i => makeState(i.id)),
      ];

      const result = build({ dueStates, allItems: itemsToMap([...frItems, ...clozeItems]) });

      const frEntries = result.filter(e => e.item.format === 'free_recall');
      const clozeEntries = result.filter(e => e.item.format === 'cloze');

      expect(frEntries).toHaveLength(FREE_RECALL_CAP);
      expect(clozeEntries).toHaveLength(10);
      // dueStates is not mutated — uncapped items remain due
      expect(dueStates.filter(s => s.itemId.startsWith('fr-'))).toHaveLength(10);
    });

    it('fewer than cap free-recall → all included', () => {
      const items = Array.from({ length: FREE_RECALL_CAP - 1 }, (_, i) =>
        makeItem({ id: `fr-${i}`, format: 'free_recall' }),
      );
      const result = build({ dueStates: items.map(i => makeState(i.id)), allItems: itemsToMap(items) });
      expect(result.filter(e => e.item.format === 'free_recall')).toHaveLength(FREE_RECALL_CAP - 1);
    });

    it('cap applies across reviews and new items combined — reviews take priority', () => {
      // 2 review free_recall + 5 new free_recall → 2 reviews + 1 new = FREE_RECALL_CAP
      const reviewFR = Array.from({ length: 2 }, (_, i) =>
        makeItem({ id: `rev-fr-${i}`, format: 'free_recall' }),
      );
      const newFR = Array.from({ length: 5 }, (_, i) =>
        makeItem({ id: `new-fr-${i}`, format: 'free_recall' }),
      );

      const result = build({
        dueStates: reviewFR.map(i => makeState(i.id)),
        allItems: itemsToMap(reviewFR),
        newItems: newFR,
        newItemCap: 10,
      });

      const allFR = result.filter(e => e.item.format === 'free_recall');
      expect(allFR).toHaveLength(FREE_RECALL_CAP);
      // Both review free_recall are included (only 2, within cap)
      expect(result.filter(e => e.kind === 'review' && e.item.format === 'free_recall')).toHaveLength(2);
      // Only 1 new free_recall (cap = 3, 2 consumed by reviews)
      expect(result.filter(e => e.kind === 'new' && e.item.format === 'free_recall')).toHaveLength(1);
    });

    it('exam-mode FR entries are exempt from cap; daily FR cap still applies', () => {
      // 3 exam FR candidates + 5 daily FR due → all 3 exam pass (exempt),
      // only FREE_RECALL_CAP daily pass (cap counts only non-exam FR).
      const examFR = Array.from({ length: 3 }, (_, i) =>
        makeItem({ id: `exam-fr-${i}`, format: 'free_recall', pillar: 'pharm' }),
      );
      const dailyFR = Array.from({ length: 5 }, (_, i) =>
        makeItem({ id: `daily-fr-${i}`, format: 'free_recall', pillar: 'concepts' }),
      );

      const result = build({
        dueStates:      dailyFR.map(i => makeState(i.id)),
        examCandidates: examFR.map(i => makeState(i.id)),
        allItems:       itemsToMap([...examFR, ...dailyFR]),
      });

      // All exam FR pass — exemption is unconditional.
      expect(
        result.filter(e => e.mode === 'exam' && e.item.format === 'free_recall'),
      ).toHaveLength(3);
      // Daily FR capped at FREE_RECALL_CAP; exam entries do not consume cap slots.
      expect(
        result.filter(e => e.mode === 'daily' && e.item.format === 'free_recall'),
      ).toHaveLength(FREE_RECALL_CAP);
    });

    it('exam FR + daily FR reviews + new FR: exam exempt, daily+new share the cap', () => {
      // 2 daily FR reviews, 3 exam FR reviews, 5 new FR.
      // cap counter increments only for daily reviews, so:
      //   daily reviews: frUsed=0→1, frUsed=1→2  (both pass, frUsed=2)
      //   exam reviews:  frUsed unchanged          (all 3 pass, frUsed still 2)
      //   new FR:        first passes (frUsed=2→3), rest dropped
      // Resulting FR in queue: 2 daily + 3 exam + 1 new = 6.
      const dailyFR = Array.from({ length: 2 }, (_, i) =>
        makeItem({ id: `daily-fr-${i}`, format: 'free_recall', pillar: 'concepts' }),
      );
      const examFR = Array.from({ length: 3 }, (_, i) =>
        makeItem({ id: `exam-fr-${i}`, format: 'free_recall', pillar: 'pharm' }),
      );
      const newFR = Array.from({ length: 5 }, (_, i) =>
        makeItem({ id: `new-fr-${i}`, format: 'free_recall', pillar: 'terminology' }),
      );

      const result = build({
        dueStates:      dailyFR.map(i => makeState(i.id)),
        examCandidates: examFR.map(i => makeState(i.id)),
        allItems:       itemsToMap([...dailyFR, ...examFR]),
        newItems:       newFR,
        newItemCap:     5,
      });

      expect(result.filter(e => e.mode === 'exam'  && e.item.format === 'free_recall')).toHaveLength(3);
      expect(result.filter(e => e.mode === 'daily' && e.item.format === 'free_recall' && e.kind === 'review')).toHaveLength(2);
      expect(result.filter(e => e.kind === 'new'   && e.item.format === 'free_recall')).toHaveLength(1);
      // Total FR in session exceeds FREE_RECALL_CAP because exam entries are exempt.
      expect(result.filter(e => e.item.format === 'free_recall').length).toBeGreaterThan(FREE_RECALL_CAP);
    });
  });

  // ─── ChainGate integration ────────────────────────────────────────────────

  describe('ChainGate integration', () => {
    function rampLink(targetId: string) {
      return { linkType: 'rampChain' as const, targetId };
    }

    it('retired tier-N item is excluded from the review queue even when due', () => {
      // tier1 →rampChain→ tier2. tier2 has a state → tier1 is retired.
      const tier1 = makeItem({ id: 'cg-t1', rampTier: 1, graphLinks: [rampLink('cg-t2')] });
      const tier2 = makeItem({ id: 'cg-t2', rampTier: 2 });

      // tier1 is due and has a state; tier2 has a state (retirement trigger)
      const tier1State = makeState('cg-t1');
      const tier2State = makeState('cg-t2', { graduated: false, stability: 1 });

      const result = build({
        dueStates:      [tier1State],           // tier1 is due
        allItems:       itemsToMap([tier1, tier2]),
        allKnownStates: [tier1State, tier2State], // tier2 state → tier1 retired
      });

      expect(result.map(e => e.item.id)).not.toContain('cg-t1');
    });

    it('locked tier-N+1 item is excluded from new candidates', () => {
      // tier1 →rampChain→ tier2. tier1 has no state → tier2 is locked.
      const tier1 = makeItem({ id: 'cg2-t1', rampTier: 1, graphLinks: [rampLink('cg2-t2')] });
      const tier2 = makeItem({ id: 'cg2-t2', rampTier: 2 });

      const result = build({
        newItems:       [tier1, tier2],
        allItems:       itemsToMap([tier1, tier2]),
        newItemCap:     10,
        allKnownStates: [],                     // no states at all → tier2 locked
      });

      // tier1 is active (no predecessor) and appears as new; tier2 is locked
      expect(result.map(e => e.item.id)).toContain('cg2-t1');
      expect(result.map(e => e.item.id)).not.toContain('cg2-t2');
    });

    it('promoted chain: when tier-2 active, tier-1 is retired and absent from queue', () => {
      // tier1 is due; tier2 has a state (promotion happened) → tier1 retired, tier2 due.
      const tier1 = makeItem({ id: 'cg3-t1', rampTier: 1, graphLinks: [rampLink('cg3-t2')] });
      const tier2 = makeItem({ id: 'cg3-t2', rampTier: 2 });

      const tier1State = makeState('cg3-t1', { graduated: true, stability: 10 });
      const tier2State = makeState('cg3-t2', { graduated: false, stability: 2 });

      const result = build({
        dueStates:      [tier1State, tier2State], // both due
        allItems:       itemsToMap([tier1, tier2]),
        allKnownStates: [tier1State, tier2State],
      });

      const ids = result.map(e => e.item.id);
      // tier-1 retired (tier-2 state exists) — must not appear
      expect(ids).not.toContain('cg3-t1');
      // tier-2 active (no successor) — must appear
      expect(ids).toContain('cg3-t2');
    });
  });

  // ─── Pull-ahead bypass ────────────────────────────────────────────────────

  describe('pull-ahead bypass of newItemCap', () => {
    it('pull-ahead item in dueStates (state=New, due:now) appears as review, not consuming cap', () => {
      // Pull-ahead: has persisted MemoryState with state='New', due:now
      const pullAhead = makeItem({ id: 'pull-ahead' });
      const pullState = makeState(pullAhead.id, {
        fsrs: {
          stability: 0, difficulty: 0, due: NOW.toISOString(), state: 'New',
          elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0,
        },
      });
      const newItems = [makeItem({ id: 'new-a' }), makeItem({ id: 'new-b' })];
      const result = build({
        dueStates: [pullState],
        allItems:  itemsToMap([pullAhead]),
        newItems,
        newItemCap: 2, // cap=2; pull-ahead doesn't consume this
      });
      // Review section has pull-ahead; new section has 2 new items
      const reviews = result.filter(e => e.kind === 'review');
      const news    = result.filter(e => e.kind === 'new');
      expect(reviews).toHaveLength(1);
      expect(reviews[0].item.id).toBe('pull-ahead');
      expect(news).toHaveLength(2); // cap fully available for regular new items
    });
  });
});
