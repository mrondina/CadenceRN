import type { IDatabase } from '../types';
import type { ItemMemoryState, FsrsCardState, FsrsState } from '../../domain/types';

// ─── Row type ────────────────────────────────────────────────────────────────

interface MemoryStateRow {
  item_id: string;
  fsrs_stability: number;
  fsrs_difficulty: number;
  fsrs_due: string;
  fsrs_state: string;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_learning_steps: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_last_review: string | null;
  relearn_streak: number;
  graduated: number;
  last_qualifying_date: string | null;
  updated_at: string;
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

function rowToState(row: MemoryStateRow): ItemMemoryState {
  const fsrs: FsrsCardState = {
    stability: row.fsrs_stability,
    difficulty: row.fsrs_difficulty,
    due: row.fsrs_due,
    state: row.fsrs_state as FsrsState,
    elapsedDays: row.fsrs_elapsed_days,
    scheduledDays: row.fsrs_scheduled_days,
    learningSteps: row.fsrs_learning_steps,
    reps: row.fsrs_reps,
    lapses: row.fsrs_lapses,
    lastReview: row.fsrs_last_review ?? undefined,
  };
  return {
    itemId: row.item_id,
    fsrs,
    relearnStreak: row.relearn_streak,
    graduated: row.graduated === 1,
    lastQualifyingDate: row.last_qualifying_date,
    updatedAt: row.updated_at,
  };
}

function stateToParams(state: ItemMemoryState): Record<string, string | number | null> {
  return {
    $itemId: state.itemId,
    $stability: state.fsrs.stability,
    $difficulty: state.fsrs.difficulty,
    $due: state.fsrs.due,
    $state: state.fsrs.state,
    $elapsedDays: state.fsrs.elapsedDays,
    $scheduledDays: state.fsrs.scheduledDays,
    $learningSteps: state.fsrs.learningSteps,
    $reps: state.fsrs.reps,
    $lapses: state.fsrs.lapses,
    $lastReview: state.fsrs.lastReview ?? null,
    $relearnStreak: state.relearnStreak,
    $graduated: state.graduated ? 1 : 0,
    $lastQualifyingDate: state.lastQualifyingDate,
    $updatedAt: state.updatedAt,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ItemMemoryStateRepository {
  constructor(private readonly db: IDatabase) {}

  async findByItemId(itemId: string): Promise<ItemMemoryState | null> {
    const row = await this.db.getFirstAsync<MemoryStateRow>(
      `SELECT * FROM item_memory_states WHERE item_id = $itemId`,
      { $itemId: itemId },
    );
    return row ? rowToState(row) : null;
  }

  /** All states whose fsrs_due ≤ the given ISO datetime. */
  async findDueBy(nowIso: string): Promise<ItemMemoryState[]> {
    const rows = await this.db.getAllAsync<MemoryStateRow>(
      `SELECT * FROM item_memory_states WHERE fsrs_due <= $now`,
      { $now: nowIso },
    );
    return rows.map(rowToState);
  }

  async findAll(): Promise<ItemMemoryState[]> {
    const rows = await this.db.getAllAsync<MemoryStateRow>(
      `SELECT * FROM item_memory_states`,
    );
    return rows.map(rowToState);
  }

  /** INSERT only. Called by ReviewEventRepository.recordFirstReview() inside its transaction. */
  async insert(db: IDatabase, state: ItemMemoryState): Promise<void> {
    await db.runAsync(
      `INSERT INTO item_memory_states (
         item_id, fsrs_stability, fsrs_difficulty, fsrs_due, fsrs_state,
         fsrs_elapsed_days, fsrs_scheduled_days, fsrs_learning_steps,
         fsrs_reps, fsrs_lapses, fsrs_last_review,
         relearn_streak, graduated, last_qualifying_date, updated_at
       ) VALUES (
         $itemId, $stability, $difficulty, $due, $state,
         $elapsedDays, $scheduledDays, $learningSteps,
         $reps, $lapses, $lastReview,
         $relearnStreak, $graduated, $lastQualifyingDate, $updatedAt
       )`,
      stateToParams(state),
    );
  }

  /** Direct insert for pull-ahead tap (no review event — only path besides recordFirstReview). */
  async insertPullAhead(state: ItemMemoryState): Promise<void> {
    return this.insert(this.db, state);
  }

  /** UPDATE an existing row after a rating. */
  async update(state: ItemMemoryState): Promise<void> {
    await this.updateWithDb(this.db, state);
  }

  /** UPDATE inside a transaction — parallel to insert(db, state). */
  async updateInTxn(txn: IDatabase, state: ItemMemoryState): Promise<void> {
    await this.updateWithDb(txn, state);
  }

  private async updateWithDb(db: IDatabase, state: ItemMemoryState): Promise<void> {
    await db.runAsync(
      `UPDATE item_memory_states SET
         fsrs_stability       = $stability,
         fsrs_difficulty      = $difficulty,
         fsrs_due             = $due,
         fsrs_state           = $state,
         fsrs_elapsed_days    = $elapsedDays,
         fsrs_scheduled_days  = $scheduledDays,
         fsrs_learning_steps  = $learningSteps,
         fsrs_reps            = $reps,
         fsrs_lapses          = $lapses,
         fsrs_last_review     = $lastReview,
         relearn_streak       = $relearnStreak,
         graduated            = $graduated,
         last_qualifying_date = $lastQualifyingDate,
         updated_at           = $updatedAt
       WHERE item_id = $itemId`,
      stateToParams(state),
    );
  }
}
