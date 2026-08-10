/**
 * Design tokens — the single source of every visual value in the app.
 *
 * The palette was chosen in Slice 1 against real screens, as 02-DESIGN-REFERENCE.md
 * required. Burnt orange carries every emphasis in the app: there is deliberately
 * only one accent, so anything that wants to stand out competes for the same slot
 * rather than adding a colour.
 *
 * Contrast ratios below are measured, not estimated, and written as white/ground —
 * text sits on both surfaces, and the warm ground is always the weaker of the two,
 * so it is the number that decides whether a pairing passes. Every one clears the
 * 4.5:1 AA body-text baseline on both. Re-measure if any value here changes.
 */

export const tokens = {
  color: {
    /** Warm off-white. The ground everywhere — the app is light-only. */
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
    /** Shopping Mode's item text only. Clears the ~24px "large text" WCAG 3:1
     * contrast threshold per 02-DESIGN-REFERENCE.md's Glanceability section. */
    large: 26,
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

  /** Design reference sets 44pt as the floor for every ordinary control. */
  minTouchTarget: 44,
  /** Shopping Mode only — Material Design's "large touch target" tier, for the
   * oversized check-off rows a user taps while walking and not looking closely. */
  minTouchTargetLarge: 64,
} as const;

export type Tokens = typeof tokens;
