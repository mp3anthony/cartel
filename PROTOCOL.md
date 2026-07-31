# Protocol

> Reusable, stack-agnostic. Copied as-is into every project — don't edit this file
> per-project. Project-specific hard invariants (schema rules, locked architecture
> decisions, etc.) live in that project's `SPEC.md`, not here.

## 1. Roles

**Orchestrator (main session) — the only one you talk to.**
Owns all git/GitHub interaction (branches, issues, labels, PRs). Absorbs Intake: when
you bring a problem or idea, the Orchestrator interrogates it into a scoped issue
itself (no separate intake step). Handles ADR creation/completion directly with you.

**Golden rule:** the Orchestrator always checks how to proceed before any non-trivial
action it doesn't already have clear instructions for — usually as simply as "how
would you like to proceed?" If you've pre-empted the question in your prompt, it
doesn't ask again.

**Subagents** — spun up by the Orchestrator, do one job, report back, stop. None talk
to you directly.
- **Investigator** — read-only research/diagnosis.
- **Code Reviewer** — reviews a change. Separate role from Investigator; never shares
  a session with it.
- **Planner** — writes the implementation plan.
- **Code Writer** — implements the approved plan.
- **Docs** — documentation, session log, glossary upkeep.

## 2. Core Workflow

**Step 0 — Session Start.** Read `HANDOFF.md` first. It records the last active
ticket/spec location, which is normally enough to resume without re-reading all of
`SPEC.md`.

**Step 1 — Scope Check.** Check the request against the ticket context loaded in
Step 0, falling back to the full `SPEC.md` only if that's insufficient.
- **In spec:** proceed to Step 2.
- **Not in spec:** don't scope it, don't touch the CRD. Append one line to
  `CHANGE-LOG.md` (date, one-line description, affected area, status: `pending`).
  Label the turn `out-of-spec` and tell you in plain English what was logged. Nothing
  else happens until you triage it.

**Step 2 — Problem Agreement.** You bring a problem or feature. The Orchestrator
interrogates it with you, agrees the outcome, and files the GitHub issue with a
testing checklist. This is the approval gate before any planning starts.

**Step 3 — Autonomous Execution.** Once the plan is approved, the Orchestrator
delegates to subagents (Investigator → Planner → Code Writer → Docs) without
interrupting you — **unless** a mandatory escalation trigger hits:
- Touches a hard invariant or locked architecture decision defined in `SPEC.md`.
- A genuine new question comes up that wasn't anticipated in the plan.

**Step 4 — Preview & Labeling Routing.** Code goes to a preview branch, a checklist
is generated. *(Reconstruction note: source material cut off here — verify/complete
this step against your actual working copy if you have one newer than this.)*

**Step 5 — Session Wrap-Up.** Record the last active ticket/spec-section location
back into `HANDOFF.md` before ending the session, so Step 0 next time is cheap.

## 3. Documentation Rule

Docs, ADRs, and `CHANGE-LOG.md` entries should only capture what the codebase itself
can't explain — decisions, reasoning, rejected alternatives, voice/tone rules. Never
document something a reader could get by opening the code. See ADR 0003,
"Documentation is not evidence."
