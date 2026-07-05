import Database from 'better-sqlite3';
import type { IDatabase, DBBindParams, DBRunResult } from '../types';

// ─── BetterSQLiteDatabase ─────────────────────────────────────────────────────
//
// Implements IDatabase over better-sqlite3 for Vitest on Node.
//
// Parameter prefix normalisation: expo-sqlite uses { $name: value } objects;
// better-sqlite3 requires { name: value } (no prefix). This adapter strips
// leading $, :, @ from object keys so repositories written for expo-sqlite work
// here unchanged.

function normalizeParams(params: DBBindParams): DBBindParams {
  if (Array.isArray(params)) return params;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key.replace(/^[$:@]/, '')] = value;
  }
  return out as DBBindParams;
}

export class BetterSQLiteDatabase implements IDatabase {
  constructor(private readonly db: Database.Database) {}

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, params: DBBindParams = []): Promise<DBRunResult> {
    const stmt = this.db.prepare(sql);
    const norm = normalizeParams(params);
    const result = Array.isArray(norm) ? stmt.run(...norm) : stmt.run(norm);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: result.changes,
    };
  }

  async getFirstAsync<T>(sql: string, params: DBBindParams = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const norm = normalizeParams(params);
    const row = Array.isArray(norm) ? stmt.get(...norm) : stmt.get(norm);
    return (row as T) ?? null;
  }

  async getAllAsync<T>(sql: string, params: DBBindParams = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const norm = normalizeParams(params);
    const rows = Array.isArray(norm) ? stmt.all(...norm) : stmt.all(norm);
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
