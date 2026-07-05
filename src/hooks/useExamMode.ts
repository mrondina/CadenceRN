import { useState, useEffect, useCallback } from 'react';
import type { ActiveExam, Cohort, IExamModeCompressor } from '../domain/types';

// ─── React hook ───────────────────────────────────────────────────────────────

export interface UseExamModeResult {
  activeExam: ActiveExam | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Synchronously derives the active exam from cohort+now.
 * getActiveExam is a pure in-memory computation so no async I/O is needed.
 */
export function useExamMode(params: {
  cohort: Cohort;
  examCompressor: IExamModeCompressor;
  now?: Date;
}): UseExamModeResult {
  const { cohort, examCompressor } = params;
  const [activeExam, setActiveExam] = useState<ActiveExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    const now = params.now ?? new Date();
    const allCourses = cohort.sessions.flatMap(s => s.courses);
    setActiveExam(examCompressor.getActiveExam(allCourses, now));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { activeExam, loading, refresh };
}
