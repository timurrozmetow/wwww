// Dark-first palette (CLAUDE.md §6). Kept as plain constants — no theming lib —
// so it stays cheap on low-end devices.
export const colors = {
  bg: '#0b1120',
  bgElevated: '#111a2e',
  card: '#162136',
  border: '#1f2b45',
  primary: '#3b82f6',
  primaryPressed: '#2563eb',
  accent: '#22d3ee',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;
