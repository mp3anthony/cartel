/**
 * Design tokens — the single source of every visual value in the app.
 *
 * The palette was chosen in Slice 1 against real screens, as 02-DESIGN-REFERENCE.md
 * required. Burnt orange (light) / gold (dark) carries every emphasis in the app:
 * there is deliberately only one accent per theme, so anything that wants to stand
 * out competes for the same slot rather than adding a colour — the "one accent" rule
 * holds independently within each theme, not just across the app as a whole.
 *
 * Contrast ratios for the light palette are measured, not estimated, and written as
 * white/ground — text sits on both surfaces, and the warm ground is always the
 * weaker of the two, so it is the number that decides whether a pairing passes.
 * Every one clears the 4.5:1 AA body-text baseline on both. The dark palette (#26)
 * was measured the same way (real WCAG relative-luminance formula, surface/ground
 * pairing) and is locked as-approved — do not alter its values. Re-measure if any
 * value in either palette changes.
 */

export type Palette = {
  ground: string;
  surface: string;
  surfaceSunken: string;
  border: string;
  accent: string;
  accentPressed: string;
  accentWash: string;
  accentContrast: string;
  textPrimary: string;
  textSecondary: string;
  positive: string;
  negative: string;
};

const lightPalette: Palette = {
  ground: '#FAF6F1',
  surface: '#FFFFFF',
  surfaceSunken: '#F2EBE3',
  border: '#E7DCD0',

  /** The one accent. 5.18:1 on white, 4.81:1 on ground. */
  accent: '#C2410C',
  /** Pressed state. 7.32:1 — deliberately darker, not just a tint shift. */
  accentPressed: '#9A340A',
  /** Pale accent wash for selected rows and quiet emphasis. Never bears text. */
  accentWash: '#FCEDE6',
  /** White on `accent` is the same 5.18:1, inverted. */
  accentContrast: '#FFFFFF',

  /** 15.40:1 on white, 14.31:1 on ground. */
  textPrimary: '#2B2320',
  /** 6.33:1 on white, 5.88:1 on ground — AA for body text, not merely large. */
  textSecondary: '#6B5D54',

  /** 5.99:1 on white, 5.57:1 on ground. */
  positive: '#2F6F4E',
  /** 7.06:1 on white, 6.56:1 on ground. */
  negative: '#A32E24',
};

/** Dark palette — exact values from issue #26, already measured for WCAG AA.
 * Do not alter. Two deliberate inversions from the light side, both intentional:
 * `accentContrast` is dark ink (`#15110D`), not white — white on this gold
 * measures only 2.42:1 and fails AA. `accentPressed` is *brighter* than
 * `accent`, not darker — the opposite direction from light mode — because
 * darkening an already-dark-adjacent gold loses legibility fast; this follows
 * Material's dark-theme convention of lightening for pressed/state-layer
 * feedback instead. */
const darkPalette: Palette = {
  ground: '#15110D',
  surface: '#221B15',
  surfaceSunken: '#0F0C09',
  border: '#3D3226',
  accent: '#C9A227',
  accentPressed: '#E6BC3A',
  accentWash: '#2E2612',
  accentContrast: '#15110D',
  textPrimary: '#F2E9DC',
  textSecondary: '#B7A996',
  positive: '#6FBE8B',
  negative: '#E28577',
};

const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
const fontSize = { caption: 13, body: 16, title: 22, display: 30, large: 26 } as const;
const minTouchTarget = 44;
const minTouchTargetLarge = 64;

type Elevation = {
  card: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
};

/** Shadow color is the one value that must NOT simply follow textPrimary in
 * dark mode the way it coincidentally equals it in light mode today —
 * textPrimary is light cream (#F2E9DC) in dark mode, and a shadow tinted
 * with it would render as a glow, not a shadow. Dark mode gets pure black
 * instead; shape/opacity/radius/offset stay identical in both themes. */
function buildElevation(shadowColor: string): Elevation {
  return {
    card: {
      shadowColor,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
  };
}

export type Tokens = {
  color: Palette;
  space: typeof space;
  radius: typeof radius;
  fontSize: typeof fontSize;
  elevation: Elevation;
  minTouchTarget: number;
  minTouchTargetLarge: number;
};

export const lightTokens: Tokens = {
  color: lightPalette,
  space,
  radius,
  fontSize,
  elevation: buildElevation('#2B2320'),
  minTouchTarget,
  minTouchTargetLarge,
};

export const darkTokens: Tokens = {
  color: darkPalette,
  space,
  radius,
  fontSize,
  elevation: buildElevation('#000000'),
  minTouchTarget,
  minTouchTargetLarge,
};

/** The hamburger popover's full-screen dim (`NavMenu.tsx`). Deliberately
 * theme-invariant, unlike every color above: a modal scrim's job is to dim
 * whatever is behind it, not to carry theme color — Material's own scrim is
 * a fixed near-black in both its light and dark themes. Kept at its
 * pre-existing value (rgb(43,35,32), the light theme's old textPrimary) so
 * this fix is purely architectural — one named, documented home for a value
 * that used to be an untethered literal — with zero visual change. */
export const scrimColor = 'rgba(43, 35, 32, 0.32)';
