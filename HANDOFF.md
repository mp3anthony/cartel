# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-09-30)

- `main` is at the version in `mobile/app.json` (`expo.version`, 0.0.34 at last check). Production holds real user data.
- The context migration is merged and the `/grill-with-docs` session on it is done: all ten open questions are answered and the glossaries updated (Shared list / Share with household, Theme wording, History cap, and others). Last active `03-SPEC.md` section: none, this was a docs-only session.
- Open tickets, none in flight:
  - #89 Rework Lists (reusable lists, no archiving, History shows 5 shops). `needs-triage`, `ready-for-human`. Starts with a `/grill-with-docs` session on the Lists screen; touches list state and possibly schema, so it stops for Ant before any migration or build.
  - #90 Add a way to leave a household. `needs-triage`, `ready-for-human`. Touches household membership and RLS.
  - #52 Places search-assist, parked on Ant's Google Cloud billing prepayment (`ready-for-human`). Its local branch needs a rebase or a fresh start when it resumes.
- Delegation to agy is live (`GEMINI-DELEGATION.md`, `scripts/agy-delegate.ps1`). The exit-3 fallback after a real quota hit is untested.

## Next session

1. Starts with Ant. Suggested first move: triage #89, beginning with the Lists grill.
2. #90 and #52 wait for Ant's call. Start no new work unprompted.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
