# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-10, end of session 36)

- **#106 slice 2b is merged (0.0.53, PR #179).** A rename onto another item's fold is refused in the error note with the editor kept open; typed location corrections are capitalised on the Propose paths (list detail, Shopping Mode, catalog; Confirm untouched); add-item composers set autoCorrect/spellCheck; the `lists.md` markers are dropped and the `locations.md` marker is split. Reviewed clean by a separate Sonnet agent; `tsc` and the parity check OK. In-app browser checks were not run.
- **Not yet run by Ant on iPhone:** the 8-scenario slice 2b checklist (in the plan comment https://github.com/mp3anthony/cartel/issues/106#issuecomment-6093116009) and the six-scenario slice 1 checklist. He notes results on #106. Both are additive; nothing is blocked on them.
- **Next: slice 3 (list-side Migration B) is planned and reviewed, NOT built.** Plan and review corrections: https://github.com/mp3anthony/cartel/issues/106#issuecomment-6093243224. Ant's decisions: https://github.com/mp3anthony/cartel/issues/106#issuecomment-6093247385 (D4 split into B / C1 / C2 confirmed; D7 merge removed-list items too; D8 keep the `migration_106` backup 30 days after C2, no CSV; D9 rule (a); D10 accept; empty-fold names rejected by the tidy trigger; raw Postgres text on a rename clash from old clients accepted; version 0.0.54; write ADR 0008 now, in the same PR).
- **How to start slice 3:** fresh session, brief the Code Writer from the plan. Files: migration `20261010000000_list_items_fold.sql`, checks file, `rollback/106_list_items_revert.sql`, tests `item_name_fold_lists.sql` plus `rls_finish_shopping.sql` fixture updates, docs including ADR 0008 and a `docs/environment.md` bullet. Then a separate Sonnet review (write the plan to a scratchpad file for the reviewer; see `docs/lessons.md`). The index must be named exactly `list_items_live_name_key`.
- **Slice 3 is a production migration Ant applies BY HAND** (PRE-1..4, dry run, real run, POST-1/2, iPhone checklist), only once the Live footer shows 0.0.53. The orchestrator merges the PR only after the real run, so `main` matches production.
- **After slice 3: slices 4a and 4b (C1/C2).** Still-open decisions D5, D6, D11, D13 are needed only for those. Slice 1 docs wait for the later slices, except ADR 0008, which ships with slice 3.
- Slice 1 is applied in production (0.0.51, PR #174); slice 2a merged (0.0.52, PR #177). Data from the slice 1 pre-flight is on #106 (https://github.com/mp3anthony/cartel/issues/106#issuecomment-6090934192): small data set (131 live items, 1 case-only duplicate group), so the merge migrations look low-risk. The v2 plan is https://github.com/mp3anthony/cartel/issues/106#issuecomment-6035970194. No `03-SPEC.md` section was active.

## Older state, condensed

- **Shipped and closed:** #167 Back to stale list (0.0.50, PR #171; lesson in `docs/lessons.md`), #158 floating pill nav and parent #139 HS house style (0.0.49), #157 circular back button (0.0.48), #156 pill buttons (0.0.47), #143 content-sized buttons (0.0.46), #111 item quantity (0.0.44/0.0.45), #107 Stores read-only (0.0.43, ADR 0007), #117 (0.0.41), #94 (0.0.40). Details are in the issues, PRs and `docs/lessons.md`.
- **Grilled and settled, not built (decisions on the issues and in `docs/context/`):**
  - #109 Household screen becomes Settings; the Planner stops at the plan for Ant (changes the deployed `report-feedback` Edge Function). Build to-dos are in a comment on #109.
  - #110 Home overhaul: parent with sub-issues #143 (done), #144 (blocked by #143's merge, now unblocked), #145 (after #144). Each stops at the Planner.
  - #112 Shopping order: parent with #153 (fixed layout order), #154 (Item location picker; touches `report-feedback`, so rebase against #109 whichever lands second), #155 (production label migration; stops at the plan for Ant, needs its own plan, ships inside #106's slice 4b). #151 (learned walking order) is parked and needs its own grill.
  - #114 Item catalog redesign: parent with #147, #148, #149 (149 builds on 148). #147 and #148 may rebase onto #143.
  - #139 sub-issues are all shipped. `02-DESIGN-REFERENCE.html` is the design source (see `docs/environment.md`).
- **Logged in `CHANGE-LOG.md` as `pending` out-of-spec, for Ant to triage:** members adding a first name or nickname, renaming a household, category and spending graphs.
- Ant wants parent issue plus sub-issues as the default way to slice.
- **Open nits, deliberately skipped:** #158 (History label tight at 375px, links Tab-focusable while the pill is hidden, ring pops in after Feedback); #111 (bump note shows the success tick, can go stale after a stepper tap, survives Finish and Reset in Shopping Mode; a narrow refetch flicker window; `writeShown` missing from an effect's deps; each tap bumps `lists.last_activity_at`, so lists reload per tap); #107 (Store missing reports are public GitHub issues, no rate limit on that path, a stale comment at `supabase/tests/rls_location_items.sql:23` naming the dropped `locations_insert_own`, possibly stale `LocationsScreen.tsx` header comments). #107 scenario 1 (real GPS nearby) and a 0.0.43 smoke check were never run; run the S4 tests (all roll back) before relying on them. #117 follow-ups: no iPhone check, no Try again on the household screen, first failing query unverified (watch `[cartel:postgrest-retry]`).
- iOS permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native only). `mobile/package-lock.json` still says 0.0.36. After a reload or deep link, Back goes to Home. Dev console shows React DOM warnings for `accessible` and `importantForAccessibility` on SVG icons (existing pattern). Ticket #123 (drag auto-scroll near the edge on long lists) needs an iPhone check; Ant mentioned an unlogged lag issue and will log it himself.
- `main` is at 0.0.53 (`mobile/app.json`). Production holds real user data.
- **Test data left on the shared Supabase project (anonymous, inert):** list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`, Woolworths Northlands, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33`, plus one earlier empty anonymous user) and list "ZZ test 111" (`5a348252-1488-4cf2-9d02-a904ba20546a`, Milk at x5, personal, no store; may have extra rows). Cleanup by id only, never a blanket wipe.

## Blocking order

Can start now:

1. **#106**: build slice 3 (planned and reviewed; see Current state), then slices 4a and 4b once D5, D6, D11, D13 are answered.
2. Plan #109 (grilled).
3. Plan #147, then #148, then #149. Plan #153, then #154 (after #153; may rebase onto #143, #148 and #109). Grill #151 (parked, Ant's call when). #155 needs its own plan before #106's slice 4b, and ships inside it.
4. #123 (low priority, whenever).

Then:

5. #144 after #143 (merged); #145 after #144.
6. #103 after the Home work lands (confirm the exact ordering with Ant when picking it up).
7. #90, blocked by #109 (needs building) and the Home navigation work. Stops at the plan for Ant (RLS, deleting a household). Its Leave household button moves into the Settings Household section.

Collisions: #103 touches `ListDetailScreen`; whichever lands second rebases onto the drag-handle row, the quantity control and the new wording. #109, #103 and #110 (#144, #145) all touch navigation and screens; whichever lands later rebases.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.html`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
