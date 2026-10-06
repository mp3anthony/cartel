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

**Menu**:
The hamburger (accessibility label "Menu") opening a popover of Home, Lists, Stores, History and Household. The dashboard is called "Home" here. Decided in #109 (not built yet): the Household item becomes "Settings", see `household.md`. Decided in #139 (not built yet): the hamburger is slated to be replaced by a floating bottom pill nav (Home, Lists, Stores, History) with Settings as a gear at the header's right, see `02-DESIGN-REFERENCE.html`.
_Avoid_: Drawer, sidebar

**Version footer**:
A `v<version> · Live | Preview | Dev` line at the bottom of the Household screen. See `docs/environment.md`. Decided in #109 (not built yet): it moves to a two-line Settings footer, see Settings footer in `household.md`.
_Avoid_: Build stamp, About page

**Feedback**:
The "Report a bug or idea" screen, entered from the floating "Report" pill on the Household screen only. Needs a type (Bug or Feature idea), what is happening, what should happen and the device; name and title are optional. On success a plain "thanks" banner (no issue number); on failure the form is kept. Decided in #109 (not built yet): becomes a single "Report issue" control on Settings with no type choice, see `household.md`.
_Avoid_: Support, contact us, ticket
