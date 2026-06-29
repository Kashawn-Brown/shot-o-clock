// Design tokens — the single source of visual truth for the app.
//
// The base palette is monotone (black / white / grey). Brand Indigo
// (`brandPrimary`, #3D2BE8 — sampled from the primary mark) is reserved for
// specific moments only: primary actions, active/selected states, the timer
// ring, and the Shot O'Clock moment. Everything else stays neutral, so the brand
// color reads as emphasis rather than decoration.
//
// Status colors carry meaning the greyscale can't (Completed vs Missed vs Out).
// The Shot O'Clock screen is the only dark-background surface; its tokens are `shot*`.

export const COLORS = {
  // ─── Base ────────────────────────────────────────────────────────────────
  background: '#FFFFFF',
  surface: '#F5F5F5', // cards, input backgrounds
  border: '#E0E0E0',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',

  // Buttons
  buttonFilled: '#1A1A1A',
  buttonFilledText: '#FFFFFF',
  buttonOutline: 'transparent',
  buttonOutlineBorder: '#1A1A1A',
  buttonOutlineText: '#1A1A1A',

  // ─── Status (semantic — survives the monotone phase) ─────────────────────
  success: '#22C55E', // Completed, active players
  warning: '#F59E0B', // waiting states
  danger: '#EF4444', // I'm Out, Missed, Out players
  dangerSurface: '#FEE2E2',
  grace: '#3B82F6', // Grace — distinct blue (Used Grace, grace badges)

  // ─── Shot O'Clock dark screen (only dark surface in the app) ─────────────
  shotBackground: '#000000',
  shotText: '#FFFFFF',
  shotRing: '#FFFFFF',

  // ─── Brand — Indigo, reserved for primary actions / active states / rings ─
  // Sampled from logo/shot-oclock-mark-primary-transparent-navy.png; matches the
  // locked design-doc token. buttonFilled (#1A1A1A) stays the neutral dark-fill
  // for incidental surfaces (e.g. the join-code card).
  brandPrimary: '#3D2BE8',
} as const;

export const FONT_SIZE = {
  xl: 48, // big countdown number
  lg: 32, // "SHOT O'CLOCK" text
  md: 18,
  sm: 14,
  xs: 12,
  custom_1: 20, // custom font size
  custom_2: 24, // custom font size
  custom_3: 16, // custom font size
} as const;

export const FONT_WEIGHT = {
  bold: '700',
  medium: '500',
  regular: '400',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999, // pill buttons
} as const;
