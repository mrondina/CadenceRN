import Database from 'better-sqlite3';
import type { IDatabase, DBBindParams, DBRunResult } from '../types';

// ─── BetterSQLiteDatabase ─────────────────────────────────────────────────────
//
// Implements IDatabase over better-sqlite3 for use in Vitest tests running on
// Node where expo-sqlite's native bridge is unavailable.
//
// Parameter convention: both expo-sqlite and better-sqlite3 accept $name for
// named params, so SQL written for production works here unchanged.

export class BetterSQLiteDatabase implements IDatabase {
  constructor(private readonly db: Database.Database) {}

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, params: DBBindParams = []): Promise<DBRunResult> {
    const stmt = this.db.prepare(sql);
    const result = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: result.changes,
    };
  }

  async getFirstAsync<T>(sql: string, params: DBBindParams = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
    return (row as T) ?? null;
  }

  async getAllAsync<T>(sql: string, params: DBBindParams = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const rows = Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
    return rows as T[];
  }

  async withExclusiveTransactionAsync(
    task: (txn: IDatabase) => Promise<void>,
  ): Promise<void> {
    this.db.exec('BEGIN EXCLUSIVE');
    try {
      await task(this);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

/** Create an in-memory BetterSQLiteDatabase — use in tests. */
export function openTestDb(): BetterSQLiteDatabase {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return new BetterSQLiteDatabase(db);
}
