# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-05, end of session 12)

- **#107 in flight on branch `feat/107-store-catalog` (0.0.42, not merged).** Plan signed off by Ant (all Q1-Q7 answered; picker radius 2 km, ODbL + in-app OSM line, SuperValue none found).
  - S1 done: catalog CSV `supabase/seed/store-catalog-christchurch.csv` (52 stores) and `docs/research/christchurch-store-catalog-sources.md`.
  - S2 done: Migration A (`20261005000000_store_catalog_seed.sql`) **applied to production by Ant by hand** (the classifier blocks agent writes) and verified: 52 rows, the three old stores updated in place with history intact (Papanui Woolworths to Northlands, Pak'nsave Papanui, South City to New World Durham Street).
  - S3 written, reviewed, review fixes applied, committed (picker, StoreBadge, Store missing screen, `report-feedback` Edge Function change). Browser check on local dev: 52 stores listed, search "riccarton" narrows correctly, attribution line present, no composer. Not yet checked: Find stores near me, Chain filter, Store missing submit.
  - **Still to do, in order:** (1) deploy the `report-feedback` Edge Function (backward compatible; classifier may block, then Ant deploys); (2) push, open PR, label `needs-manual-test`, post the iPhone checklist on #107 (see plan: nearby, search with location denied, Chain filter, no creation UI, attach to list, Store missing report, dark badges, original stores on Live, version footer 0.0.42); (3) G3 Ant's iPhone test, then merge; (4) S4: Migration B (drop insert/update policies and grants, drop `other`, chain not null, unique name; apply only after Live shows 0.0.42; Ant approves, G4), reverse `rls_locations*.sql` tests, fix fixtures needing a chain, docs (ADR 0007, `docs/context/locations.md`, ADR 0002 note, retire the Slice 4 merge-prompt section in `02-DESIGN-REFERENCE.md`, `docs/environment.md`, `docs/lessons.md` classifier note).
  - Open nits: Store missing reports are public GitHub issues (accepted); no rate limit on that path; `DonutChart.tsx:39` has a stale comment; test `store_catalog.sql` hardcodes 52 rows.
- `main` is at 0.0.41 (`mobile/app.json`), live. Production holds real user data. Last active `03-SPEC.md` section: none.
- #117 shipped (0.0.41, PR #127, closed); details in `docs/lessons.md`. Open follow-ups: no iPhone check was run (the error cannot be forced by hand; the live fake-error check in the browser pane passed), the household screen has no Try again of its own, and which query fails first is still unverified (the next real occurrence shows in the `[cartel:postgrest-retry]` log).
- #94 shipped earlier (0.0.40): the Stores / Item location vocabulary. The iOS native permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native builds only). `mobile/package-lock.json` still says 0.0.36 (never kept in step).
- Ticket #123: drag auto-scroll near the screen edge on long lists (v1 limit; needs an iPhone check). #114 still to grill. Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.
- Test data left on the shared Supabase project from earlier browser tests (all anonymous, inert): one list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`) with a recorded shop, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33` (plus one earlier empty anonymous user). The "ZZ 117" list from this session was removed. Cleanup is by id only, never a blanket wipe.

## Blocking order

Can start now (no blockers):

1. #107 (in flight; see Current state for the remaining steps).
2. Grill #109, #110, #111, #114; grill #112 later. #109, #110 and #111 unblock most of the rest.
3. #123 (low priority, whenever).

Then:

4. #103, blocked by #110.
5. #90, blocked by #109 and #110. Stops at the plan for Ant (RLS, deleting a household).
6. #106, blocked by #111. Production merge, stops at the plan for Ant.

Last:

7. #112, blocked by #107; needs grilling first.

Collisions: #103 (and #111 for the row layout) touch `ListDetailScreen`; whichever lands second rebases onto the drag-handle row and the new wording.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
