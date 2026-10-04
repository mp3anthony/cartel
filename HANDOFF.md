# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-04, end of session 3)

- `main` is at 0.0.35 (`mobile/app.json`). Production holds real user data. Last active `03-SPEC.md` section: none (#89 is post-spec work scoped on its issue).
- This session was planning only: no app code changed.
- **#89 plan is complete, not yet built.** Read the last five comments on #89 in order; each later one overrides the earlier ones:
  1. Ant's decisions: Reset list ending, keep `archived_at` as the reversal key, History actions only when expanded, hide archived lists in the first migration.
  2. The plan.
  3. Amendment 1.
  4. Amendment 2 (STOP-A redefines the old `finish_shopping(uuid)` so 0.0.35 clients can't double-record during the STOP-A to STOP-C window; Ant chose this).
  5. Amendment 3 (single-statement deploy queries, one-transaction reversal that unticks already-recorded items; Ant chose this; exact test UUIDs).
- Reviews: A1 and A2 were each independently reviewed and their findings folded into A2 and A3. **A3 has not been reviewed yet.** It touches only the deploy queries, the contingency reversal, test UUIDs and manual test 10.
- STOP-C sweep predicate defaults to hiding only window-archived lists untouched since (`last_activity_at <= archived_at`). Ant confirms or picks a blanket sweep when shown the STOP-C dry run.
- #89 is labelled `needs-info` because the build stops for Ant before each migration. The STOP-B query last ran 2026-10-04 (7 lists); re-run it before applying.
- Queue after #89: #94 (Store / in-store location rename), then grill #90 (leave a household).

## Next session

1. A reviewer (not the planner, not the Code Writer) quickly checks Amendment 3 against the code.
2. Branch, then a Code Writer builds #89 per plan + A1 + A2 + A3. Both migration files are written but **not applied**. Also the SQL test edits, the new legacy-window test file, all app changes, and version 0.0.36.
3. Code review, then **stop for Ant**: run STOP-B, show him the STOP-A migration, and apply only on his yes. Run the legacy-window and main SQL tests after STOP-A. Then the preview, manual tests on PC and iPhone (`needs-manual-test`, including test 10), merge, and confirm `v0.0.36 · Live`. Then the STOP-C dry run, and STOP-C only on his yes, then test 10b.
4. Afterwards:
   - a test-only PR deletes the legacy-window test;
   - the Docs agent works per plan section 8 + A9 + A2-9 + A3-7;
   - then #94, then the #90 grill.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
