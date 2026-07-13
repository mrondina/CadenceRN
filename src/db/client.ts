import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { IDatabase, DBBindParams, DBRunResult } from './types';
import { runMigrations, bootstrapDevFixtures } from './migrations/runner';

// ─── AppDatabase ──────────────────────────────────────────────────────────────
//
// Wraps expo-sqlite's SQLiteDatabase behind IDatabase so repositories and the
// migration runner are testable with a better-sqlite3 substitute under Vitest.

class AppDatabase implements IDatabase {
  constructor(private readonly db: SQLiteDatabase) {}

  async execAsync(sql: string): Promise<void> {
    return this.db.execAsync(sql);
  }

  async runAsync(sql: string, params: DBBindParams = []): Promise<DBRunResult> {
    const result = await this.db.runAsync(sql, params as never);
    return { lastInsertRowId: result.lastInsertRowId, changes: result.changes };
  }

  async getFirstAsync<T>(sql: string, params: DBBindParams = []): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, params as never);
  }

  async getAllAsync<T>(sql: string, params: DBBindParams = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, params as never);
  }

  async withExclusiveTransactionAsync(
    task: (txn: IDatabase) => Promise<void>,
  ): Promise<void> {
    return this.db.withExclusiveTransactionAsync(async (txn) => {
      await task(new AppDatabase(txn));
    });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _db: IDatabase | null = null;

/**
 * Opens (or returns the cached) app database with WAL mode and foreign keys
 * enabled, then runs any pending migrations.
 *
 * Call once at app start (e.g. in the root layout); pass the result down via
 * context or a module-level singleton.
 */
export async function openAppDb(): Promise<IDatabase> {
  if (_db) return _db;

  const raw = await SQLite.openDatabaseAsync('cadence.db');
  await raw.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const db = new AppDatabase(raw);
  await runMigrations(db);
  if (__DEV__) {
    await bootstrapDevFixtures(db);
  }
  _db = db;
  return db;
}
