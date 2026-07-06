import { useState, useCallback } from 'react';
import { uuidv7 } from 'uuidv7';
import type { ContentItem, DateBoundaryConfig, DrillResult, DrillStreak } from '../domain/types';
import { DEFAULT_DAY_BOUNDARY } from '../domain/types';
import { getStudyDay } from '../domain/utils/DateBoundary';
import type { DrillResultRepository } from '../db/repositories/DrillResultRepository';
import type { IDatabase } from '../db/types';

const DRILL_STREAK_KEY = 'drill_streak';
const DEFAULT_SESSION_SIZE = 3;

// ─── Streak persistence (app_state) ──────────────────────────────────────────

export async function loadDrillStreak(db: IDatabase): Promise<DrillStreak> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_state WHERE key = $k`,
    { $k: DRILL_STREAK_KEY },
  );
  if (!row) return { currentStreak: 0, longestStreak: 0, lastDrillDate: null };
  try {
    return JSON.parse(row.value) as DrillStreak;
  } catch {
    return { currentStreak: 0, longestStreak: 0, lastDrillDate: null };
  }
}

export async function saveDrillStreak(db: IDatabase, streak: DrillStreak): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO app_state (key, value) VALUES ($k, $v)`,
    { $k: DRILL_STREAK_KEY, $v: JSON.stringify(streak) },
  );
}

export function advanceDrillStreak(
  current: DrillStreak,
  now: Date,
  boundaryConfig: DateBoundaryConfig = DEFAULT_DAY_BOUNDARY,
): DrillStreak {
  const todayStr = getStudyDay(now, boundaryConfig);
  const lastDate = current.lastDrillDate;

  if (lastDate === todayStr) {
    // Already drilled today under this boundary — streak unchanged
    return current;
  }

  const yesterdayDate = new Date(now);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = getStudyDay(yesterdayDate, boundaryConfig);
  const consecutive = lastDate === yesterday || lastDate === null;

  const newStreak = consecutive ? current.currentStreak + 1 : 1;
  return {
    currentStreak: newStreak,
    longestStreak: Math.max(current.longestStreak, newStreak),
    lastDrillDate: todayStr,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type DrillPhase = 'idle' | 'active' | 'feedback' | 'complete';

export interface DrillItemResult {
  item: ContentItem;
  userAnswer: string;
  correct: boolean;
  latencyMs: number;
}

export interface UseDrillSessionResult {
  phase: DrillPhase;
  items: ContentItem[];
  currentIndex: number;
  currentItem: ContentItem | undefined;
  results: DrillItemResult[];
  streak: DrillStreak;
  start: (allItems: ContentItem[], count?: number) => void;
  submitAnswer: (answer: string, latencyMs: number) => void;
  next: () => void;
  reset: () => void;
}

export function useDrillSession(deps: {
  db: IDatabase;
  drillRepo: DrillResultRepository;
  boundaryConfig?: DateBoundaryConfig;
}): UseDrillSessionResult {
  const { db, drillRepo, boundaryConfig = DEFAULT_DAY_BOUNDARY } = deps;

  const [phase, setPhase] = useState<DrillPhase>('idle');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<DrillItemResult[]>([]);
  const [streak, setStreak] = useState<DrillStreak>({
    currentStreak: 0,
    longestStreak: 0,
    lastDrillDate: null,
  });

  const currentItem = items[currentIndex];

  const start = useCallback(async (allItems: ContentItem[], count = DEFAULT_SESSION_SIZE) => {
    // Stable selection: sort by id for determinism, then take first count.
    const sorted = [...allItems].sort((a, b) => a.id.localeCompare(b.id));
    const selected = sorted.slice(0, Math.min(count, sorted.length));
    const existing = await loadDrillStreak(db);
    setStreak(existing);
    setItems(selected);
    setCurrentIndex(0);
    setResults([]);
    setPhase('active');
  }, [db]);

  const submitAnswer = useCallback(async (answer: string, latencyMs: number) => {
    if (!currentItem || phase !== 'active') return;
    const body = currentItem.body;
    if (body.type !== 'numeric') return;

    const correct = Math.abs(parseFloat(answer) - body.answer) <= body.tolerance;
    const result: DrillItemResult = { item: currentItem, userAnswer: answer, correct, latencyMs };
    setResults(prev => [...prev, result]);
    setPhase('feedback');

    const drillResult: DrillResult = {
      id: uuidv7(),
      itemId: currentItem.id,
      ts: new Date().toISOString(),
      correct,
      latencyMs,
      userAnswer: answer,
    };
    drillRepo.append(drillResult).catch(() => {});
  }, [currentItem, phase, drillRepo]);

  const next = useCallback(async () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= items.length) {
      // Session complete — update streak
      const now = new Date();
      const current = await loadDrillStreak(db);
      const updated = advanceDrillStreak(current, now, boundaryConfig);
      await saveDrillStreak(db, updated);
      setStreak(updated);
      setPhase('complete');
    } else {
      setCurrentIndex(nextIndex);
      setPhase('active');
    }
  }, [currentIndex, items.length, db]);

  const reset = useCallback(() => {
    setPhase('idle');
    setItems([]);
    setCurrentIndex(0);
    setResults([]);
  }, []);

  return { phase, items, currentIndex, currentItem, results, streak, start, submitAnswer, next, reset };
}
