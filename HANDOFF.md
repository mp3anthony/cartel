# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-06, end of session 17)

- **#109 (Household screen becomes Settings) is grilled and settled, not built.** Outcome is on the issue and recorded in `docs/context/household.md` (Settings section, marked decided-but-not-built); PR #140. Next step is the Planner, which stops at the plan for Ant because it changes the deployed `report-feedback` Edge Function. Build to-dos (stale docs to fix, deploy ordering) are in a comment on #109. No `03-SPEC.md` section was active.
- **Logged in `CHANGE-LOG.md` as `pending` out-of-spec, for Ant to triage:** members adding a first name or nickname (new column plus RLS read policy), and renaming a household (RLS write, "who may rename" open). Filed **#139**: pull design references from the Hazardous Schematics website into `02-DESIGN-REFERENCE.md`; needs its own grill.
- **#111 (item quantity) is fully shipped and closed.** Slice A 0.0.44 (PR #135), Slice B 0.0.45 (PR #137). Ant ran the Slice B iPhone checklist and it passed; Slice A's checklist was never run (assumed passed). Last active `03-SPEC.md` section: none.
- **#106 relationship:** #111 has landed, so #106 is unblocked. #106 still owns location-tag lookup normalisation, merging existing duplicate rows (open: sum quantities clamped to 99? which tick state and position survive?), rename onto an existing name, and copying old History snapshots with duplicate names. If #106 changes name normalisation it must redefine `add_list_item` (it uses `lower(btrim())`).
- Open nits, deliberately skipped. Slice B review (all cosmetic): the "already ×99" note shows the success tick (`Banner` is positive-only); on list detail the bump note can go stale after a stepper tap (spec: cleared on add or tick only); in Shopping Mode the note survives Finish and Reset. Slice A review: a narrow flicker window if a refetch lands after the last write resolves; a hung request keeps Finish disabled until reload; `writeShown` missing from an effect's deps (lint only). Each tap bumps `lists.last_activity_at`, so lists reload per tap (Ant mentioned lag elsewhere; watch it).
- **#107 shipped (0.0.43, PR #132).** Stores are read-only to clients (ADR 0007). Ant has not run scenario 1 (real GPS nearby) or a 0.0.43 iPhone smoke check. The S4 tests (`rls_locations*.sql`, fixtures, `store_catalog.sql`) were reviewed statically; Ant reports the quantity tests passed but has not confirmed the S4 ones. Run them (all roll back) before relying on them.
- Open nits: Store missing reports are public GitHub issues (accepted); no rate limit on that path; comment at `supabase/tests/rls_location_items.sql:23` still names the dropped `locations_insert_own`; `LocationsScreen.tsx` header comments may still describe the old create/edit flow; the badge shape is now a circle (docs only mention it in the `StoreBadge.tsx` comment).
- `main` is at 0.0.45 (`mobile/app.json`). Production holds real user data.
- #117 shipped (0.0.41); details in `docs/lessons.md`. Open follow-ups: no iPhone check was run, the household screen has no Try again of its own, and which query fails first is still unverified (the next real occurrence shows in the `[cartel:postgrest-retry]` log).
- #94 shipped (0.0.40): the Stores / Item location vocabulary. The iOS native permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native builds only). `mobile/package-lock.json` still says 0.0.36 (never kept in step).
- Ticket #123: drag auto-scroll near the screen edge on long lists (v1 limit; needs an iPhone check). Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.
- Test data left on the shared Supabase project (all anonymous, inert): list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`) on Woolworths Northlands with a recorded shop, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33` (plus one earlier empty anonymous user), and list "ZZ test 111" (`5a348252-1488-4cf2-9d02-a904ba20546a`, Milk at ×5, personal, no store; Slice B live checks may have added rows). Cleanup is by id only, never a blanket wipe. Closed test issue #130.

## Blocking order

Can start now (no blockers):

1. **#106** (unblocked). Production merge, stops at the plan for Ant; grill its open questions first (see relationship note).
2. Grill #110 (Home overhaul; shares screens with #109), #114, #112, #139 (design reference). #110 unblocks most of the rest.
3. Plan #109 (grilled; see above).
4. #123 (low priority, whenever).

Then:

5. #103, blocked by #110.
6. #90, blocked by #109 (now grilled, needs building) and #110. Stops at the plan for Ant (RLS, deleting a household). Its Leave household button moves into the Settings Household section.
7. #112, no longer blocked (#107 S4 shipped); needs grilling first.

Collisions: #103 touches `ListDetailScreen`; whichever lands second rebases onto the drag-handle row, the quantity control and the new wording. #109, #103 and #110 all touch navigation and screens; whichever lands later rebases.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
