// Design token source of truth for CadenceRN.
// Direction: calm clinical focus — low visual noise, high legibility, zero gamification.
// All components consume from ThemeContext (light/dark), never import this file directly.

const lightColors = {
  // Core
  ink:        '#1B1F2A',
  inkMuted:   '#5A6072',
  surface:    '#FFFFFF',
  surfaceAlt: '#F5F6F8',
  border:     '#E3E5EA',

  // Brand — medical-adjacent teal-blue
  primary:     '#0E7C86',
  primarySoft: '#E0F2F3',

  // Semantic
  success: '#2E7D5B',
  warning: '#B7791F',  // review-debt building
  danger:  '#B3382C',  // overdue / lapsed / high-alert medication
  info:    '#3556A8',

  // Pillar identity — chip/border use only, never full backgrounds
  pharm:       '#7C3AED',
  procedures:  '#0E7C86',
  terminology: '#B7791F',
  concepts:    '#3556A8',
  dosage:      '#2E7D5B',
} as const;

const darkColors = {
  // Core
  ink:        '#E8EAF0',
  inkMuted:   '#9099AE',
  surface:    '#13161F',
  surfaceAlt: '#1C2030',
  border:     '#2A2F3D',

  // Brand
  primary:     '#14A3B0',
  primarySoft: '#0D3438',

  // Semantic
  success: '#3FAD7B',
  warning: '#D4920A',
  danger:  '#D94F43',
  info:    '#5577D4',

  // Pillar identity
  pharm:       '#9D6BFF',
  procedures:  '#14A3B0',
  terminology: '#D4920A',
  concepts:    '#5577D4',
  dosage:      '#3FAD7B',
} as const;

// Structural type: keys match lightColors, values are strings.
// Lets darkColors (same keys, different literals) satisfy the same interface.
export type ColorTokens = { readonly [K in keyof typeof lightColors]: string };

export const type = {
  family: 'Inter',
  mono:   'IBM Plex Mono',
  scale: { xs: 12, sm: 14, base: 16, lg: 18, xl: 22, xxl: 28 },
} as const;

// Index-based scale: space[1]=4, space[2]=8, space[4]=16, space[6]=32
export const space = [0, 4, 8, 12, 16, 24, 32, 48] as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const minTouchTarget = 44; // pt — WCAG 2.2 minimum

export interface Theme {
  colors: ColorTokens;
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
  minTouchTarget: typeof minTouchTarget;
  isDark: boolean;
}

export const lightTheme: Theme = {
  colors: lightColors,
  type,
  space,
  radius,
  minTouchTarget,
  isDark: false,
};

export const darkTheme: Theme = {
  colors: darkColors,
  type,
  space,
  radius,
  minTouchTarget,
  isDark: true,
};
