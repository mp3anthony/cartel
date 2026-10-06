# Conventions

Binding build and design-process rules. Vocabulary lives in `docs/context/`; this file is about how to build.

## Document roles

- `01-CRD.md`: what is required, and the constraints on building it. Read once, at spec creation.
- `02-DESIGN-REFERENCE.html`: UI/UX only, anchoring the build to real human design references instead of generic output. Neither it nor the CRD absorbs the other.
- `03-SPEC.md`: generated from the CRD; the build breakdown and technical guardrails. Section 0 holds the locked invariants.
- `CHANGE-LOG.md`: append-only inbox for out-of-spec requests.
- `mobile/src/theme/tokens.ts` is the source of truth for the palette, not the design document. `node scripts/check-design-reference.mjs` checks that every hex in the `.cartel-light` and `.cartel-dark` blocks of `02-DESIGN-REFERENCE.html` matches `tokens.ts` and that every palette hex appears as text in the page body; it does not check the page-chrome `--p-*` values, the shadow values or which token name a quoted hex label sits beside. Run it after changing either file.

## Data and backend

- **Direct table writes under RLS; an RPC only where atomicity demands it.** Lists, items and shop sessions are written straight to the tables. A `security definer` RPC is used when one action must check and write across rows or tables (promotion, correction quorum, `finish_shopping`). Re-derive this per slice; never copy the direct-write pattern onto a slice with an atomicity invariant.
- **`deleted_at`, `archived_at` and `recorded_at` never appear in RLS.** Soft delete is filtered in the client; `archived_at` stays unused as the #89 reversal key; `recorded_at` is server-maintained. Realtime authorises each event against the SELECT policy on the new row, so a policy mentioning any of them would hide the very UPDATE that changes it.
- **`lists.last_activity_at` is server-maintained by triggers; the client never writes it.** It and `archived_at` are also null-forced or server-set on insert by trigger, because the table-level INSERT grant would otherwise let a client set them.
- **Realtime publication membership is per table.** Only tables the client subscribes to are added; the rest load on mount and refresh after a write (see `docs/environment.md`).
- **No schema nothing reads.** Do not add a column or table until code uses it. A stored `list_items.location_tag_id` was rejected: "is this tagged, and to what" is a live lookup by location and normalised item name.
- **Small closed sets are text plus a check constraint**, not Postgres enums. New nullable timestamps follow the `checked_at` / `deleted_at` idiom, not status enums.
- **Shared tables get household-equal DELETE policies** that reuse the SELECT predicate, never owner-only. `locations` has an open UPDATE grant on the chain column only.
- **Two households racing to tag one item** are arbitrated by the unique key; the loser's `23505` is treated as success and the refresh picks the winner. Correction votes are the opposite: the same voter repeating a vote is rejected (`already_voted`).
- **`attachLocation(client, listId, locationId)`** covers attach, change and detach (null detaches); there is no separate detach function.
- **Sorting is read-time.** `position` is a fractional key; check-off never writes it, and route order is computed at render.
- **Bulk copy** writes one multi-row insert built by the single private key generator in `lists.ts`, so a failure leaves no partial list.
- **RLS tests** are plain SQL in `supabase/tests/rls_*.sql`, run through the Supabase MCP `execute_sql` against the hosted project. There is no unit-test framework and no mocks: testing is those assertions plus live-browser and live-deploy verification.
- **`humanise()` must map every new RPC exception code** (for example `already_finished`, `nothing_checked`, `no_location`) or raw strings leak to users.

## Client

