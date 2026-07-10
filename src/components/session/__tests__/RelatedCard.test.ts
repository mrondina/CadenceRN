import { describe, it, expect } from 'vitest';
import { resolveLinks, getItemStem, MAX_RELATED_LINKS } from '../relatedCardUtils';
import type { ContentItem } from '@/domain/types';

function makeItem(id: string, body?: ContentItem['body']): ContentItem {
  return {
    id,
    pillar: 'terminology',
    format: 'mcq',
    difficultyTier: 1,
    body: body ?? {
      type: 'mcq',
      stem: `Stem for ${id}`,
      choices: [],
      correctId: 'a',
      explanation: 'Because.',
    },
    sourceCitation: 'test',
    lastReviewedAt: '2026-01-01',
    highAlert: false,
    graphLinks: [],
    releaseGate: { sessionIndex: 1, week: 1 },
    contentPackId: 'test-pack',
    contentVersion: 1,
    placeholder: false,
  };
}

// ─── resolveLinks ─────────────────────────────────────────────────────────────

describe('resolveLinks', () => {
  it('returns resolvable items, silently omitting IDs not in the map', () => {
    const itemA = makeItem('item-a');
    const itemB = makeItem('item-b');
    const map = new Map([
      ['item-a', itemA],
      ['item-b', itemB],
    ]);

    const result = resolveLinks(['item-a', 'ghost-missing', 'item-b'], map);

    expect(result).toHaveLength(2);
    expect(result.map(i => i.id)).toEqual(['item-a', 'item-b']);
  });

  it('returns empty array when no links resolve', () => {
    const map = new Map<string, ContentItem>();
    expect(resolveLinks(['ghost-1', 'ghost-2'], map)).toHaveLength(0);
  });

  it('returns empty array for empty link list', () => {
    const map = new Map([['item-a', makeItem('item-a')]]);
    expect(resolveLinks([], map)).toHaveLength(0);
  });

  it(`caps results at MAX_RELATED_LINKS (${MAX_RELATED_LINKS}) even when more resolve`, () => {
    const items = Array.from(
      { length: MAX_RELATED_LINKS + 2 },
      (_, i) => makeItem(`item-${i}`),
    );
    const map = new Map(items.map(i => [i.id, i]));
    const links = items.map(i => i.id);

    expect(resolveLinks(links, map)).toHaveLength(MAX_RELATED_LINKS);
  });

  it('handles a mix of resolvable and unresolvable links at any position', () => {
    const itemX = makeItem('x');
    const map = new Map([['x', itemX]]);

    expect(resolveLinks(['ghost-before', 'x', 'ghost-after'], map)).toEqual([itemX]);
  });
});

// ─── getItemStem ──────────────────────────────────────────────────────────────

describe('getItemStem', () => {
  it('returns stem for mcq', () => {
    const item = makeItem('a', {
      type: 'mcq',
      stem: 'Which drug class inhibits ACE?',
      choices: [],
      correctId: 'a',
      explanation: 'E',
    });
    expect(getItemStem(item)).toBe('Which drug class inhibits ACE?');
  });

  it('replaces {{blank}} marker in cloze front', () => {
    const item = makeItem('b', {
      type: 'cloze',
      front: 'Furosemide is a {{blank}} diuretic.',
      back: 'loop',
    });
    expect(getItemStem(item)).toBe('Furosemide is a ___ diuretic.');
  });

  it('returns prompt for free_recall', () => {
    const item = makeItem('c', {
      type: 'free_recall',
      prompt: 'Describe the RAAS cascade.',
      rubric: [],
      modelAnswer: 'M',
    });
    expect(getItemStem(item)).toBe('Describe the RAAS cascade.');
  });

  it('returns problem for numeric', () => {
    const item = makeItem('d', {
      type: 'numeric',
      problem: 'Patient weighs 70 kg. Dose = 5 mg/kg. Total dose?',
      answer: 350,
      unit: 'mg',
      tolerance: 0,
    });
    expect(getItemStem(item)).toBe('Patient weighs 70 kg. Dose = 5 mg/kg. Total dose?');
  });
});
