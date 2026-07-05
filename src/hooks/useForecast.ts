import { useState, useEffect, useCallback } from 'react';
import type {
  ActiveExam,
  Cohort,
  DateBoundaryConfig,
  DayForecast,
  IDebtForecaster,
  IExamModeCompressor,
  ItemMemoryState,
} from '../domain/types';
import { DEFAULT_DAY_BOUNDARY } from '../domain/types';
import type { ContentItemRepository } from '../db/repositories/ContentItemRepository';
import type { ItemMemoryStateRepository } from '../db/repositories/ItemMemoryStateRepository';
import { getGateParams, NEW_ITEM_CAP } from './useQueue';

// ─── Forecast deps ────────────────────────────────────────────────────────────

export interface ForecastDeps {
  now: Date;
  cohort: Cohort;
  memStateRepo: ItemMemoryStateRepository;
  contentItemRepo: ContentItemRepository;
  forecaster: IDebtForecaster;
  examCompressor: IExamModeCompressor;
  boundaryConfig?: DateBoundaryConfig;
  days?: number;
}

export interface ForecastResult {
  forecast: DayForecast[];
  activeExam: ActiveExam | null;
  newItemCount: number;
}

// ─── Pure computation function ─────────────────────────────────────────────────

export async function computeForecast(deps: ForecastDeps): Promise<ForecastResult> {
  const {
    now,
    cohort,
    memStateRepo,
    contentItemRepo,
    forecaster,
    examCompressor,
    boundaryConfig = DEFAULT_DAY_BOUNDARY,
    days = 7,
  } = deps;

  const allMemStates = await memStateRepo.findAll();
  const memStateIds = new Set(allMemStates.map(s => s.itemId));
  const allCourses = cohort.sessions.flatMap(s => s.courses);
  const activeExam = examCompressor.getActiveExam(allCourses, now);

  let examCandidates: ItemMemoryState[] = [];
  if (activeExam) {
    const activeCourse = allCourses.find(c => c.id === activeExam.courseId);
    if (activeCourse) {
      const courseItemIds = new Set<string>();
      for (const packId of activeCourse.contentPackIds) {
        const items = await contentItemRepo.findByPack(packId);
        for (const item of items) courseItemIds.add(item.id);
      }
      examCandidates = examCompressor.getCandidates({
        states: allMemStates,
        courseItemIds,
        examDate: new Date(activeExam.examDate + 'T00:00:00.000Z'),
        now,
        targetRetention: 0.95,
      });
    }
  }

  const forecast = forecaster.forecast({
    states: allMemStates,
    now,
    days,
    boundaryConfig,
    examCandidates: activeExam ? examCandidates : [],
    activeExam,
  });

  // Introducible new items — same gate logic as computeSessionQueue, surfaced here
  // so Home can show a non-zero count for students who haven't started yet.
  // Future-day bars stay due-only: new-item introduction on days 1+ depends on
  // what the student does today and cannot be scheduled in advance.
  const { sessionIndex, week } = getGateParams(cohort, now);
  const unlockedItems = sessionIndex > 0
    ? await contentItemRepo.findUnlocked({ sessionIndex, week })
    : [];
  const newItemCount = Math.min(
    NEW_ITEM_CAP,
    unlockedItems.filter(i => !memStateIds.has(i.id)).length,
  );

  return { forecast, activeExam, newItemCount };
}

// ─── React hook ───────────────────────────────────────────────────────────────

export interface UseForecastResult {
  forecast: DayForecast[];
  activeExam: ActiveExam | null;
  newItemCount: number;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useForecast(deps: Omit<ForecastDeps, 'now'> & { now?: Date }): UseForecastResult {
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [activeExam, setActiveExam] = useState<ActiveExam | null>(null);
  const [newItemCount, setNewItemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const now = deps.now ?? new Date();
    computeForecast({ ...deps, now })
      .then(result => {
        if (!cancelled) {
          setForecast(result.forecast);
          setActiveExam(result.activeExam);
          setNewItemCount(result.newItemCount);
          setLoading(false);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { forecast, activeExam, newItemCount, loading, error, refresh };
}
