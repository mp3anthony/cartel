# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-05, end of session 10)

- `main` is at 0.0.40 (`mobile/app.json`), live. Production holds real user data. Last active `03-SPEC.md` section: none (vocabulary pass, UI copy only).
- #94 shipped (0.0.40, PR #125): Locations -> Stores, Section -> Item location, "Location Services" for the phone permission, catalog screen -> "Item catalog". Reviewed by a separate agent, no blockers; no hands-on iPhone check was run (copy only). Left as is: the iOS native permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native builds only). `mobile/package-lock.json` still says 0.0.36 (never kept in step).
- #117 investigated (findings on the ticket, summary in `docs/lessons.md`): PostgREST PGRST303, an upstream clock bug, not auth-js or device skew. Recommended fix: bounded retry on that exact error in the household and lists read loaders, never re-sign-in. Labelled `ready-for-agent`; next step is a Planner.
- Ticket #123: drag auto-scroll near the screen edge on long lists (v1 limit; needs an iPhone check). #114 still to grill. Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.
- Test data left on the shared Supabase project from an earlier browser test (all anonymous, inert): one list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`) with a recorded shop, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33` (plus one earlier empty anonymous user). Cleanup is by id only, never a blanket wipe.

## Blocking order

Can start now (no blockers):

1. #117 (Planner, then build; bounded retry per the ticket).
2. #107 (unblocked by #94). Schema change, stops at the plan for Ant; write its strings in the new vocabulary (Store, Item location).
3. Grill #109, #110, #111, #114; grill #112 later.
4. #123 (low priority, whenever).

Then:

5. #103, blocked by #110.
6. #90, blocked by #109 and #110. Stops at the plan for Ant (RLS, deleting a household).
7. #106, blocked by #111. Production merge, stops at the plan for Ant.

Last:

8. #112, blocked by #107; needs grilling first (#94 is done).

Collisions: #103 (and #111 for the row layout) touch `ListDetailScreen`; whichever lands second rebases onto the drag-handle row and the new wording.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
