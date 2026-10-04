# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-04, end of session 7)

- `main` is at 0.0.37 (`mobile/app.json`), live. Production holds real user data. Last active `03-SPEC.md` section: Slice 2 (reorder/remove), via #102.
- #102 slice 1 shipped (PR #116): "×" on every row in the list screen and Shopping Mode, inline Remove/Cancel confirmation, `removeItem` reports a 0-row update. Reviewed clean by a separate agent; browser-tested (Chromium, not iOS Safari); test record is on the issue. The "keyboard up" iPhone case was skipped on purpose; Ant will flag it if it recurs. The original "x did nothing" cause is still unconfirmed.
- #102 slices 2 (0.0.38: tap name to rename, pin for location, pencil retired) and 3 (0.0.39: drag to reorder, spike-gated) remain; the plan is in the issue comments. Slice 2 is next.
- New ticket #117: "JWT issued at future" error on anonymous sign-in happens often on Ant's phone (needs diagnosis first; a plain reload clears it).
- Test data left on the shared Supabase project from this session's browser test (all anonymous, inert): one list "ZZ test 102" (`59344e62-4855-4942-acda-d3d45f8fe244`) with a recorded shop, owned by anonymous user `cef386ef-86ff-4207-942a-832f7567fc33` (plus one earlier empty anonymous user). Cleanup is by id only, never a blanket wipe.
- Testing tip: in the in-app browser, `type`/Return does not reliably submit the add-item field; fill it with `form_input`, then click "+". Click by `ref`, or by frame coordinates (not screenshot pixels).
- #94 grilled with docs (decisions on the ticket, vocabulary in `docs/context/locations.md`). #114 still to grill. Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.

## Blocking order

Can start now (no blockers):

1. #102 slice 2 (Code Writer).
2. #94 (Planner, then build).
3. #117 diagnosis (Investigator).
4. Grill #109, #110, #111, #114; grill #112 later.

Then:

5. #103, blocked by #110.
6. #90, blocked by #109 and #110. Stops at the plan for Ant (RLS, deleting a household).
7. #107, blocked by #94. Schema change, stops at the plan for Ant; write its strings in the new vocabulary.
8. #106, blocked by #111. Production merge, stops at the plan for Ant.

Last:

9. #112, blocked by #107 and #94; needs grilling first.

Collisions: build #111 after #102 slice 2 at the earliest (row layout collides). #103 and #94 will conflict a little with #102 in `ListDetailScreen`; whichever lands second rebases.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
