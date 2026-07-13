import type { IDatabase, DBBindValue } from '../types';
import type { ContentItem, GraphLink, ItemBody, ReleaseGate } from '../../domain/types';

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
  // Added by migration 006. Optional so SELECT * on pre-006 schema (runSchemaOnly)
  // returns undefined rather than failing — rowToItem coerces to null.
  case_id?: string | null;
  case_order?: number | null;
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
    graphLinks: JSON.parse(row.graph_links) as GraphLink[],
    releaseGate: {
      sessionIndex: row.release_gate_session_index,
      week: row.release_gate_week,
    } as ReleaseGate,
    contentPackId: row.content_pack_id,
    contentVersion: row.content_version,
    placeholder: row.placeholder === 1,
    caseId: row.case_id ?? null,
    caseOrder: row.case_order ?? null,
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
         content_pack_id, content_version, placeholder,
         case_id, case_order
       ) VALUES (
         $id, $pillar, $format, $difficultyTier, $body,
         $sourceCitation, $lastReviewedAt, $highAlert, $graphLinks,
         $releaseGateSessionIndex, $releaseGateWeek,
         $contentPackId, $contentVersion, $placeholder,
         $caseId, $caseOrder
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
         placeholder = excluded.placeholder,
         case_id = excluded.case_id,
         case_order = excluded.case_order`,
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
        $caseId: item.caseId ?? null,
        $caseOrder: item.caseOrder ?? null,
      },
    );
  }

  /**
   * Items in a specific pack, optionally filtered to one release-gate week and/or pillar.
   * week omitted → all weeks in the pack.
   * pillar omitted → all pillars.
   * Used by practice mode; never called by the scheduled-review path.
   */
  async findByPackAndWeek(
    packId: string,
    week?: number,
    pillar?: string,
  ): Promise<ContentItem[]> {
    let sql = `SELECT * FROM content_items WHERE content_pack_id = $packId`;
    const params: Record<string, DBBindValue> = { $packId: packId };
    if (week !== undefined) {
      sql += ` AND release_gate_week = $week`;
      params.$week = week;
    }
    if (pillar !== undefined) {
      sql += ` AND pillar = $pillar`;
      params.$pillar = pillar;
    }
    const rows = await this.db.getAllAsync<ContentItemRow>(sql, params);
    return rows.map(rowToItem);
  }

  /** Distinct release-gate weeks that have at least one item in this pack, sorted ascending. */
  async findWeeksByPack(packId: string): Promise<number[]> {
    const rows = await this.db.getAllAsync<{ week: number }>(
      `SELECT DISTINCT release_gate_week AS week
       FROM content_items WHERE content_pack_id = $packId
       ORDER BY release_gate_week`,
      { $packId: packId },
    );
    return rows.map(r => r.week);
  }

  /**
   * Distinct pillars that have at least one item in this pack (and optionally
   * this exact release-gate week), sorted alphabetically.
   */
  async findPillarsByPackAndWeek(packId: string, week?: number): Promise<string[]> {
    let sql = `SELECT DISTINCT pillar FROM content_items WHERE content_pack_id = $packId`;
    const params: Record<string, DBBindValue> = { $packId: packId };
    if (week !== undefined) {
      sql += ` AND release_gate_week = $week`;
      params.$week = week;
    }
    sql += ` ORDER BY pillar`;
    const rows = await this.db.getAllAsync<{ pillar: string }>(sql, params);
    return rows.map(r => r.pillar);
  }

  async countByPack(contentPackId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM content_items WHERE content_pack_id = $packId`,
      { $packId: contentPackId },
    );
    return row?.cnt ?? 0;
  }

  /** All rows belonging to a case, sorted by case_order ascending. */
  async findByCaseId(caseId: string): Promise<ContentItem[]> {
    const rows = await this.db.getAllAsync<ContentItemRow>(
      `SELECT * FROM content_items WHERE case_id = $caseId ORDER BY case_order ASC`,
      { $caseId: caseId },
    );
    return rows.map(rowToItem);
  }
}
