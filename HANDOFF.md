# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-05, end of session 11)

- `main` is at 0.0.41 (`mobile/app.json`), live. Production holds real user data. Last active `03-SPEC.md` section: none (bug fix).
- #117 shipped (0.0.41, PR #127, closed); details in `docs/lessons.md`. Open follow-ups: no iPhone check was run (the error cannot be forced by hand; the live fake-error check in the browser pane passed), the household screen has no Try again of its own, and which query fails first is still unverified (the next real occurrence shows in the `[cartel:postgrest-retry]` log).
- #94 shipped earlier (0.0.40): the Stores / Item location vocabulary. The iOS native permission string in `mobile/app.json` (`locationWhenInUsePermission`) still says "location" (native builds only). `mobile/package-lock.json` still says 0.0.36 (never kept in step).
- Ticket #123: drag auto-scroll near the screen edge on long lists (v1 limit; needs an iPhone check). #114 still to grill. Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.
- Test data left on the shared Supabase project from earlier browser tests (all anonymous, inert): one list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`) with a recorded shop, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33` (plus one earlier empty anonymous user). The "ZZ 117" list from this session was removed. Cleanup is by id only, never a blanket wipe.

## Blocking order

Can start now (no blockers):

1. #107. Schema change, stops at the plan for Ant; write its strings in the new vocabulary (Store, Item location).
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
