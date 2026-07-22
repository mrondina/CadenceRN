import type { IDatabase } from '../types';
import type { Cohort, SessionInstance, CourseInstance } from '../../domain/types';

// ─── Row types ────────────────────────────────────────────────────────────────

interface CohortRow {
  id: string;
  start_date: string;
  template_id: string;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  cohort_id: string;
  session_index: number;
  label: string;
  start_date: string;
  end_date: string;
  updated_at: string;
}

interface CourseRow {
  id: string;
  session_id: string;
  title: string;
  content_pack_ids: string;
  exam_dates: string;
  updated_at: string;
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class CohortRepository {
  constructor(private readonly db: IDatabase) {}

  async findFirst(): Promise<Cohort | null> {
    const cohortRow = await this.db.getFirstAsync<CohortRow>(
      `SELECT * FROM cohorts ORDER BY created_at DESC LIMIT 1`,
    );
    if (!cohortRow) return null;
    return this.hydrateCohort(cohortRow);
  }

  async findById(id: string): Promise<Cohort | null> {
    const cohortRow = await this.db.getFirstAsync<CohortRow>(
      `SELECT * FROM cohorts WHERE id = $id`,
      { $id: id },
    );
    if (!cohortRow) return null;
    return this.hydrateCohort(cohortRow);
  }

  async save(cohort: Cohort): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (txn) => {
      await this.insertCohort(txn, cohort);
    });
  }

  async saveAndReplace(cohort: Cohort): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (txn) => {
      // Delete in FK order: course_instances → session_instances → cohorts
      await txn.runAsync(
        `DELETE FROM course_instances WHERE session_id IN (SELECT id FROM session_instances)`,
      );
      await txn.runAsync(`DELETE FROM session_instances`);
      await txn.runAsync(`DELETE FROM cohorts`);
      await this.insertCohort(txn, cohort);
    });
  }

  private async insertCohort(txn: IDatabase, cohort: Cohort): Promise<void> {
    await txn.runAsync(
      `INSERT INTO cohorts (id, start_date, template_id, created_at, updated_at)
       VALUES ($id, $startDate, $templateId, $createdAt, $updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         start_date  = excluded.start_date,
         template_id = excluded.template_id,
         updated_at  = excluded.updated_at`,
      {
        $id: cohort.id,
        $startDate: cohort.startDate,
        $templateId: cohort.templateId,
        $createdAt: cohort.createdAt,
        $updatedAt: cohort.updatedAt,
      },
    );

    for (const session of cohort.sessions) {
      await txn.runAsync(
        `INSERT INTO session_instances (
           id, cohort_id, session_index, label, start_date, end_date, updated_at
         ) VALUES (
           $id, $cohortId, $sessionIndex, $label, $startDate, $endDate, $updatedAt
         )
         ON CONFLICT(id) DO UPDATE SET
           session_index = excluded.session_index,
           label         = excluded.label,
           start_date    = excluded.start_date,
           end_date      = excluded.end_date,
           updated_at    = excluded.updated_at`,
        {
          $id: session.id,
          $cohortId: session.cohortId,
          $sessionIndex: session.sessionIndex,
          $label: session.label,
          $startDate: session.startDate,
          $endDate: session.endDate,
          $updatedAt: session.updatedAt,
        },
      );

      for (const course of session.courses) {
        await txn.runAsync(
          `INSERT INTO course_instances (
             id, session_id, title, content_pack_ids, exam_dates, updated_at
           ) VALUES (
             $id, $sessionId, $title, $contentPackIds, $examDates, $updatedAt
           )
           ON CONFLICT(id) DO UPDATE SET
             title            = excluded.title,
             content_pack_ids = excluded.content_pack_ids,
             exam_dates       = excluded.exam_dates,
             updated_at       = excluded.updated_at`,
          {
            $id: course.id,
            $sessionId: course.sessionId,
            $title: course.title,
            $contentPackIds: JSON.stringify(course.contentPackIds),
            $examDates: JSON.stringify(course.examDates),
            $updatedAt: course.updatedAt,
          },
        );
      }
    }
  }

  private async hydrateCohort(cohortRow: CohortRow): Promise<Cohort> {
    const sessionRows = await this.db.getAllAsync<SessionRow>(
      `SELECT * FROM session_instances WHERE cohort_id = $cohortId ORDER BY session_index ASC`,
      { $cohortId: cohortRow.id },
    );

    const sessions: SessionInstance[] = [];
    for (const sr of sessionRows) {
      const courseRows = await this.db.getAllAsync<CourseRow>(
        `SELECT * FROM course_instances WHERE session_id = $sessionId`,
        { $sessionId: sr.id },
      );

      const courses: CourseInstance[] = courseRows.map((cr) => ({
        id: cr.id,
        sessionId: cr.session_id,
        title: cr.title,
        contentPackIds: JSON.parse(cr.content_pack_ids) as string[],
        examDates: JSON.parse(cr.exam_dates) as string[],
        updatedAt: cr.updated_at,
      }));

      sessions.push({
        id: sr.id,
        cohortId: sr.cohort_id,
        sessionIndex: sr.session_index as SessionInstance['sessionIndex'],
        label: sr.label,
        startDate: sr.start_date,
        endDate: sr.end_date,
        courses,
        updatedAt: sr.updated_at,
      });
    }

    return {
      id: cohortRow.id,
      startDate: cohortRow.start_date,
      templateId: cohortRow.template_id,
      sessions,
      createdAt: cohortRow.created_at,
      updatedAt: cohortRow.updated_at,
    };
  }
}
