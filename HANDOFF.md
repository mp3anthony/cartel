# HANDOFF

> Where we left off. Rewritten at every wrap-up; current state only. Durable knowledge lives in the places listed at the bottom.

## Current state (2026-10-04)

- `main` is at the version in `mobile/app.json` (`expo.version`, 0.0.34 at last check). Production holds real user data.
- The #89 `/grill-with-docs` session is done (docs-only, PR #92 merged). Last active `03-SPEC.md` section: none.
  - #89 now carries the full agreed scope and an iPhone testing checklist: reusable lists, Finish shopping with two endings ("Done shopping" / "Continue at another store"), archiving retired (existing archived lists removed), History capped at 5 and titled by store, "Continue shopping" shows only shops in progress, house/person icons replace the Shared/Personal badges. Labelled `ready-for-agent`, no longer `needs-triage`.
  - The glossaries (`docs/context/lists.md`, `shopping.md`) describe the post-#89 behaviour, with a note saying the app still archives until #89 ships.
- `CHANGE-LOG.md` has a new `pending` out-of-spec item awaiting Ant's triage: the UI rename of "Location" to "Store" and "Section" to "location" (code and schema names unchanged). `locations.md` carries a pending-rename note.
- Other open tickets: #90 Add a way to leave a household (`needs-triage`, `ready-for-human`, touches membership and RLS); #52 Places search-assist, parked on Ant's Google Cloud billing prepayment.
- Delegation to agy is live (`GEMINI-DELEGATION.md`, `scripts/agy-delegate.ps1`). The exit-3 fallback after a real quota hit is untested.

## Next session

1. Starts with Ant: triage. Ant decides on the pending Store / in-store location rename in `CHANGE-LOG.md` (file a ticket or not, and whether it lands before or after #89), and on #90.
2. Then plan #89 (agy or the `planner` agent). It changes `finish_shopping()`, list state and production data, and likely needs a migration to track "checked since the last finish", so the build stops for Ant before any migration or data change.

## Where things live

- Vocabulary: `CONTEXT-MAP.md` and `docs/context/`. Decisions: `docs/adr/`.
- Conventions, lessons, environment and ops: `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`.
- Requirements and specs: `01-CRD.md`, `02-DESIGN-REFERENCE.md`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`; open tickets are on GitHub.
- Workflow and rules: `CLAUDE.md`. Delegation rules: `GEMINI-DELEGATION.md`.
