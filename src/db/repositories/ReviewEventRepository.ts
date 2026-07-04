import type { IDatabase } from '../types';
import type { ReviewEvent, FirstReviewTransaction } from '../../domain/types';
import { ItemMemoryStateRepository } from './ItemMemoryStateRepository';

// ─── Row type ────────────────────────────────────────────────────────────────

interface ReviewEventRow {
  id: string;
  item_id: string;
  ts: string;
  rating: number;
  latency_ms: number;
  mode: string;
  stability_before: number;
  difficulty_before: number;
  due_before: string;
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

function rowToEvent(row: ReviewEventRow): ReviewEvent {
  return {
    id: row.id,
    itemId: row.item_id,
    ts: row.ts,
    rating: row.rating as ReviewEvent['rating'],
    latencyMs: row.latency_ms,
    mode: row.mode as ReviewEvent['mode'],
    stabilityBefore: row.stability_before,
    difficultyBefore: row.difficulty_before,
    dueBefore: row.due_before,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ReviewEventRepository {
  private readonly memStateRepo: ItemMemoryStateRepository;

  constructor(private readonly db: IDatabase) {
    this.memStateRepo = new ItemMemoryStateRepository(db);
  }

  /**
   * Atomic first-review transaction (ADR-8).
   *
   * Inserts the ReviewEvent and the initial ItemMemoryState in a single
   * exclusive transaction. If the state insert fails, the event is rolled back
   * — no orphaned event ever persists. This is the ONLY write path that creates
   * an ItemMemoryState row.
   */
  async recordFirstReview(tx: FirstReviewTransaction): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (txn) => {
      await this.appendEvent(txn, tx.event);
      await this.memStateRepo.insert(txn, tx.initialMemoryState);
    });
  }

  /**
   * Append a subsequent review event for an already-introduced item.
   * The ItemMemoryState must already exist; callers must UPDATE it separately
   * via ItemMemoryStateRepository.update().
   */
  async append(event: ReviewEvent): Promise<void> {
    await this.appendEvent(this.db, event);
  }

  private async appendEvent(db: IDatabase, event: ReviewEvent): Promise<void> {
    await db.runAsync(
      `INSERT INTO review_events (
         id, item_id, ts, rating, latency_ms, mode,
         stability_before, difficulty_before, due_before
       ) VALUES (
         $id, $itemId, $ts, $rating, $latencyMs, $mode,
         $stabilityBefore, $difficultyBefore, $dueBefore
       )`,
      {
        $id: event.id,
        $itemId: event.itemId,
        $ts: event.ts,
        $rating: event.rating,
        $latencyMs: event.latencyMs,
        $mode: event.mode,
        $stabilityBefore: event.stabilityBefore,
        $difficultyBefore: event.difficultyBefore,
        $dueBefore: event.dueBefore,
      },
    );
  }

  async findByItemId(itemId: string): Promise<ReviewEvent[]> {
    const rows = await this.db.getAllAsync<ReviewEventRow>(
      `SELECT * FROM review_events WHERE item_id = $itemId ORDER BY ts ASC`,
      { $itemId: itemId },
    );
    return rows.map(rowToEvent);
  }

  async findAll(): Promise<ReviewEvent[]> {
    const rows = await this.db.getAllAsync<ReviewEventRow>(
      `SELECT * FROM review_events ORDER BY ts ASC`,
    );
    return rows.map(rowToEvent);
  }
}
