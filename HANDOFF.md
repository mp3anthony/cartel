# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-05, end of session 14)

- **#107 fully shipped (S4 = 0.0.43, PR #132, closed).** Migration B was applied by Ant by hand and checked read-only: client policies and grants gone, `chain` is one of five brands and not null, `locations_name_key` unique, 52 stores, the three original stores keep their history. Stores are read-only to clients (ADR 0007). Earlier, 0.0.42 (PR #129) shipped the picker and Store missing report. Ant has not run scenario 1 (real GPS nearby) or a 0.0.43 iPhone smoke check (version footer, Stores picker lists, open a list on Woolworths Northlands).
- **S4 tests never run.** The rewritten `supabase/tests/rls_locations*.sql`, the fixture updates and `store_catalog.sql` were reviewed statically (clean) but never pasted into the SQL editor. Run them (all roll back) before relying on them.
- Open nits: Store missing reports are public GitHub issues (accepted); no rate limit on that path; comment at `supabase/tests/rls_location_items.sql:23` still names the dropped `locations_insert_own`; `LocationsScreen.tsx` header comments may still describe the old create/edit flow; the badge shape is now a circle (docs only mention it in the `StoreBadge.tsx` comment).
- `main` is at 0.0.43 (`mobile/app.json`). Production holds real user data. Last active `03-SPEC.md` section: none.
- #117 shipped (0.0.41); details in `docs/lessons.md`. Open follow-ups: no iPhone check was run, the household screen has no Try again of its own, and which query fails first is still unverified (the next real occurrence shows in the `[cartel:postgrest-retry]` log).
- #94 shipped (0.0.40): the Stores / Item location vocabulary. The iOS native permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native builds only). `mobile/package-lock.json` still says 0.0.36 (never kept in step).
- Ticket #123: drag auto-scroll near the screen edge on long lists (v1 limit; needs an iPhone check). #114 still to grill. Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.
- Test data left on the shared Supabase project (all anonymous, inert): one list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`) on Woolworths Northlands with a recorded shop, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33` (plus one earlier empty anonymous user). Cleanup is by id only, never a blanket wipe. Closed test issue #130 (a Store missing test report).

## Blocking order

Can start now (no blockers):

1. Grill #109, #110, #111, #114, #112. #109, #110 and #111 unblock most of the rest.
2. #123 (low priority, whenever).

Then:

3. #103, blocked by #110.
4. #90, blocked by #109 and #110. Stops at the plan for Ant (RLS, deleting a household).
5. #106, blocked by #111. Production merge, stops at the plan for Ant.
6. #112, no longer blocked (#107 S4 shipped); needs grilling first.

Collisions: #103 (and #111 for the row layout) touch `ListDetailScreen`; whichever lands second rebases onto the drag-handle row and the new wording.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
