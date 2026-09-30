# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-09-30)

- `main` is at the version in `mobile/app.json` (`expo.version`, 0.0.34 at last check). Production holds real user data.
- The only open ticket is #52 (Places search-assist), parked on Ant's Google Cloud billing prepayment (`ready-for-human`). Nothing else is in flight.
- Delegation to agy is live (`GEMINI-DELEGATION.md`, `scripts/agy-delegate.ps1`). The exit-3 fallback after a real quota hit is untested.
- This context migration (CONTEXT-MAP, `docs/context/`, ADRs, conventions, lessons, environment, rewritten CLAUDE.md, this HANDOFF) is on branch `docs/context-structure`, open as a PR, awaiting review and merge.

## Next session

1. Starts with Ant. Run `/grill-with-docs` once in Cartel so the new `docs/context/` layout is exercised and aligned with him.
2. The open questions from the migration (app-shell terms grouping, whether comment-only code edits need a version bump, and similar) are listed in the PR description. Settle them with Ant first.
3. #52 stays parked until Ant says otherwise. Start no new work unprompted.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
