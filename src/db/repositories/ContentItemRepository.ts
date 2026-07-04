import type { IDatabase } from '../types';
import type { ContentItem, ItemBody, ReleaseGate } from '../../domain/types';

// ─── Row type ────────────────────────────────────────────────────────────────

interface ContentItemRow {
  id: string;
  pillar: string;
  format: string;
  difficulty_tier: number;
  body: string;
  source_citation: string;
  last_reviewed_at: string;
  high_alert: number;
  graph_links: string;
  release_gate_session_index: number;
  release_gate_week: number;
  content_pack_id: string;
  content_version: number;
  placeholder: number;
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

function rowToItem(row: ContentItemRow): ContentItem {
  return {
    id: row.id,
    pillar: row.pillar as ContentItem['pillar'],
    format: row.format as ContentItem['format'],
    difficultyTier: row.difficulty_tier as ContentItem['difficultyTier'],
    body: JSON.parse(row.body) as ItemBody,
    sourceCitation: row.source_citation,
    lastReviewedAt: row.last_reviewed_at,
    highAlert: row.high_alert === 1,
    graphLinks: JSON.parse(row.graph_links) as string[],
    releaseGate: {
      sessionIndex: row.release_gate_session_index,
      week: row.release_gate_week,
    } as ReleaseGate,
    contentPackId: row.content_pack_id,
    contentVersion: row.content_version,
    placeholder: row.placeholder === 1,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ContentItemRepository {
  constructor(private readonly db: IDatabase) {}

  async findById(id: string): Promise<ContentItem | null> {
    const row = await this.db.getFirstAsync<ContentItemRow>(
      `SELECT * FROM content_items WHERE id = $id`,
      { $id: id },
    );
    return row ? rowToItem(row) : null;
  }

  async findByPack(contentPackId: string): Promise<ContentItem[]> {
    const rows = await this.db.getAllAsync<ContentItemRow>(
      `SELECT * FROM content_items WHERE content_pack_id = $packId`,
      { $packId: contentPackId },
    );
    return rows.map(rowToItem);
  }

  /** All items whose release gate is at or before the given session/week. */
  async findUnlocked(params: {
    sessionIndex: number;
    week: number;
  }): Promise<ContentItem[]> {
    const rows = await this.db.getAllAsync<ContentItemRow>(
      `SELECT * FROM content_items
       WHERE release_gate_session_index < $sess
          OR (release_gate_session_index = $sess AND release_gate_week <= $week)`,
      { $sess: params.sessionIndex, $week: params.week },
    );
    return rows.map(rowToItem);
  }

  async upsert(item: ContentItem): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO content_items (
         id, pillar, format, difficulty_tier, body,
         source_citation, last_reviewed_at, high_alert, graph_links,
         release_gate_session_index, release_gate_week,
         content_pack_id, content_version, placeholder
       ) VALUES (
         $id, $pillar, $format, $difficultyTier, $body,
         $sourceCitation, $lastReviewedAt, $highAlert, $graphLinks,
         $releaseGateSessionIndex, $releaseGateWeek,
         $contentPackId, $contentVersion, $placeholder
       )
       ON CONFLICT(id) DO UPDATE SET
         pillar = excluded.pillar,
         format = excluded.format,
         difficulty_tier = excluded.difficulty_tier,
         body = excluded.body,
         source_citation = excluded.source_citation,
         last_reviewed_at = excluded.last_reviewed_at,
         high_alert = excluded.high_alert,
         graph_links = excluded.graph_links,
         release_gate_session_index = excluded.release_gate_session_index,
         release_gate_week = excluded.release_gate_week,
         content_pack_id = excluded.content_pack_id,
         content_version = excluded.content_version,
         placeholder = excluded.placeholder`,
      {
        $id: item.id,
        $pillar: item.pillar,
        $format: item.format,
        $difficultyTier: item.difficultyTier,
        $body: JSON.stringify(item.body),
        $sourceCitation: item.sourceCitation,
        $lastReviewedAt: item.lastReviewedAt,
        $highAlert: item.highAlert ? 1 : 0,
        $graphLinks: JSON.stringify(item.graphLinks),
        $releaseGateSessionIndex: item.releaseGate.sessionIndex,
        $releaseGateWeek: item.releaseGate.week,
        $contentPackId: item.contentPackId,
        $contentVersion: item.contentVersion,
        $placeholder: item.placeholder ? 1 : 0,
      },
    );
  }

  async countByPack(contentPackId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM content_items WHERE content_pack_id = $packId`,
      { $packId: contentPackId },
    );
    return row?.cnt ?? 0;
  }
}
