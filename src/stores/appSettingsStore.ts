import { create } from 'zustand';
import type { IDatabase } from '../db/types';

const KEY_BOUNDARY = 'day_boundary_hour';
const KEY_CAP = 'new_item_cap';

interface AppSettingsState {
  dayBoundaryHour: number;  // 0–23, default 4
  newItemCap: number;       // default 20

  load: (db: IDatabase) => Promise<void>;
  setDayBoundaryHour: (db: IDatabase, hour: number) => Promise<void>;
  setNewItemCap: (db: IDatabase, cap: number) => Promise<void>;
}

export const useAppSettingsStore = create<AppSettingsState>()((set) => ({
  dayBoundaryHour: 4,
  newItemCap: 20,

  load: async (db) => {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      `SELECT key, value FROM app_state WHERE key IN ($k1, $k2)`,
      { $k1: KEY_BOUNDARY, $k2: KEY_CAP },
    );
    const map = new Map(rows.map(r => [r.key, r.value]));
    const hour = map.has(KEY_BOUNDARY) ? parseInt(map.get(KEY_BOUNDARY)!, 10) : 4;
    const cap  = map.has(KEY_CAP)      ? parseInt(map.get(KEY_CAP)!, 10)      : 20;
    set({ dayBoundaryHour: isNaN(hour) ? 4 : hour, newItemCap: isNaN(cap) ? 20 : cap });
  },

  setDayBoundaryHour: async (db, hour) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO app_state (key, value) VALUES ($k, $v)`,
      { $k: KEY_BOUNDARY, $v: String(hour) },
    );
    set({ dayBoundaryHour: hour });
  },

  setNewItemCap: async (db, cap) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO app_state (key, value) VALUES ($k, $v)`,
      { $k: KEY_CAP, $v: String(cap) },
    );
    set({ newItemCap: cap });
  },
}));
