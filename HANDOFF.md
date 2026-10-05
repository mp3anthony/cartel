# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-05, end of session 9)

- `main` is at 0.0.39 (`mobile/app.json`), live. Production holds real user data. Last active `03-SPEC.md` section: Slice 2 (reorder/remove), via #102, now closed (all three slices shipped).
- #102 slice 3 shipped (0.0.39, PR #122, hand-rolled drag handle). Reviewed by a separate agent, no blockers. Ant tried one drag on his iPhone ("looks pretty good") and chose not to run scenarios 3-7 or the divider/callout checks; he will raise a bug if anything fails. The original "x did nothing" cause is still unconfirmed (slice 1, `docs/lessons.md`).
- New ticket #123: drag auto-scroll near the screen edge on long lists (v1 limit; fixable without a library, needs an iPhone check). New ticket #117: "JWT issued at future" error on anonymous sign-in on Ant’s phone (needs diagnosis first; a plain reload clears it).
- Test data left on the shared Supabase project from an earlier browser test (all anonymous, inert): one list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`) with a recorded shop, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33` (plus one earlier empty anonymous user). Cleanup is by id only, never a blanket wipe.
- #94 grilled with docs (decisions on the ticket, vocabulary in `docs/context/locations.md`). #114 still to grill. Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.

## Blocking order

Can start now (no blockers):

1. #94 (Planner, then build).
2. #117 diagnosis (Investigator).
3. Grill #109, #110, #111, #114; grill #112 later.
4. #123 (low priority, whenever).

Then:

5. #103, blocked by #110.
6. #90, blocked by #109 and #110. Stops at the plan for Ant (RLS, deleting a household).
7. #107, blocked by #94. Schema change, stops at the plan for Ant; write its strings in the new vocabulary.
8. #106, blocked by #111. Production merge, stops at the plan for Ant.

Last:

9. #112, blocked by #107 and #94; needs grilling first.

Collisions: #103 and #94 touch `ListDetailScreen` (and #111 the row layout); whichever lands second rebases onto the drag-handle row.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
