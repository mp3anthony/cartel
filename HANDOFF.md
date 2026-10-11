# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-11, end of session 42)

- **#106 slice 4b (+ #155) is DONE: applied to production (2026-10-11) with Ant's "go", PR #186 merged (0.0.56), results posted on #106 (comment 6103553797) and #155.** Real run via the Supabase MCP `execute_sql` (the allow rule in `.claude/settings.local.json` works; that file is git-ignored and must never be committed). POST-1 matched the dry run and PRE-1 exactly: tags 54 to 53; 4 rewritten (`15` to Aisle 15, `23` to Aisle 23, `Fruit & Vegetables` to Fruit & Veg, `Meat` to Butchery); 1 cleared (`Dali`, item "pies" at PAK'nSAVE Papanui, to be re-tagged from Shopping Mode); 1 vote deleted (equalled its tag); 0 D6 applied. Vote function is security definer, folds, capitalises, locks, `authenticated` only. `rls_location_item_votes.sql` passed (rolled back; production verified unchanged). Also passed after apply (session 42, all rolled back, production verified unchanged at 53 tags, 0 votes): `item_name_fold_locations.sql`, `rls_location_items.sql`, `rls_location_checkoffs.sql`, and a dry run of `supabase/rollback/106_c2_revert.sql` ("DRY RUN OK"; the 4a revert no longer works). Backup stays in schema `migration_106`; drop it 30 days after C2 (after 2026-11-10).
- **Process change (2026-10-11, session 41):** testing no longer blocks PRs. Ant tests in the live environment when he likes; clean code PRs are advised "clean to merge" and labelled `needs-merge-approval` for Ant; no test checklists on issues or PRs (plain-language "what it is for / what is being done" instead); `needs-manual-test` disabled except long multi-issue PRs; a subagent checks `CONTEXT-MAP.md` and prior issues on intake so related reports join or reopen older issues. Rules are in `CLAUDE.md`.
- **#106 is CLOSED (2026-10-11).** Ant dropped the iPhone check list: he tests live as he goes and raises problems as normal reports, which intake links back to #106 or reopens. #155 is closed too.
- **Authority (widened 2026-10-11, `docs/environment.md` line 19):** the orchestrator applies ALL migrations via the Supabase MCP, following the runbook. Ant's "go" is needed only for migrations touching a locked invariant, RLS or security policy, or deleting or rewriting user data; all others proceed after a clean dry run.
- Slices 1 (0.0.51, PR #174), 2a (0.0.52, PR #177), 2b (0.0.53, PR #179), 3 (0.0.54, PR #181), 4a (0.0.55, PR #184) and 4b (0.0.56, PR #186) are merged and applied. Decisions D5 (oldest tag), D6 (apply at 2 voters, then clear), D11, D13: https://github.com/mp3anthony/cartel/issues/106#issuecomment-6094235636. No `03-SPEC.md` section was active.

## Older state, condensed

- **Shipped and closed:** #167 Back to stale list (0.0.50, PR #171; lesson in `docs/lessons.md`), #158 floating pill nav and parent #139 HS house style (0.0.49), #157 circular back button (0.0.48), #156 pill buttons (0.0.47), #143 content-sized buttons (0.0.46), #111 item quantity (0.0.44/0.0.45), #107 Stores read-only (0.0.43, ADR 0007), #117 (0.0.41), #94 (0.0.40). Details are in the issues, PRs and `docs/lessons.md`.
- **Grilled and settled, not built (decisions on the issues and in `docs/context/`):**
  - #109 Household screen becomes Settings; the Planner stops at the plan for Ant (changes the deployed `report-feedback` Edge Function). Build to-dos are in a comment on #109.
  - #110 Home overhaul: parent with sub-issues #143 (done), #144 (blocked by #143's merge, now unblocked), #145 (after #144). Each stops at the Planner.
  - #112 Shopping order: parent with #153 (fixed layout order), #154 (Item location picker; touches `report-feedback`, so rebase against #109 whichever lands second), #155 (production label migration; plan done, inside the #106 4b plan, ships in 4b). #151 (learned walking order) is parked and needs its own grill.
  - #114 Item catalog redesign: parent with #147, #148, #149 (149 builds on 148). #147 and #148 may rebase onto #143.
  - #139 sub-issues are all shipped. `02-DESIGN-REFERENCE.html` is the design source (see `docs/environment.md`).
- **Logged in `CHANGE-LOG.md` as `pending` out-of-spec, for Ant to triage:** members adding a first name or nickname, renaming a household, category and spending graphs.
- Ant wants parent issue plus sub-issues as the default way to slice.
- **Open nits, deliberately skipped:** #158 (History label tight at 375px, links Tab-focusable while the pill is hidden, ring pops in after Feedback); #111 (bump note shows the success tick, can go stale after a stepper tap, survives Finish and Reset in Shopping Mode; a narrow refetch flicker window; `writeShown` missing from an effect's deps; each tap bumps `lists.last_activity_at`, so lists reload per tap); #107 (Store missing reports are public GitHub issues, no rate limit on that path, a stale comment at `supabase/tests/rls_location_items.sql:23` naming the dropped `locations_insert_own`, possibly stale `LocationsScreen.tsx` header comments). #107 scenario 1 (real GPS nearby) and a 0.0.43 smoke check were never run; run the S4 tests (all roll back) before relying on them. #117 follow-ups: no iPhone check, no Try again on the household screen, first failing query unverified (watch `[cartel:postgrest-retry]`).
- iOS permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native only). `mobile/package-lock.json` still says 0.0.36. After a reload or deep link, Back goes to Home. Dev console shows React DOM warnings for `accessible` and `importantForAccessibility` on SVG icons (existing pattern). Ticket #123 (drag auto-scroll near the edge on long lists) needs an iPhone check; Ant mentioned an unlogged lag issue and will log it himself.
- `main` is at 0.0.56 (`mobile/app.json`) and matches production. Production holds real user data.
- **Test data left on the shared Supabase project (anonymous, inert):** list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`, Woolworths Northlands, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33`, plus one earlier empty anonymous user) and list "ZZ test 111" (`5a348252-1488-4cf2-9d02-a904ba20546a`, Milk at x5, personal, no store; may have extra rows). Cleanup by id only, never a blanket wipe.

## Blocking order

Can start now:

1. Plan #109 (grilled).
2. Plan #147, then #148, then #149. Plan #153, then #154 (after #153; may rebase onto #143, #148 and #109). Grill #151 (parked, Ant's call when). #155 shipped in 4b and is closed.
3. #123 (low priority, whenever).

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
