# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-10, end of session 39)

- **#106 slice 4a is APPLIED to production (2026-10-10, Ant said go); PR #184 is OPEN and must NOT be merged yet.** PR https://github.com/mp3anthony/cartel/pull/184 (branch `feat/106-slice-4a-location-fold`, 0.0.55). Real run: 54 tags, 0 merges, 1 re-key (`rylee’s bars` to `rylee's bars`), 1 vote unchanged, 0 check-offs changed, 3 dropped constraints logged, all built-in assertions passed. POST-1 clean (new fold CHECKs, cascading FK, `location_items_tidy` enabled, API roles cannot read `migration_106`). Test files run and passing (they roll back, nothing left behind): `item_name_fold_locations`, `rls_location_items`, `rls_location_item_votes`, `rls_location_checkoffs`. NOT run: `item_name_fold`, `item_name_fold_lists`, `rls_item_quantity`, `rls_finish_shopping` (judged unaffected). The run results are NOT yet posted on #106. It was sent via the Supabase MCP `execute_sql` as one transaction, file comments stripped.
- **Next step: fix the revert script, then merge.** A Sonnet review of `supabase/rollback/106_location_items_revert.sql` found the undo FAILS (whole revert rolls back, 23514) once anyone has added a tag, vote or check-off after the run: post-run rows keep their folded spelling (e.g. a new tag "Bread"), and re-adding the old `lower(btrim)` CHECKs validates them (lines ~284, 292-297, final check ~325-330). The a579c73 ordering fix itself is correct. Fix (Code Writer in a new session, then a separate Sonnet re-review): in step 3 lowercase and btrim post-run rows that are not in the backup (`location_items.name`, `location_item_votes.item_name`, `location_checkoffs.item_names`), dropping duplicates on unique collisions, before the repoint logic and before step 4. Alternative: state in the header that the undo only works before any post-run writes (Ant leans to the fix). Then dry-run the revert once on production (uncomment its `cartel.dry_run` line; expect `DRY RUN OK, rolled back: revert would succeed`), merge PR #184 (it also carries the `docs/environment.md` line 19 edit), post the real-run results on #106, then Ant runs the iPhone checklist (issue comment 6095309812, with review corrections 2 and 3 applied). The live app is unaffected; only the undo is at risk.
- **Authority:** Ant authorised the orchestrator (2026-10-10, in chat) to apply the #106 slice 4a and 4b migrations to production via the Supabase MCP after a clean dry run and an explicit "go" from Ant at each real run. `docs/environment.md` line 19 records that (in PR #184, not merged yet; used for 4a on 2026-10-10). Ant also asked to widen it to ALL migrations (he is not trained in SQL); the edit was blocked by the permission classifier, so it is NOT done. Ant must add an Edit permission rule for `docs/environment.md` or edit line 19 himself; suggested wording: orchestrator applies migrations via the MCP, following the runbook (pre-flight, rolled-back dry run, real run, post-checks, tests); CLAUDE.md escalation triggers still stop for Ant; migrations that delete or rewrite user data need his explicit "go".
- **#106 slice 4b (+ #155) is PLANNED and REVIEWED, NOT built** (plan https://github.com/mp3anthony/cartel/issues/106#issuecomment-6095309976 and the #155 comment). PRE-0 was run on production by the orchestrator (read-only): 54 tags (49 unchanged, 4 rewritten, 1 cleared), 1 vote (deleted: equals its tag after mapping), 0 D6 tuples. Ant approved the mappings: `15` to Aisle 15, `23` to Aisle 23, `Fruit & Vegetables` to Fruit & Veg, `Meat` to Butchery, `Dali` cleared. Q2-Q5 were put to Ant as recommendations (Q2 clear in C2, Q3 delete unmapped proposals on surviving tags, Q4 yes, Q5 keep case-only corrections applying at once) and he replied that the mappings work; treat Q2-Q5 as confirmed only if he says so, otherwise confirm in one line. The PRE-0 result and these decisions have NOT been posted on #155 yet. 4b must read 4a's merged migration first and is a data-deleting migration, so it needs Ant's "go" at the real run.
- **Not yet run by Ant on iPhone:** slice 3 checklist (add "Milk" then "milk": no second row, quantity 2; "bread" shows "Bread"; rename onto another item's name refused; finish shopping works, History looks right; new list from History copies items without duplicates), the slice 2b 8-scenario checklist (https://github.com/mp3anthony/cartel/issues/106#issuecomment-6093116009) and the six-scenario slice 1 checklist. Ant notes results on #106.
- Slices 1 (0.0.51, PR #174), 2a (0.0.52, PR #177), 2b (0.0.53, PR #179) and 3 (0.0.54, PR #181) are merged and applied; the slice 3 backup is in schema `migration_106` (drop 30 days after C2). Decisions D5 (oldest tag), D6 (apply at 2 voters, then clear), D11, D13: https://github.com/mp3anthony/cartel/issues/106#issuecomment-6094235636. No `03-SPEC.md` section was active.

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
- `main` is at 0.0.54 (`mobile/app.json`); PR #184 (open) will make it 0.0.55. Production schema is already ahead of `main` (slice 4a applied) until #184 merges. Production holds real user data.
- **Test data left on the shared Supabase project (anonymous, inert):** list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`, Woolworths Northlands, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33`, plus one earlier empty anonymous user) and list "ZZ test 111" (`5a348252-1488-4cf2-9d02-a904ba20546a`, Milk at x5, personal, no store; may have extra rows). Cleanup by id only, never a blanket wipe.

## Blocking order

Can start now:

1. **#106**: apply slice 4a (built, dry-run clean, waiting for Ant's "go"), then build slice 4b (planned; PRE-0 done, mappings approved).
2. Plan #109 (grilled).
3. Plan #147, then #148, then #149. Plan #153, then #154 (after #153; may rebase onto #143, #148 and #109). Grill #151 (parked, Ant's call when). #155's plan is inside the 4b plan; it ships in 4b.
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
