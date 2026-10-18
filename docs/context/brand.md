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
The Light, Dark or System choice, labelled "Appearance" on Settings (see `household.md`). System follows the device live. Light is the default and the design baseline; Dark is a user option, never the starting point for design. The installed-PWA status bar follows the resolved theme.
_Avoid_: Mode, skin, night mode

**Chain colours**:
Per-chain brand colours used on the dashboard donut, the Home Stores row, the stacked "How often you shop" bars and their legend (#215), and location badges. The same in light and dark, and kept apart from the palette so "one accent only" stays true. The "Other stores" tail of the donut never uses one.
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
The floating pill at the bottom of every screen (built in #158, replacing the hamburger): Home, Lists, Stores, History and the Settings gear (icon only) as its last item. The current section is ringed, the gear included on Settings (Feedback rings nothing). The pill hides while the on-screen keyboard is up and in Shopping Mode, which keeps only the back circle. The dashboard is called "Home" here.
_Avoid_: Tab bar, menu, drawer, sidebar

**Settings gear**:
The icon-only fifth item in the bottom nav (accessibility label "Settings"); a nav link like the others, ringed while Settings is open. Hides with the bottom nav. It opens Settings, see `household.md`.
_Avoid_: Menu, cog

**Back circle**:
The circular chevron button at the header's left, before the wordmark (accessibility label "Back"), built in #157. Shown on drill-down screens only: list detail, Shopping Mode, a Store's item catalog, Feedback, Store missing, household setup (reached from Settings), and the Stores picker when opened to attach a store to a list. Not on Home, Lists, plain Stores, History or Settings (the bottom-nav destinations, the gear's screen included). It does what the browser Back does.
_Avoid_: Back arrow, back chevron

**Close circle**:
The same ringed circle with an X (label "Close"), for dialogs that need a close control. Built in #157 as a shared component; first caller is the Home graph pop-ups (#215).
_Avoid_: Dismiss button

**Version footer**:
The Settings footer: two lines, `Cartel. v<version> · Live | Preview | Dev` then the copyright. See `docs/environment.md` and Settings footer in `household.md`.
_Avoid_: Build stamp, About page

**Feedback**:
The "Report issue" screen, entered from the single "Report issue" control on Settings and from the Item location picker's "Missing one? Tell us" link (#154: title "Item location missing" pre-filled and still editable, a cleared title falling back to it, and a read-only "Store: ..." line sent as the report's first line, shown only once the Store's name is known). No type choice and no "what should happen" field; Device / OS is captured automatically; name, title and screenshot are optional. On success a plain "thanks" banner (no issue number); on failure the form is kept. See Report issue in `household.md`.
_Avoid_: Support, contact us, ticket
