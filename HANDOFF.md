# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-04, end of session 2)

- `main` is at 0.0.35 (`mobile/app.json`). Production holds real user data. Last active `03-SPEC.md` section: none (#89 is post-spec work scoped on its issue).
- Shipped this session: #95 join-error copy fix (PR #96, 0.0.35); docs PR #97 (planning always goes to the Opus `planner` agent, never agy; agy keeps review, design and large reads).
- Triage done: the Store / in-store location rename is ticketed as #94, to build **after** #89. #90 (leave a household) is to be grilled after #89; its interim message fix shipped.
- **#89 plan is written and decided, not yet built.** The full plan and Amendment 1 are the last two comments on #89; the amendment overrides the plan. Ant's decisions are in the comment before them (Reset list ending, keep `archived_at` as the reversal key, History actions only when expanded, hide archived lists in the first migration). #89 is labelled `needs-info` because the build stops for Ant before each migration.
- Amendment 1 has **not** been independently re-reviewed yet (the original plan was reviewed; its findings are folded in).
- The STOP-B read-only query ran on 2026-10-04: 7 archived lists would be hidden (names are in Amendment 1, A0). Re-run it before applying.

## Next session

1. Have a reviewer check Amendment 1 against the code (not the planner, not the Code Writer).
2. Branch, then a Code Writer builds #89 per plan + amendment: both migration files written but **not applied**, the SQL test rewrite, all app changes, version 0.0.36.
3. Code review, then **stop for Ant**: re-run STOP-B, show him the STOP-A migration; apply only on his yes. Then the preview, manual test on iPhone (`needs-manual-test`), merge, confirm `v0.0.36 · Live`, then STOP-C again only on his yes.
4. Afterwards: Docs agent per plan section 8 + A9; then #94, then the #90 grill.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
