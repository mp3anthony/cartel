# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-11, end of session 47)

- **Session 47: #148 SHIPPED (PR #203, 0.0.60, merged).** Item catalog now has compact rows, an edit icon with an inline editor, a "Proposed: X" line with a check, and grouped sections (leading capital only, no schema change). Reviewer clean. Not exercised: 375px row height with several proposals, icon geometry, folded-name display ("Iphone cable", "Jalapeno"), any iPhone check. Known, unfixed: a failed refresh after a successful vote turns the whole catalog into an error note with no retry (same as Shopping Mode).
- **Plans for #147 and #149 were independently reviewed; findings are posted as comments on each issue** ([#147](https://github.com/mp3anthony/cartel/issues/147#issuecomment-6107740260), [#149](https://github.com/mp3anthony/cartel/issues/149#issuecomment-6107740587)). Neither needs an Ant decision or escalates. #147 is sound with five minor fixes. #149 needs changes and must be re-read against merged #148 (which exports `groupCatalog`, `CatalogRow`, `CatalogGroup`; state is `editingItemId`, `finishEditing`, `submitCorrection`/`confirmCorrection`).
- **#110 (Home overhaul) was REOPENED** (label `needs-info`) at Ant's request: Ant is reviewing the shipped Home and wants changes. Next step is a grill-with-docs session with Ant (Ant starts it); nothing is built until then.
- **Next slice, one per fresh session** (Code Writer, then a separate reviewer): #149 (fold in its review comment, bump to 0.0.61), then #147 (independent, any time). Ant wants one slice per session to protect context.
- **Decisions settled (also on the issues):** #147 icon label is "View catalog for <store>" and the selected row is outline only; #149 search is item names only, header count shows matches while searching, dot is the accent, one-section stores still start collapsed, no clear button.

## Older state, condensed