- **Re-entry guards use a ref** (`mutatingRef`, `busyRef`, `writingRef`), set synchronously and cleared in `finally` on every exit path, never a batched-state check. Shopping Mode keeps a per-row pending `Set` so one slow check-off never blocks another; an item not yet inserted gets its own guard.
- **"Keep typing" composers** use `blurOnSubmit={false}` and are never `editable={!busy}` (that blurs the field and closes the iOS keyboard). One-shot dialog fields may freeze while busy. `submitBehavior` is dropped on web.
- **Stale-write guard:** when an async write resolves, close or clear the editor only if the edited item is still the one the write was for.
- **Touch targets are at least 44pt** (`minTouchTarget`), and larger in Shopping Mode (`minTouchTargetLarge`, `fontSize.large`, used there only). `hitSlop` does nothing on react-native-web; use real padding or `minHeight` with a negative margin so layout does not grow.
- **Components:** merge a caller's `style` into the input, never spread props after it. A labelled action beside a row is a sibling of the row, not nested in its trailing slot. Shared primitives are not widened for one caller; compose locally until a second caller exists. Use the `Select` dropdown for type pickers and `SegmentedControl` only for three or fewer short choices.
- **Button width** (decided in #110, built in #143): content-sized by default (`PrimaryButton`/`SecondaryButton` take `fullWidth`; `ButtonRow` holds side-by-side pairs). Full-width only for the main action of a screen-level form and irreversible commit steps; anything inside a card or an in-place editor is content-sized. Rule and reasoning in `02-DESIGN-REFERENCE.html`.
- **Press feedback** (decided and built in #156): scale and accent fill on press come only from `theme/motion.ts` (`pressScale`, `pressFill`, `pressScaleFill`, `useReduceMotion`); never hand-roll a transition. Rows, check controls and cards are excluded (they keep the pressed tint). No accent fill on focus on web (a focus fill can stick after a tap in iOS Safari). Transition values are strings with units because react-native-web passes them to the DOM as CSS; native gets only the scale.
- **Banners render in-flow** (react-native-web has no `Alert`); confirmations that must not be missed do not auto-dismiss; dismiss labels name their target.
- **Shopping Mode check-off** overlays a map of requested states and lets the Realtime echo reconcile; the reconcile effect reads pending state through a ref.
- **Screens reached with and without a list to attach to** use one `handleSelect`; do not add a second selection mechanism.
- **Navigation** is React Navigation with a hamburger `NavMenu`. The household is one route registered as either `Household` or `HouseholdSetup`, never both. The back circle (#157) is wired once via `headerLeft` in `App.tsx` `screenOptions`, gated by `isDrillDown(route)`; `headerLeft: () => null` elsewhere hides the web fallback chevron. Back is `goBack()` with a Dashboard fallback for an empty stack. To return to a screen already in the stack use `popTo`, not `navigate` (React Navigation 7 `navigate` pushes a duplicate). Any native-stack option not in `@react-navigation/elements` is suspect on web (unverified).
- **The dashboard nearby-store check is passive:** a button, never an automatic location prompt on mount.
- **Crash recovery:** one error boundary wraps the bootstrapped app only; retries are manual; diagnostics go through `logDiagnostic` (console, `[cartel:<scope>]` prefix), with no telemetry service.
- **Destructive clear-all** uses an always-true filter (`.not('id','is',null)`) and leans on RLS to bound the rows; never a bare unfiltered delete.
- **PWA chrome:** Expo web has no config-driven touch icon or manifest, so `mobile/public/{index.html,manifest.json,icon.png}` are hand-maintained. A comment in `index.html` must never spell the closing head tag literally (the build injects the favicon link by string replace).

## Design foundation procedure

`02-DESIGN-REFERENCE.html` is the floor, not the ceiling. Before invoking a UI-generating skill, MCP or subagent, load it and pass the foundation into the brief; never let a tool guess the design system. Delegated design briefs carry it via `-Files` (`GEMINI-DELEGATION.md`, rule 6). After a tool produces output, check it builds on the foundation rather than replacing it. Foundation-level improvements are surfaced to Ant and amended in `02-DESIGN-REFERENCE.html` before proceeding; no silent drift.

The orchestrator does live-browser checks itself: a background subagent cannot reach the Browser pane.

## Standing constraints

- **Palette locked:** one accent (burnt orange in light, gold in dark); measured contrast in `mobile/src/theme/tokens.ts`. No hardcoded colours in components; chain colours live in `chainColors.ts`.
- **v1 is supermarkets only,** in the data model and UI.
- **Sync is real-time,** not pull-to-refresh, for any shared household data.
- **Tested surface is iPhone Safari** (web and PWA). Never write Android steps.
- **Never commit to `main`.**
- **Feedback screenshots** accept JPEG, PNG and WebP up to 8 MB (chosen by an agent, not confirmed with Ant); library picker only.
- **Versioning:** `mobile/app.json` `expo.version` is the source, `mobile/package.json` kept in step, patch +0.0.1 per code PR and inside that PR. Docs-only PRs do not bump.
- **GitHub auto-closes issues** on a close keyword before `#N` in a commit message (closes, fixes, resolves); avoid them when only referencing.
- **Re-check a ticket's `ready-for-agent` / `ready-for-human` label** against the CRD, design reference and spec before starting; run Problem Agreement only when a genuine open question remains.
