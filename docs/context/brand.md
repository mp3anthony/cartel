# Brand

How Cartel looks and sounds, plus the app shell that frames every screen. Colour values live in `mobile/src/theme/tokens.ts` and `mobile/src/theme/chainColors.ts`, never here.

## Language

### Palette and theme

**Burnt orange**:
The light-theme accent, the single accent of the palette.
_Avoid_: Orange, brand red

**Gold**:
The dark-theme accent, paired with the app icon's dark ground.
_Avoid_: Yellow, amber

**Ground**:
The page background colour of each theme. The dark ground is locked to the app icon's dark ground.
_Avoid_: Background colour, canvas

**Theme**:
The Light, Dark or System choice, labelled "Appearance" on the Household screen (decided in #109, not built yet: it becomes a section of Settings, see `household.md`). System follows the device live. Light is the default and the design baseline; Dark is a user option, never the starting point for design. The installed-PWA status bar follows the resolved theme.
_Avoid_: Mode, skin, night mode

**Chain colours**:
Per-chain brand colours used on the dashboard donut and location badges. The same in light and dark, and kept apart from the palette so "one accent only" stays true. The "Other stores" tail of the donut never uses one.
_Avoid_: Store colours, accent variants

### Marks and voice

**App icon**:
A cart with a C monogram and a dotted route, glyph only. The "Cartel" wordmark (in a blackletter face) appears on the splash and in the header, never in the icon.
_Avoid_: Logo (for the icon)

**Voice**:
Warm and friendly: rounded geometry, soft shadows over hard borders, approachable copy. Human, not clinical; friendly, not childish.
_Avoid_: Clinical, childish, playful-quirky

**Anti-references**:
The rejected directions in `02-DESIGN-REFERENCE.html`: neon or glow accents, dark-first theming, illustration-led onboarding, gradients on list or shopping surfaces, and dense analytics-style dashboards. The ring or donut progress shape is the one motif kept. How the Home graphs reconcile with the dashboard rejection (decided in #110, not built yet) is in `02-DESIGN-REFERENCE.html`.
_Avoid_: Competitor styling

### App shell

**Bottom nav**:
The floating pill at the bottom of every screen (built in #158, replacing the hamburger): Home, Lists, Stores, History, with the Settings gear as a separate circle at its right in the same row. The current section is ringed (Settings and Feedback ring nothing). The row hides while the on-screen keyboard is up and in Shopping Mode, which keeps only the back circle. The dashboard is called "Home" here.
_Avoid_: Tab bar, menu, drawer, sidebar

**Settings gear**:
The circular gear button beside the bottom nav, at its right, in the same floating row (accessibility label "Settings"); not a nav link, never ringed. Hides with the bottom nav. Until #109 lands it opens the Household screen (or "Join or create a household" without one); #109 turns that into Settings, see `household.md`.
_Avoid_: Menu, cog

**Back circle**:
The circular chevron button at the header's left, before the wordmark (accessibility label "Back"), built in #157. Shown on drill-down screens only: list detail, Shopping Mode, a Store's item catalog, Feedback, Store missing, and the Stores picker when opened to attach a store to a list. Not on Home, Lists, plain Stores, History or Household (the bottom-nav destinations and the screen behind the gear). It does what the browser Back does.
_Avoid_: Back arrow, back chevron

**Close circle**:
The same ringed circle with an X (label "Close"), for dialogs that need a close control. Built in #157 as a shared component, no caller yet.
_Avoid_: Dismiss button

**Version footer**:
A `v<version> · Live | Preview | Dev` line at the bottom of the Household screen. See `docs/environment.md`. Decided in #109 (not built yet): it moves to a two-line Settings footer, see Settings footer in `household.md`.
_Avoid_: Build stamp, About page

**Feedback**:
The "Report a bug or idea" screen, entered from the floating "Report" pill on the Household screen only. Needs a type (Bug or Feature idea), what is happening, what should happen and the device; name and title are optional. On success a plain "thanks" banner (no issue number); on failure the form is kept. Decided in #109 (not built yet): becomes a single "Report issue" control on Settings with no type choice, see `household.md`.
_Avoid_: Support, contact us, ticket
