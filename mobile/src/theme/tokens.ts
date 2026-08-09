/**
 * Design tokens — the single source of every visual value in the app.
 *
 * The colour values here are PROVISIONAL and chosen to be replaced. Per
 * 02-DESIGN-REFERENCE.md the real palette is picked in Slice 1, against actual
 * screens, because choosing colours with nothing to judge them against is guessing.
 * What this file locks in early is the plumbing, so that no screen ever hardcodes a
 * value and swapping the palette later is an edit to one file rather than a hunt.
 *
 * The values below do respect the directional constraints that ARE settled: a light
 * ground, warm rather than cool neutrals, a single saturated accent carrying all
 * emphasis, and nothing in the neon register.
 */

export const tokens = {
  color: {
    ground: '#FAF6F1',
    surface: '#FFFFFF',
    surfaceSunken: '#F2EBE3',
    border: '#E7DCD0',

    /** The one accent. Emphasis anywhere in the app resolves to this. */
    accent: '#C2410C',
    accentContrast: '#FFFFFF',

    textPrimary: '#2B2320',
    textSecondary: '#6B5D54',

    positive: '#2F6F4E',
    negative: '#A32E24',
  },

  space: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  radius: {
    sm: 8,
    md: 14,
    lg: 20,
    pill: 999,
  },

  fontSize: {
    caption: 13,
    body: 16,
    title: 22,
    display: 30,
  },

  /**
   * Soft shadows over hard borders is a stated tone requirement, so the elevation
   * treatment is a token rather than a per-component decision. iOS and Android read
   * different keys off the same object.
   */
  elevation: {
    card: {
      shadowColor: '#2B2320',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
  },

  /** Design reference sets 44pt as the floor; Shopping Mode raises it in Slice 5. */
  minTouchTarget: 44,
} as const;

export type Tokens = typeof tokens;
