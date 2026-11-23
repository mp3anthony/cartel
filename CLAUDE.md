# CLAUDE.md: Cartel

Cartel is a crowdsourced, shared shopping-list app for households: an Expo (managed) app in `mobile/`, React Native Web on Vercel, Supabase backend. This repo holds Cartel only, no other products. Ant is not a developer, so the orchestrator delegates all code work.

@HANDOFF.md

`HANDOFF.md` loads every session (where we left off). This file holds only the must-dos and absolute do-nots.

## Start here

Every session: read `HANDOFF.md`, then `CONTEXT-MAP.md`; open only the glossary in `docs/context/` for the topic at hand.

**Soft rule:** when a request touches an idea, term or behaviour the glossaries don't document, or seems to disagree with them, run the `grilling` and `domain-modeling` skills together (what `/grill-with-docs` does; only Ant can type it) to align with Ant, then update `docs/context/` (and `docs/adr/` only for hard-to-reverse, surprising, trade-off decisions).

**Where knowledge lives:** vocabulary `docs/context/` · workflow detail `docs/workflow.md` · conventions `docs/conventions.md` · lessons `docs/lessons.md` · environment, ops `docs/environment.md` · decisions `docs/adr/` · research `docs/research/` · UI/UX `02-DESIGN-REFERENCE.html` · requirements `01-CRD.md` · spec and locked decisions `03-SPEC.md` · out-of-spec inbox `CHANGE-LOG.md`.

Docs record only what the code cannot explain: decisions, reasoning, rejected alternatives, voice and tone. Never document what the code shows.

## Rules

- Orchestrator owns all Git/GitHub interaction. Never commit to `main`; branch and PR.
- Stack: Expo + React Native Web (Vercel) + Supabase (Postgres, RLS, Realtime, anonymous auth); see `docs/adr/` (0001 to 0009).
- All UI/UX starts from `02-DESIGN-REFERENCE.html` (floor, not ceiling); `mobile/src/theme/tokens.ts` is the sole palette source; follow `docs/conventions.md`. Any UI/UX subagent brief carries the foundation.
- Testing targets iPhone / iOS Safari only; never write Android steps.
- Models: Planner subagents always use the `planner` agent (`.claude/agents/planner.md`, Opus). All other subagents use the session's own model and effort.

## Non-negotiables (full detail: `docs/workflow.md`)

- The orchestrator never plans, implements or reviews code itself; subagents do (Investigator, Planner, Code Writer, Code Reviewer, Docs).
- No agent reviews or approves its own code; implementation and review are always different agents.
- Out-of-spec requests: one line in `CHANGE-LOG.md` (status `pending`), tell Ant, do nothing else.
- Escalate (stop, label `needs-info`, ask Ant) on locked invariants (`03-SPEC.md` section 0; a bug fix that turns out to touch one), schema, migration or RLS changes, or a genuinely new or ambiguous question the plan did not anticipate.
- Clean code PR (independent review approved, checks and build pass, no locked invariant, version bumped, any prod set-up such as a migration or env var already done): orchestrator merges. Ask Ant first on review issues, ambiguity or locked invariants.
- Docs-only PR: a separate subagent reviews, orchestrator fixes and merges, no version bump.
- Bump the patch version on code PRs only (`mobile/app.json` is the source of truth).
- Labels, flow, triage, token budget, branching, the draft-PR rule, and the Code Reviewer never sharing a session with the Investigator: `docs/workflow.md`.
