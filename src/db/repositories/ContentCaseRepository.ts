import type { IDatabase } from '../types';
import type {
  ContentCase,
  MatrixPresentationData,
  DropdownPresentationData,
  Pillar,
} from '../../domain/types';

// ─── Row type ────────────────────────────────────────────────────────────────

interface ContentCaseRow {
  case_id: string;
  session: number;
  week: number;
  course_slug: string;
  pillar: string;
  scenario: string;
  exhibits: string;
  prompt: string;
  presentation: string;
  presentation_data: string;
  source_citation: string;
  content_version: number;
  placeholder: number;
  last_reviewed_at: string | null;
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

function rowToCase(row: ContentCaseRow): ContentCase {
  return {
    caseId: row.case_id,
    session: row.session,
    week: row.week,
    courseSlug: row.course_slug,
    pillar: row.pillar as Pillar,
    scenario: row.scenario,
    exhibits: JSON.parse(row.exhibits) as { label: string; title: string; body: string }[],
    prompt: row.prompt,
    presentation: row.presentation as 'matrix' | 'dropdown_sentence',
    presentationData: JSON.parse(row.presentation_data) as
      | MatrixPresentationData
      | DropdownPresentationData,
    sourceCitation: row.source_citation,
    contentVersion: row.content_version,
    placeholder: row.placeholder === 1,
    lastReviewedAt: row.last_reviewed_at,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ContentCaseRepository {
  constructor(private readonly db: IDatabase) {}

  async upsert(c: ContentCase): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO content_cases (
         case_id, session, week, course_slug, pillar,
         scenario, exhibits, prompt, presentation, presentation_data,
         source_citation, content_version, placeholder, last_reviewed_at
       ) VALUES (
         $caseId, $session, $week, $courseSlug, $pillar,
         $scenario, $exhibits, $prompt, $presentation, $presentationData,
         $sourceCitation, $contentVersion, $placeholder, $lastReviewedAt
       )
       ON CONFLICT(case_id) DO UPDATE SET
         session           = excluded.session,
         week              = excluded.week,
         course_slug       = excluded.course_slug,
         pillar            = excluded.pillar,
         scenario          = excluded.scenario,
         exhibits          = excluded.exhibits,
         prompt            = excluded.prompt,
         presentation      = excluded.presentation,
         presentation_data = excluded.presentation_data,
         source_citation   = excluded.source_citation,
         content_version   = excluded.content_version,
         placeholder       = excluded.placeholder,
         last_reviewed_at  = excluded.last_reviewed_at`,
      {
        $caseId: c.caseId,
        $session: c.session,
        $week: c.week,
        $courseSlug: c.courseSlug,
        $pillar: c.pillar,
        $scenario: c.scenario,
        $exhibits: JSON.stringify(c.exhibits),
        $prompt: c.prompt,
        $presentation: c.presentation,
        $presentationData: JSON.stringify(c.presentationData),
        $sourceCitation: c.sourceCitation,
        $contentVersion: c.contentVersion,
        $placeholder: c.placeholder ? 1 : 0,
        $lastReviewedAt: c.lastReviewedAt,
      },
    );
  }

  async findById(caseId: string): Promise<ContentCase | null> {
    const row = await this.db.getFirstAsync<ContentCaseRow>(
      `SELECT * FROM content_cases WHERE case_id = $caseId`,
      { $caseId: caseId },
    );
    return row ? rowToCase(row) : null;
  }

  async findByIds(caseIds: string[]): Promise<ContentCase[]> {
    if (caseIds.length === 0) return [];
    const placeholders = caseIds.map((_, i) => `$id${i}`).join(', ');
    const params: Record<string, string> = {};
    caseIds.forEach((id, i) => {
      params[`$id${i}`] = id;
    });
    const rows = await this.db.getAllAsync<ContentCaseRow>(
      `SELECT * FROM content_cases WHERE case_id IN (${placeholders})`,
      params,
    );
    return rows.map(rowToCase);
  }
}
