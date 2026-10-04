# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-04, end of session 4)

- `main` is at 0.0.35 (`mobile/app.json`). Production holds real user data. Last active `03-SPEC.md` section: none (#89 is post-spec work scoped on its issue).
- **#89 is built and in review on the PR from `feat/89-reset-list-history` (v0.0.36), not merged.** Plan + Amendments 1-3 on the issue are the spec (later comments override earlier ones).
- Done: A3 reviewed (no blockers); Code Writer built it; Code Reviewer found no blockers and 3 medium issues; those and 3 low ones were fixed (`1223412`); a second reviewer re-checked the fixes clean. `tsc` is clean and the web export builds.
- **Not done:**
  - Neither migration is applied (`20261004000000_reusable_lists.sql` = STOP-A, `20261004000001_retire_archiving.sql` = STOP-C).
  - No SQL test has been run (main file and the new legacy-window file).
  - The reversal migration was deliberately not written (A3-6: only if needed).
  - The manual-test checklist (tests 10 and 10b inlined in the required format) is not written or posted on the issue yet.
- #89 stays `needs-info`: the build stops for Ant before each migration. The STOP-B query last ran 2026-10-04 (7 lists); re-run it before applying.
- STOP-C sweep predicate defaults to hiding only window-archived lists untouched since (`last_activity_at <= archived_at`). Ant confirms or picks a blanket sweep when shown the STOP-C dry run. If blanket is picked, the post-STOP-C `should_be_zero` check and reversal step 1 need adjusting.
- Reviewer notes to carry into docs and the checklist: post-STOP-C `sessions` should equal the dry run's `sessions` plus `sessions_since`; the reversal step 1 predicate is authoritative and dry-run ids are informational.
- Queue after #89: #94 (Store / in-store location rename), then grill #90 (leave a household).

## Next session

1. Ant reviews the PR. Fix anything he raises via a Code Writer, reviewed by a different agent.
2. Write and post the manual-test checklist (PC and iPhone lists, tests 10 and 10b inlined) on the issue and PR.
3. **Stop for Ant:** run STOP-B, show him the STOP-A migration, apply only on his yes. Then run the legacy-window and main SQL tests after STOP-A.
4. Preview, manual tests (`needs-manual-test`), merge, confirm `v0.0.36 · Live`. Then the STOP-C dry run, STOP-C only on his yes, then test 10b.
5. Afterwards:
   - a test-only PR deletes the legacy-window test;
   - the Docs agent works per plan section 8 + A9 + A2-9 + A3-7;
   - then #94, then the #90 grill.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
