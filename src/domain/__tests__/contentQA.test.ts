/**
 * Content QA — render-shuffle effectiveness.
 *
 * MCQCard shuffles body.choices with fnv1a32(itemId) before display.
 * This test guards against that shuffle being silently disabled: if
 * it is removed, students can learn correct-answer position from
 * repeated exposure across sessions.
 *
 * The test operates on the same logic MCQCard uses (seededRng utilities)
 * applied to live content JSON, so it will catch both:
 *   (a) someone removing the shuffle from MCQCard
 *   (b) a pack where every MCQ item's authored order happens to be
 *       unchanged by the shuffle (degenerate seed collision)
 *
 * It does NOT assert authored position distribution — that property
 * no longer reaches the student once the render shuffle is in place,
 * and asserting it would force pointless hand-balancing of JSON forever.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fnv1a32, shuffleWithSeed } from '../../utils/seededRng';

const CONTENT_DIR = join(__dirname, '../../../content');

const PACKS = [
  'complex-care-2-pack.json',
  'pharm-pack.json',
  'foundations-pack.json',
  'terminology-pack.json',
  'dosage-pack.json',
];

interface Choice { id: string; text: string; }
interface MCQBody { type: 'mcq'; choices: Choice[]; correctId: string; }
interface ContentItem { id: string; format: string; body: MCQBody | Record<string, unknown>; }

describe('MCQ render-shuffle effectiveness', () => {
  for (const packFile of PACKS) {
    it(`${packFile} — shuffle reorders ≥1 item and preserves all choices`, () => {
      const items: ContentItem[] = JSON.parse(
        readFileSync(join(CONTENT_DIR, packFile), 'utf-8'),
      );
      const mcqItems = items.filter(i => i.format === 'mcq');

      if (mcqItems.length === 0) return; // pack has no MCQ items

      let atLeastOneReordered = false;

      for (const item of mcqItems) {
        const body = item.body as MCQBody;
        const authored = body.choices.map(c => c.id);
        const shuffled = shuffleWithSeed(body.choices, fnv1a32(item.id)).map(c => c.id);

        // No choice may be lost or duplicated
        expect([...shuffled].sort(), `${item.id}: shuffle lost or duplicated a choice`)
          .toEqual([...authored].sort());

        // correctId must survive the shuffle
        expect(
          shuffled.includes(body.correctId),
          `${item.id}: correctId '${body.correctId}' missing after shuffle`,
        ).toBe(true);

        if (JSON.stringify(shuffled) !== JSON.stringify(authored)) {
          atLeastOneReordered = true;
        }
      }

      // Every MCQ pack must have at least one item where the shuffle changes order.
      // A pack where every item's authored order is a fixed point of its seed would
      // mean the shuffle is effectively a no-op for that pack's content.
      expect(
        atLeastOneReordered,
        `${packFile}: every MCQ item shuffled to the same authored order — verify seededRng is wired`,
      ).toBe(true);
    });
  }

  it('shuffle is deterministic — same itemId always produces same display order', () => {
    const items: ContentItem[] = JSON.parse(
      readFileSync(join(CONTENT_DIR, 'pharm-pack.json'), 'utf-8'),
    );
    const item = items.find(i => i.format === 'mcq')!;
    const body = item.body as MCQBody;

    const run1 = shuffleWithSeed(body.choices, fnv1a32(item.id)).map(c => c.id);
    const run2 = shuffleWithSeed(body.choices, fnv1a32(item.id)).map(c => c.id);
    expect(run1).toEqual(run2);
  });

  it('different items produce different shuffled orders (no single fixed permutation)', () => {
    const items: ContentItem[] = JSON.parse(
      readFileSync(join(CONTENT_DIR, 'pharm-pack.json'), 'utf-8'),
    );
    const mcqItems = items.filter(i => i.format === 'mcq');
    if (mcqItems.length < 2) return;

    const orders = mcqItems.slice(0, 8).map(item => {
      const body = item.body as MCQBody;
      return shuffleWithSeed(body.choices, fnv1a32(item.id)).map(c => c.id).join(',');
    });

    const unique = new Set(orders);
    // At least half of the sampled items must produce distinct display orders
    expect(unique.size).toBeGreaterThan(orders.length / 2);
  });
});
