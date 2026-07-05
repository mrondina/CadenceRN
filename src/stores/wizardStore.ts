import { create } from 'zustand';
import type { Cohort } from '@/domain/types';

interface WizardState {
  draft: Cohort | null;
  setDraft: (cohort: Cohort) => void;
  clearDraft: () => void;
}

export const useWizardStore = create<WizardState>()((set) => ({
  draft: null,
  setDraft: (cohort) => set({ draft: cohort }),
  clearDraft: () => set({ draft: null }),
}));
