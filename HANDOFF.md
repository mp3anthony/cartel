# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-04, end of session 4)

- `main` is at 0.0.36 (`mobile/app.json`), live. Production holds real user data. Last active `03-SPEC.md` section: none.
- #89 (reusable lists, Reset list, History) is done and closed. Both migrations are applied in production and Ant's iPhone tests passed.
- A docs/tests PR is open until merged: #89 docs additions plus deletion of the legacy-window SQL test.
- New open tickets, both `needs-triage`, to be grilled with Ant:
  - #102: remove an item from a list.
  - #103: after finishing a shop, take the user home; also from Continue at another store once the second store or "I'll choose later" is picked.

## Next session

1. Merge the open docs/tests PR once a different agent has reviewed it.
2. #94 (Store / in-store location rename).
3. Grill #90 (leave a household).
4. Triage #102 and #103.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
