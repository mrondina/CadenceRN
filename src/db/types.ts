// ─── Database abstraction ─────────────────────────────────────────────────────
//
// IDatabase is a minimal async interface over SQLite. Production code is backed
// by expo-sqlite (via AppDatabase in client.ts). Tests use BetterSQLiteDatabase
// (better-sqlite3) so repositories can run under Vitest on Node without a
// native bridge.

export type DBBindValue = string | number | null | boolean;
export type DBBindParams = DBBindValue[] | Record<string, DBBindValue>;

export interface DBRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface IDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: DBBindParams): Promise<DBRunResult>;
  getFirstAsync<T>(sql: string, params?: DBBindParams): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: DBBindParams): Promise<T[]>;
  // The callback receives a transaction-scoped IDatabase. Queries inside are
  // isolated; the transaction is committed on callback resolution and rolled
  // back on rejection.
  withExclusiveTransactionAsync(task: (txn: IDatabase) => Promise<void>): Promise<void>;
}
