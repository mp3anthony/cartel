# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-04, end of session 6)

- `main` is at 0.0.36 (`mobile/app.json`), live. Production holds real user data. Last active `03-SPEC.md` section: none.
- Session 6 was planning and triage only, no app code.
- #102 diagnosed and planned (plan posted as a comment on the issue, three slices: 0.0.37 remove with confirmation; 0.0.38 tap-to-rename plus pin; 0.0.39 drag to reorder, hand-rolled, gated by an iPhone spike). Ant answered the plan's open questions.
- #94 grilled with docs: decisions are in a comment on the ticket and the vocabulary is now in `docs/context/locations.md` (the spec and ADRs keep the old words; mapping there).
- New ticket #114 (Item catalog screen redesign), still to grill.- Unlogged: Ant mentioned a lag issue (some actions slow, others instant); he will log it himself.

## Blocking order

Can start now (no blockers):

1. #102 slice 1 (Code Writer).
2. #94 (Planner, then build).
3. Grill #109, #110, #111, #114; grill #112 later.

Then:

4. #103, blocked by #110.
5. #90, blocked by #109 and #110. Stops at the plan for Ant (RLS, deleting a household).
6. #107, blocked by #94. Schema change, stops at the plan for Ant; write its strings in the new vocabulary.
7. #106, blocked by #111. Production merge, stops at the plan for Ant.

Last:

8. #112, blocked by #107 and #94; needs grilling first.

Collisions: build #111 after #102 slice 2 at the earliest (row layout collides). #103 and #94 will conflict a little with #102 in `ListDetailScreen`; whichever lands second rebases.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
