# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- Ticket / spec section: 02-DESIGN-REFERENCE.md (now complete). Spec issues #1-#9 remain filed in mp3anthony/cartel.
- Status: CRD, spec, and design reference all done. Issues filed and labeled (ready-for-agent: #1,#2,#3,#5,#6,#8,#9 — ready-for-human: #4 location merge UX, #7 route-learning heuristic). Nothing built yet.
- Next step: Slice 1 (#1, Household Identity & Pairing). Protocol Step 2 (Problem Agreement) before any planning or build begins.

## Notes for next session

- Repo was recreated fresh at https://github.com/mp3anthony/cartel — old sync-engine-era history was deliberately left behind, not carried forward (see commit b653b3d, root commit of `main`).
- Design reference locked 2026-08-09 from five client screenshots (now in `design-refs/`). Tone is warm & friendly; the two dark/neon refs are recorded as *anti*-references, keeping only the ring-progress motif. Glanceability was deliberately scoped to Shopping Mode alone, not the whole app — that split is intentional, don't "fix" it.
- Palette was deliberately left unlocked: directional constraints only (light ground, single saturated accent, warm neutrals, no neon). Actual values get chosen during Slice 1 UI work.
- The accessibility baseline in 02-DESIGN-REFERENCE.md was written by the orchestrator, not specified by the client — it's a sensible default, not a client requirement. Revisit if it conflicts with something.
- #4 and #7 were partly ready-for-human because the design reference was missing. That block is now lifted — worth re-checking whether they can move to ready-for-agent.
- CLAUDE.md's "## Rules" section still has placeholder bullets — fill in before relying on it for project-specific rules.
