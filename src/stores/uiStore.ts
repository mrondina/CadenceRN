import { create } from 'zustand';

// ─── State shape ──────────────────────────────────────────────────────────────

type ActiveTab = 'home' | 'review' | 'forecast' | 'settings';
type ReviewMode = 'idle' | 'active' | 'complete';

interface UIState {
  activeTab: ActiveTab;
  reviewMode: ReviewMode;
  /** Transient toast message; cleared after display. */
  toastMessage: string | null;

  setActiveTab: (tab: ActiveTab) => void;
  setReviewMode: (mode: ReviewMode) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>()((set) => ({
  activeTab: 'home',
  reviewMode: 'idle',
  toastMessage: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setReviewMode: (mode) => set({ reviewMode: mode }),
  showToast: (message) => set({ toastMessage: message }),
  clearToast: () => set({ toastMessage: null }),
}));
