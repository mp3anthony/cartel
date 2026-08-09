# Design Reference — Cartel

> Filled in 2026-08-09, before Slice 1, deliberately — so early screens don't set
> visual conventions ad hoc. Reference images live in `design-refs/`, supplied by
> the client. They are look-and-feel references only, not products to copy.

## Reference sites/apps

1. **Light task-manager concept** — `design-refs/01-ghozi-light-tasks.jpeg` — take:
   the overall register. Soft-shadowed rounded cards on an off-white ground, one
   saturated accent colour carrying all emphasis (selected chip, active card,
   primary button), everything else near-neutral. Full-width primary CTA at the
   bottom of a form. Filter chips as a horizontal pill row. This is the closest
   single match to the agreed tone and should win ties.

2. **Pastel to-do concept** — `design-refs/02-pathum-todo.jpeg` — take: the list-row
   anatomy. A coloured icon chip on the left, label, circular check target on the
   right, one row per item with generous vertical padding. The per-item colour chip
   is the mechanism for showing an item's store section/aisle once route learning
   exists — colour carries grouping without adding a second column of text.

3. **Pastel gradient concept** — `design-refs/03-pastel-gradient.jpeg` — take:
   *only* the soft gradient/blob treatment, and only for empty states, onboarding,
   and the household-invite screen. Do not let gradients into list or shopping
   surfaces, where they cost legibility.

4. **Dark neon + dark illustration concepts** —
   `design-refs/04-avoid-dark-neon.jpeg`, `design-refs/05-avoid-dark-illustration.png`
   — **anti-references.** Supplied but rejected: neon glow accents, dark-first
   palette, and illustration-heavy onboarding are not the direction. One motif is
   kept: the **ring/donut progress indicator**, a candidate for showing shop or
   list completion. Take the shape, not the styling.

## Tone

- Feel: **warm and friendly.** Rounded geometry, soft shadows over hard borders,
  approachable copy. Human, not clinical; friendly, not childish.
- Explicitly avoid:
  - Neon/glow accents and dark-first theming (see anti-references above).
  - Illustration-led onboarding — the app should be usable before it is explained.
  - Gradients on any list or shopping surface.
  - Dense, information-heavy dashboards. Cartel is a list, not an analytics tool.

## Glanceability (Shopping Mode only)

Agreed constraint: the mid-aisle, one-handed, in-a-hurry case governs **Shopping
Mode alone** (Slice 5 onward). List-building and setup screens are free to be more
considered.

In Shopping Mode: larger type, higher contrast, oversized check targets, minimal
decoration. Elsewhere: standard mobile sizing and the warmer treatment above.
This is a deliberate split, not an inconsistency — the two contexts have different
jobs, and Shopping Mode's job is legibility at arm's length while distracted.

## Constraints

- **Brand assets:** none. Cartel starts fresh — no logo, palette, or type
  commitment exists.
- **Palette: LOCKED 2026-08-10, during Slice 1.** Chosen against real household
  screens rather than in the abstract, as intended. Values live in
  `mobile/src/theme/tokens.ts` — that file is the source of truth, not this one.
  - Accent: **burnt orange `#C2410C`**, 5.2:1 on white. Terracotta and olive were
    the alternatives; olive lost because its neutrals drift cool, and terracotta
    lost to reference 1 being the stated tie-breaker. Burnt orange is also the
    loudest of the three, which suits Shopping Mode more than list-building — worth
    re-checking when Slice 5 lands.
  - Ground `#FAF6F1`, warm neutrals, one accent carrying all emphasis. Light-only:
    `userInterfaceStyle` is `light` and there is no dark palette.
  - Original directional constraints, all met: light ground, single saturated
    accent, warm rather than cool neutrals, nothing in the neon register.
  *(Amended 2026-08-09, after Slice 0 was split out:* the theme provider and token
  file are built in Slice 0 with **provisional** values, so no screen ever hardcodes
  a colour. Choosing the real values stays Slice 1 work — plumbing early, palette
  late, because picking colours with no screens to judge them against is guessing.)
- **Accessibility (baseline, revisit if it bites):** WCAG AA contrast (4.5:1 body,
  3:1 large text); touch targets ≥44pt, larger in Shopping Mode; never encode
  meaning in colour alone — the section-colour chip from reference 2 always needs a
  text or icon partner; respect OS dynamic type and reduce-motion, the latter
  mattering because drag-to-reorder and animated transitions are v1 requirements
  per `01-CRD.md`.
