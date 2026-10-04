# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-04, end of session 5)

- `main` is at 0.0.36 (`mobile/app.json`), live. Production holds real user data. Last active `03-SPEC.md` section: none.
- Session 5 was triage only, no code. #90, #102, #103 and #106 were grilled with Ant; the agreed decisions are in a comment on each ticket. They are now `ready-for-agent` and `needs-manual-test`.
- Escalation reminders: #90 (membership, RLS, deleting a household when the last member leaves) and #106 (one-off production merge of duplicate items, optional unique index) both stop at the plan for Ant's decision. #102 starts with a diagnosis of why the "x" did nothing.
- New `needs-triage` tickets, each to be grilled with docs: #109 (Household screen is really a settings page), #110 (Home page overhaul), #111 (quantity counter on items), #112 (default store layout order instead of auto-ordering).
- Still `needs-triage`: #94 (Store / in-store location rename), #107 (seeded store catalog; decisions in ADR 0007).
- Ant mentioned an unlogged lag issue (some actions are slow, others instant); he will log it himself.

## Next session

1. #102: diagnosis agent, then Planner.
2. #103: Planner (client-only navigation, small).
3. #90 and #106: Planner, then stop at the plan for Ant.
4. Grill #109, #110, #111, #112 with docs; #109 and #110 affect where #90 and #103 land.
5. #94 and #107 triage.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
