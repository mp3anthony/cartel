/**
 * Design tokens — the single source of every visual value in the app.
 *
 * The palette was chosen in Slice 1 against real screens, as 02-DESIGN-REFERENCE.md
 * required. Burnt orange carries every emphasis in the app: there is deliberately
 * only one accent, so anything that wants to stand out competes for the same slot
 * rather than adding a colour.
 *
 * Contrast ratios below are against `surface` (#FFFFFF) unless noted, and exist so
 * the accessibility baseline is checkable rather than assumed.
 */

export const tokens = {
  color: {
    /** Warm off-white. The ground everywhere — the app is light-only. */
    ground: '#FAF6F1',
    surface: '#FFFFFF',
    surfaceSunken: '#F2EBE3',
    border: '#E7DCD0',

    /** The one accent. 5.2:1 on white — passes AA for body text. */
    accent: '#C2410C',
    /** Pressed/hover state for the accent. */
    accentPressed: '#9A340A',
    /** Pale accent wash for selected rows and quiet emphasis. */
    accentWash: '#FCEDE6',
    /** White on `accent` is the same 5.2:1 ratio, inverted. */
    accentContrast: '#FFFFFF',

    /** 13.9:1 on white. */
    textPrimary: '#2B2320',
    /** 5.4:1 on white — AA for body text, not just large. */
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
   * treatment is a token rather than a per-component decision. iOS reads the shadow
   * keys, Android reads `elevation`, and react-native-web synthesises a box-shadow
   * from the former. None of these three paths has been exercised on device yet.
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
