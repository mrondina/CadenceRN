import type { ContentItem } from '@/domain/types';

export const MAX_RELATED_LINKS = 3;

export function getItemStem(item: ContentItem): string {
  const { body } = item;
  switch (body.type) {
    case 'mcq':        return body.stem;
    case 'cloze':      return body.front.replace(/\{\{blank\}\}/g, '___');
    case 'free_recall': return body.prompt;
    case 'numeric':    return body.problem;
    case 'sequence':   return body.prompt;
  }
}

/**
 * Returns only the ContentItems whose IDs are present in `map`, in order,
 * capped at MAX_RELATED_LINKS. IDs absent from the map are silently skipped —
 * callers never crash on stale or locked links.
 */
export function resolveLinks(
  links: string[],
  map: Map<string, ContentItem>,
): ContentItem[] {
  const resolved: ContentItem[] = [];
  for (const id of links) {
    const item = map.get(id);
    if (item) resolved.push(item);
    if (resolved.length >= MAX_RELATED_LINKS) break;
  }
  return resolved;
}
