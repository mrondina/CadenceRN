import { create } from 'zustand';
import type { Cohort } from '../domain/types';

// ─── State shape ──────────────────────────────────────────────────────────────

interface CohortState {
  /** The active cohort, or null before setup completes. */
  cohort: Cohort | null;
  loading: boolean;
  error: Error | null;

  setCohort: (cohort: Cohort) => void;
  clearCohort: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCohortStore = create<CohortState>()((set) => ({
  cohort: null,
  loading: true,
  error: null,

  setCohort: (cohort) => set({ cohort, loading: false, error: null }),
  clearCohort: () => set({ cohort: null, loading: false }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
