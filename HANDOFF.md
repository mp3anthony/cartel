# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-05, end of session 13)

- **#107 shipped (0.0.42, PR #129, closed), live.** Catalog-only Stores picker (52 Christchurch stores), Store missing report, chain badges (New World solid red; Four Square red with green ring; FreshChoice red with blue ring; PAK'nSAVE outlined), and the picker orders most-visited-by-household first (best-effort: 2 s timeout falls back to alphabetical). `report-feedback` Edge Function deployed by Ant by hand (v4). Ant's iPhone test passed, except scenario 1 (real GPS nearby) which he has not run (not near a supermarket); the nearby list was checked only with faked location in the desktop browser. Live footer confirmed 0.0.42. Scenario 8 (original three stores keep their history on Live) was not explicitly reported.
- **#107 S4 still to do (next up):** Migration B (drop the store insert/update policies and grants, drop `other`, chain not null, unique name). Ant must approve it (G4) and applies it by hand (the classifier blocks agent production writes); Planner writes the plan first. Also: reverse `rls_locations*.sql` tests, fix fixtures that need a chain, docs (ADR 0007, `docs/context/locations.md`, ADR 0002 note, retire the Slice 4 merge-prompt section in `02-DESIGN-REFERENCE.md`, `docs/environment.md`, `docs/lessons.md` classifier note).
- Open nits: Store missing reports are public GitHub issues (accepted); no rate limit on that path; `DonutChart.tsx:39` has a stale comment; test `store_catalog.sql` hardcodes 52 rows; the badge shape is now a circle (docs only mention it in the `StoreBadge.tsx` comment).
- `main` is at 0.0.42 (`mobile/app.json`). Production holds real user data. Last active `03-SPEC.md` section: none.
- #117 shipped (0.0.41); details in `docs/lessons.md`. Open follow-ups: no iPhone check was run, the household screen has no Try again of its own, and which query fails first is still unverified (the next real occurrence shows in the `[cartel:postgrest-retry]` log).
- #94 shipped (0.0.40): the Stores / Item location vocabulary. The iOS native permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native builds only). `mobile/package-lock.json` still says 0.0.36 (never kept in step).
- Ticket #123: drag auto-scroll near the screen edge on long lists (v1 limit; needs an iPhone check). #114 still to grill. Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.
- Test data left on the shared Supabase project (all anonymous, inert): one list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`) on Woolworths Northlands with a recorded shop, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33` (plus one earlier empty anonymous user). Cleanup is by id only, never a blanket wipe. Closed test issue #130 (a Store missing test report).
- Browser-pane note: desktop Chrome denies geolocation; to test nearby, patch `navigator.geolocation` and `navigator.permissions.query` after load (expo-location checks both).

## Blocking order

Can start now (no blockers):

1. #107 S4 (see Current state).
2. Grill #109, #110, #111, #114; grill #112 later. #109, #110 and #111 unblock most of the rest.
3. #123 (low priority, whenever).

Then:

4. #103, blocked by #110.
5. #90, blocked by #109 and #110. Stops at the plan for Ant (RLS, deleting a household).
6. #106, blocked by #111. Production merge, stops at the plan for Ant.

Last:

7. #112, blocked by #107 S4; needs grilling first.

Collisions: #103 (and #111 for the row layout) touch `ListDetailScreen`; whichever lands second rebases onto the drag-handle row and the new wording.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
