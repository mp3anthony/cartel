# CLAUDE.md — Cartel

@HANDOFF.md

`HANDOFF.md` loads automatically every session (where we left off). This file holds only the workflow, the must-dos and the absolute do-nots; knowledge lives where the pointers below say.

## Start here

Every session: read `HANDOFF.md`, then `CONTEXT-MAP.md`; open only the glossary in `docs/context/` for the topic at hand.

**Soft rule:** when a request touches an idea, term or behaviour the glossaries don't document, or seems to disagree with them, the orchestrator runs the `grilling` and `domain-modeling` skills together (that is all `/grill-with-docs` does; only Ant can type that command, the model cannot invoke it) to align with Ant, then updates `docs/context/` (and `docs/adr/` only for hard-to-reverse, surprising, trade-off decisions). Ant sometimes uses other skills instead; that is fine.

**Where knowledge lives:** vocabulary `docs/context/` · build and design-process conventions `docs/conventions.md` · lessons and known items `docs/lessons.md` · environment, ops, acceptance decisions `docs/environment.md` · architectural decisions `docs/adr/` · research notes `docs/research/` · UI/UX foundation `02-DESIGN-REFERENCE.md` · requirements `01-CRD.md` · build breakdown and locked decisions `03-SPEC.md` · out-of-spec inbox `CHANGE-LOG.md` · delegation to Antigravity `GEMINI-DELEGATION.md`.

Docs record only what the code cannot explain: decisions, reasoning, rejected alternatives, voice and tone rules. Never document what a reader gets by opening the code.

## Rules

- Orchestrator owns all Git/GitHub interaction.
- Stack: Expo (managed) app in `mobile/`, React Native Web deployed on Vercel, Supabase (Postgres, RLS, Realtime, anonymous auth). See `docs/adr/0001-supabase-rls-realtime.md`, `docs/adr/0002-location-global-list-private.md` and `docs/adr/0003-anonymous-auth-no-login-wall.md`.
- **All UI/UX work starts from `02-DESIGN-REFERENCE.md`** (the floor, not the ceiling); `mobile/src/theme/tokens.ts` is the sole palette source. Follow `docs/conventions.md`. Any subagent brief touching UI/UX must carry the foundation.
- Testing targets iPhone / iOS Safari only. Ant owns an iPhone, not Android; never write Android steps.
- The orchestrator delegates review, design and large read-and-think work to Antigravity per
  `GEMINI-DELEGATION.md`, decides that itself without asking Ant, and falls back to Claude subagents on exit
  code 3. agy may fill the Investigator or Code Reviewer role only (never the Planner, never the Code Writer) and never
  writes to the repo; the Workflow Protocol below still applies.
