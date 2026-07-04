import type { IDatabase } from '../types';
import type { DrillResult } from '../../domain/types';

interface DrillResultRow {
  id: string;
  item_id: string;
  ts: string;
  correct: number;
  latency_ms: number;
  user_answer: string;
}

function rowToResult(row: DrillResultRow): DrillResult {
  return {
    id: row.id,
    itemId: row.item_id,
    ts: row.ts,
    correct: row.correct === 1,
    latencyMs: row.latency_ms,
    userAnswer: row.user_answer,
  };
}

export class DrillResultRepository {
  constructor(private readonly db: IDatabase) {}

  /** Append-only. No UPDATE path exists for drill_results. */
  async append(result: DrillResult): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO drill_results (id, item_id, ts, correct, latency_ms, user_answer)
       VALUES ($id, $itemId, $ts, $correct, $latencyMs, $userAnswer)`,
      {
        $id: result.id,
        $itemId: result.itemId,
        $ts: result.ts,
        $correct: result.correct ? 1 : 0,
        $latencyMs: result.latencyMs,
        $userAnswer: result.userAnswer,
      },
    );
  }

  async findByItemId(itemId: string): Promise<DrillResult[]> {
    const rows = await this.db.getAllAsync<DrillResultRow>(
      `SELECT * FROM drill_results WHERE item_id = $itemId ORDER BY ts ASC`,
      { $itemId: itemId },
    );
    return rows.map(rowToResult);
  }

  async countCorrectByItemId(itemId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM drill_results WHERE item_id = $itemId AND correct = 1`,
      { $itemId: itemId },
    );
    return row?.cnt ?? 0;
  }
}
