import { create } from 'zustand';
import type { QueueEntry } from '../domain/types';
import type { IDatabase } from '../db/types';

// ─── State shape ──────────────────────────────────────────────────────────────

interface SessionState {
  /** Ordered queue for the current review session. */
  queue: QueueEntry[];
  /** Index of the card currently displayed to the user (0-based). */
  currentIndex: number;

  // ── Actions ──
  setQueue: (queue: QueueEntry[]) => void;
  /** Advance to the next card. No-ops when already past the end. */
  advance: () => void;
  /** Reset all session state (e.g. after session completion). */
  reset: () => void;

  /**
   * Persist currentIndex to SQLite app_state so it survives background kills.
   *
   * Called by the AppState listener when the app moves to background.
   * The write is idempotent: INSERT OR REPLACE overwrites any prior value.
   * Only currentIndex is persisted — the queue itself is recomputed from DB
   * on next launch, so the worst-case data loss is the displayed card.
   */
  flush: (db: IDatabase) => Promise<void>;

  /**
   * Read currentIndex from SQLite app_state and restore it to in-memory state.
   *
   * Called once on app launch (after the queue is set) so the session resumes
   * from the card that was displayed when the app last backgrounded.
   */
  restore: (db: IDatabase) => Promise<void>;
}

const SESSION_INDEX_KEY = 'session_current_index';

const initialState = {
  queue: [] as QueueEntry[],
  currentIndex: 0,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSessionStore = create<SessionState>()((set, get) => ({
  ...initialState,

  setQueue: (queue) => set({ queue, currentIndex: 0 }),

  advance: () =>
    set((s) => ({ currentIndex: Math.min(s.currentIndex + 1, s.queue.length) })),

  reset: () => set(initialState),

  flush: async (db) => {
    const { currentIndex } = get();
    await db.runAsync(
      `INSERT OR REPLACE INTO app_state (key, value) VALUES ($key, $val)`,
      { $key: SESSION_INDEX_KEY, $val: String(currentIndex) },
    );
  },

  restore: async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_state WHERE key = $key`,
      { $key: SESSION_INDEX_KEY },
    );
    if (row) set({ currentIndex: Number(row.value) });
  },
}));
