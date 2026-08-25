export const colors = {
  bg: '#0F1B2D',
  surface: '#17263B',
  surfaceRaised: '#1E3049',
  border: '#2A3D57',
  text: '#F4F7FB',
  textMuted: '#94A3B8',
  // Lightened from #64748B, which rendered at 3.21:1 on surface — below AA, and
  // it carries the affiliate disclosure, an App Store commitment.
  textDim: '#8595A8',

  accent: '#3B9E7A',
  // Dark ink, not white. White on this green measured 3.30:1 — the single most
  // important piece of text in the app, below AA. Darkening the green instead
  // would have dulled the one brand colour; inverting the label keeps it.
  accentText: '#08150F',
  accentDim: '#1F4D3C',

  /** estimated line items and low-confidence flags */
  amber: '#E0A245',
  amberDim: '#4A3617',
  /** confirmed / included line items */
  green: '#4FBF8B',
  greenDim: '#173D2C',
  danger: '#E88472',
  dangerDim: '#4A211B',

  disabled: '#2A3D57',
  disabledText: '#5A6B82',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8 },
} as const;