- **Session 45 (Home overhaul, #110 DONE):** #144 and #145 merged (0.0.58, 0.0.59); Ant is checking live and raises problems as normal reports. Not exercised in a browser or on an iPhone: swipe row with several shops in progress (web scroll-snap; native `snapToInterval` untested), Stores row and tiles at 375px, motion, expand/collapse, whether rings/donut refill when returning to Home from Lists (motion should play once per mount), Reduce Motion. Reviewer nits, unfixed: hero "New list" only navigates to Lists (does not open the composer); the Nearby chip disappears while checking so the button row shifts; `HomeGraphs` bucket windows memoised on `completedAt` only (stale across a Monday/month boundary); "last 8 weeks" includes the current partial week; opening a detail card does not move screen-reader focus; Home has no banner slot (matters for #103's confirmation). Impact notes were posted on #103, #147, #148, #149 and #114 (the Home `StoresRow` is separate from the Stores screen row; Pending corrections now live only in the Store's Item catalog; #103 should land on the rewritten `DashboardScreen`).

- **#109 Settings is DONE (0.0.57, PR #194, session 44).** The Household screen is now **Settings** (always-registered route, alias `household`; `HouseholdSetup` is a drill-down registered only without a household). One standard Report issue form (Device/OS auto-captured, `from-app` label only). `report-feedback` Edge Function is in production as v5 (accepts `report`, legacy `bug`/`feature`, `store_missing`); rollback is redeploying the previous `index.ts` from git. Not exercised: joining a household, the in-household Settings state (member count, refresh icon, invite code), any iPhone layout check. Reviewer's low notes, unfixed: a failed `reload` superseding a successful `refresh` could leave a stale view (hard to trigger); `runReload` sets state after unmount (harmless); a missing or unknown report type returns "Unknown report type." (still 400); stale "household screen" comment at `ListDetailScreen.tsx:221`.
- **Session 43 (/doctor cleanup, docs-only):** Antigravity retired; all subagents are Claude (Planner = Opus `planner` agent).
- **#106 is CLOSED (2026-10-11), with #155.** Slices 1 to 4b merged (0.0.51 to 0.0.56) and applied to production; decisions D5, D6, D11, D13 are at https://github.com/mp3anthony/cartel/issues/106#issuecomment-6094235636 and results at comment 6103553797. The 4b apply matched the dry run (tags 54 to 53; 4 rewritten; `Dali` on "pies" at PAK'nSAVE Papanui cleared, to be re-tagged from Shopping Mode; 1 vote deleted). All S4 RLS tests passed and rolled back; `supabase/rollback/106_c2_revert.sql` dry run OK (the 4a revert no longer works). Backup stays in schema `migration_106`; drop it after 2026-11-10. Ant tests live and raises problems as normal reports, which intake links back to #106 or reopens.
- **Process (2026-10-11):** testing no longer blocks PRs; no test checklists (rules in `CLAUDE.md`). The orchestrator applies all migrations; see `docs/environment.md` for when Ant's "go" is needed. `.claude/settings.local.json` holds the Supabase MCP allow rule; it is git-ignored and must never be committed.
- **Shipped and closed:** #110 Home overhaul (#144/#145, 0.0.58-0.0.59), #143 content-sized buttons (0.0.46), #167 Back to stale list (0.0.50; lesson in `docs/lessons.md`), #158 floating pill nav and parent #139 HS house style (0.0.49), #157 circular back button (0.0.48), #156 pill buttons (0.0.47), #111 item quantity (0.0.44/0.0.45), #107 Stores read-only (0.0.43, ADR 0007), #117 (0.0.41), #94 (0.0.40). Details are in the issues, PRs and `docs/lessons.md`.
- **Grilled and settled, not built (decisions on the issues and in `docs/context/`):**
  - #112 Shopping order: parent with #153 (fixed layout order) and #154 (Item location picker; touches `report-feedback`: keep the legacy `bug`/`feature` branch, rebase onto 0.0.57+). #151 (learned walking order) is parked and needs its own grill.
  - #114 Item catalog redesign: parent with #147, #148, #149 (149 builds on 148). Plans written in session 46, awaiting review (see Current state). #103 also touches screens; whichever lands second rebases.
  - #139 sub-issues are all shipped. `02-DESIGN-REFERENCE.html` is the design source (see `docs/environment.md`).
- **Logged in `CHANGE-LOG.md` as `pending` out-of-spec, for Ant to triage:** members adding a first name or nickname, renaming a household, category and spending graphs.
- Ant wants parent issue plus sub-issues as the default way to slice.
- **Open nits, deliberately skipped:** #158 (History label tight at 375px, links Tab-focusable while the pill is hidden, ring pops in after Feedback); #111 (bump note shows the success tick, can go stale after a stepper tap, survives Finish and Reset in Shopping Mode; a narrow refetch flicker window; `writeShown` missing from an effect's deps; each tap bumps `lists.last_activity_at`, so lists reload per tap); #107 (Store missing reports are public GitHub issues, no rate limit on that path, a stale comment at `supabase/tests/rls_location_items.sql:23` naming the dropped `locations_insert_own`, possibly stale `LocationsScreen.tsx` header comments). #107 scenario 1 (real GPS nearby) and a 0.0.43 smoke check were never run; run the S4 tests (all roll back) before relying on them. #117 follow-ups: no iPhone check, no Try again on the household screen, first failing query unverified (watch `[cartel:postgrest-retry]`).
- iOS permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native only). `mobile/package-lock.json` still says 0.0.36. After a reload or deep link, Back goes to Home. Dev console shows React DOM warnings for `accessible` and `importantForAccessibility` on SVG icons (existing pattern). Ticket #123 (drag auto-scroll near the edge on long lists) needs an iPhone check; Ant mentioned an unlogged lag issue and will log it himself.
- `main` is at 0.0.60 (`mobile/app.json`); Vercel deploy not confirmed. Production holds real user data.
- **Test data left on the shared Supabase project (anonymous, inert):** list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`, Woolworths Northlands, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33`, plus one earlier empty anonymous user) and list "ZZ test 111" (`5a348252-1488-4cf2-9d02-a904ba20546a`, Milk at x5, personal, no store; may have extra rows). Cleanup by id only, never a blanket wipe.

## Blocking order

Can start now:

1. Build #149 (plan reviewed; fold in review fixes, re-read against merged #148), then #147 any time. Grill Home changes on reopened #110 with Ant. Plan #153, then #154 (after #153; may rebase onto #148). Grill #151 (parked, Ant's call when).
2. #103 (unblocked now the Home work has landed; confirm the exact ordering with Ant when picking it up).
3. #123 (low priority, whenever).

Then:

4. #90 (Leave household goes in the Settings Household section). Stops at the plan for Ant (RLS, deleting a household).

Collisions: #103 touches `ListDetailScreen` and `DashboardScreen`; whichever lands second rebases onto the drag-handle row, the quantity control, the new wording and the rewritten Home. #103 and the #114 work touch navigation and screens; whichever lands later rebases onto Settings (#109) and the new Home.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.html`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`.
