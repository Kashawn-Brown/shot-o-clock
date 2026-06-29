// Design tokens — the single source of visual truth for the app.
//
// The palette is built from the brand colors. Navy (#0C1142) is the ink — text,
// dark surfaces, outline buttons, the Shot O'Clock background (the app's "black"
// is Navy). Indigo (#3D2BE8) is the accent — primary actions, active/selected
// states, rings, key moments. Highlight (#9F90FB) is the soft connective tint —
// ring tracks, selected-card fills, accents (fills only, never text on white).
// White is the canvas; neutral grey stays for secondary text and hairline borders.
// Indigo is kept reserved so it reads as emphasis, not wallpaper.
//
// Status colors carry meaning the greyscale can't (Completed vs Missed vs Out).
// The Shot O'Clock screen is the only dark-background surface; its tokens are `shot*`.

export const COLORS = {
  // ─── Base ────────────────────────────────────────────────────────────────
  background: '#ECECEC', // canvas — neutral grey; cards/modals read as raised above it
  surface: '#F5F5F5', // cards, inputs — lighter than the canvas, so they float
  surfaceRaised: '#FFFFFF', // modals, popovers, sheets — lightest, above the dim backdrop
  border: '#E0E0E0',
  textPrimary: '#0C1142', // Navy — the brand ink (was generic #1A1A1A)
  textSecondary: '#666666', // neutral grey (confirmed to stay neutral)

  // Buttons
  buttonFilled: '#0C1142', // Navy — incidental dark surfaces (e.g. join-code card)
  buttonFilledText: '#FFFFFF',
  buttonOutline: 'transparent',
  buttonOutlineBorder: '#0C1142', // Navy — secondary/outline buttons
  buttonOutlineText: '#0C1142', // Navy

  // ─── Status (semantic — survives the monotone phase) ─────────────────────
  success: '#22C55E', // Completed, active players
  warning: '#F59E0B', // waiting states
  danger: '#EF4444', // I'm Out, Missed, Out players
  dangerSurface: '#FEE2E2',
  grace: '#3B82F6', // Grace — distinct blue (Used Grace, grace badges)

  // ─── Shot O'Clock dark screen (only dark surface in the app) ─────────────
  shotBackground: '#0C1142', // Navy — cohesive with the app's other dark surfaces
  shotText: '#FFFFFF',
  shotRing: '#FFFFFF',

  // ─── Brand palette ───────────────────────────────────────────────────────
  // Indigo — primary accent: actions, active/selected states, rings, key moments.
  brandPrimary: '#3D2BE8',
  // Navy — the brand ink: drives textPrimary / dark surfaces / outline buttons /
  // the Shot O'Clock background (all repointed above). The app's "black" is Navy.
  brandNavy: '#0C1142',
  // Highlight — soft connective tint: ring tracks, selected-card fills, accents.
  // Fills/tints only, never text on white (too light).
  brandHighlight: '#9F90FB',
  // Highlight-soft — flat, paler Highlight for selected-card / subtle-surface
  // backgrounds (derived; the design doc locks only #9F90FB).
  brandHighlightSoft: '#F0EEFE',
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