- **Models:** Planner subagents always use the `planner` agent (`.claude/agents/planner.md`, Opus), regardless of agy availability (decided 2026-10-04: planning benefits most from the most capable model with full repo access, and agy's file filter refuses `.sql`, so it could not plan database work). All other subagents (Investigator, Code Writer, Code Reviewer, Docs) use the session's own model and effort (soft rule, not forced), or agy where allowed.

## Workflow Protocol

The only protocol document (Hazardous Schematics standard, adapted for Cartel).

### Roles

**Orchestrator (main session) — the only one Ant talks to.** Owns all Git/GitHub interaction (branches, issues, labels, PRs). Absorbs intake: interrogates Ant's problem or idea into a scoped issue itself. Handles ADRs directly with Ant. **Golden rule:** before any non-trivial action it has no clear instructions for, it checks how to proceed ("how would you like to proceed?") unless Ant already pre-empted it.

The orchestrator is a pure decision-making partner. **Ant is not a software developer**: the orchestrator never plans, implements, or reviews/checks code itself; all of that, planning included, goes to subagents (or agy where allowed). It delegates by default without asking permission, and checks in with Ant only when genuinely unsure how to proceed. **No agent ever reviews or approves its own code**: implementation and review are always different agents, no exceptions.

**Subagents** are spun up by the orchestrator, do one job, report back, stop; none talk to Ant. **Investigator** (read-only research/diagnosis), **Code Reviewer** (never shares a session with the Investigator), **Planner** (writes the implementation plan), **Code Writer** (implements the approved plan), **Docs** (documentation, glossary upkeep). Brief subagents directly rather than relying on relay files.

### Flow

1. **Session start:** read `HANDOFF.md` and `CONTEXT-MAP.md`. Only fall back to the full `03-SPEC.md` if something is genuinely ambiguous. `01-CRD.md` is read once at spec creation, not reloaded in normal build work.
2. **Scope check** (below).
3. **Problem agreement:** the orchestrator interrogates the problem with Ant, agrees the outcome, and files the GitHub issue with a testing checklist. This is the approval gate before any planning.
4. **Autonomous execution:** once the plan is approved, Investigator, Planner, Code Writer, Docs, without interrupting Ant, except on an escalation trigger.
5. **Preview and labelling:** code goes to a preview branch; the checklist is generated; routing per Review and merge below.
6. **Wrap-up:** when asked, summarize progress into a clean commit, update the PR description, and rewrite `HANDOFF.md` (including exactly which ticket/section of `03-SPEC.md` was last active). `HANDOFF.md` holds where-we-left-off only; git history holds prior versions. Durable facts go to their home in the pointers above, never into `HANDOFF.md`.

### Scope-check triage

- **In spec:** proceed to planning and execution.
- **Out of spec:** don't scope it, don't touch the CRD. Append one line to `CHANGE-LOG.md` (date, one-line description, affected area, status `pending`), label the turn `out-of-spec`, tell Ant plainly what was logged. Nothing else happens until he triages it.
- **Exception, clear bug fixes:** an unambiguous bug (intended behaviour clearly broken) skips triage: file an issue and build the fix.

### Escalation triggers

After plan approval, subagents work autonomously **except** when (a) the change touches a locked invariant or architecture decision flagged in `03-SPEC.md` section 0, including schema or migration changes and RLS or other security-policy changes, or (b) a "bug fix" turns out to touch a locked invariant or is genuinely ambiguous, or a genuinely new question comes up that the plan did not anticipate. Then: stop, label the issue `needs-info`, and get a decision from Ant.

### Review and merge approval

- A review that comes back **clean**: the orchestrator approves and merges directly on Ant's behalf; it is not put to him as a decision.
- A review that finds **actual issues**, or **genuine ambiguity**: surface to Ant instead of auto-approving.
- **Docs-only PRs:** a PR changing only documentation or tooling scripts (no app code, no behaviour) never goes in front of Ant. A subagent (never the author) reviews it, the orchestrator fixes anything found, then merges. No version bump. Escalate only if the review finds a locked-invariant touch or real ambiguity.
- `needs-manual-test`: when a change touches layout, styling or platform-native behaviour needing hands-on verification, label it and ping Ant before merge. Target iOS Safari.
- **Manual-test checklist format:** numbered scenarios, each with (1) a short bold title, (2) exact setup steps, (3) one ✅ line with the pass condition, (4) an optional ❌ line only for a specific wrong-looking failure worth naming. Call out any step that must happen without a reload, in a single tab, or on a specific device. Separate PC and iPhone lists, in plain language, and post the test record on the issue, not only the PR description.

### Token / context budget (soft guideline)

Aim for roughly 150k-180k context tokens per session/ticket. Not a mechanical cutoff: Ant is on the Pro plan and wants tokens economized, but restarting a near-finished task costs more than pushing through. Bias toward finishing a nearly complete task. If genuinely unsure whether to continue or hand off, ping Ant and let him decide.

### Versioning and version footer

`mobile/app.json` `expo.version` is the source of truth; keep `package.json` in step. Bump the patch (+0.0.1) on every code PR; docs-only PRs do not bump. The footer on the Household screen shows `version · Live/Preview/Dev` (built from `mobile/src/lib/buildInfo.ts`), so Ant can tell preview from live. Never hardcode a version or environment string. Details: `docs/environment.md`.

### Branching

Never commit directly to `main`; work only on milestone branches. Issue closure triggers merge.

### Labels

- `needs-triage`: applied on filing, removed after review.
- `needs-info`: manual input required from Ant; always paired with a direct message to him, never left silent.
- `ready-for-agent` / `ready-for-human`: whether the agent team can execute the whole ticket, or part needs Ant directly (a design call, third-party dashboard config, account setup).
- `needs-manual-test`: pings Ant for hands-on verification before merge.
- `needs-merge-approval`: only when a review found issues or there is genuine ambiguity, not the default for clean changes.
- `out-of-spec`: outside the current spec; logged to `CHANGE-LOG.md`, not actioned until Ant triages it.
