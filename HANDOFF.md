# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- Ticket / spec section: 03-SPEC.md § Slice 0, filed as issue #10.
- Status: CRD, spec, and design reference all done. Issues filed and labeled (ready-for-agent: #10,#1,#2,#3,#5,#6,#8,#9 — ready-for-human: #4 location merge UX, #7 route-learning heuristic). Nothing built yet.
- Next step: **Slice 0 (#10, Project Scaffolding)** — Expo app boots, Supabase connected, theme plumbing in place. Protocol Step 2 (Problem Agreement) before any planning or build begins. Slice 1 (#1) follows it.

## Notes for next session

- Repo was recreated fresh at https://github.com/mp3anthony/cartel — old sync-engine-era history was deliberately left behind, not carried forward (see commit b653b3d, root commit of `main`).
- Design reference locked 2026-08-09 from five client screenshots (now in `design-refs/`). Tone is warm & friendly; the two dark/neon refs are recorded as *anti*-references, keeping only the ring-progress motif. Glanceability was deliberately scoped to Shopping Mode alone, not the whole app — that split is intentional, don't "fix" it.
- Palette was deliberately left unlocked: directional constraints only (light ground, single saturated accent, warm neutrals, no neon). Actual values get chosen during Slice 1 UI work.
- The accessibility baseline in 02-DESIGN-REFERENCE.md was written by the orchestrator, not specified by the client — it's a sensible default, not a client requirement. Revisit if it conflicts with something.
- Slice 0 was split out 2026-08-10 because slices 1-9 are all specced as vertical paths that assume an app and backend already exist. Three scope calls were made deliberately: anon auth stays in Slice 1 (so #1 needed no edit), theme *plumbing* is Slice 0 but palette *values* stay Slice 1, and no test/CI harness is in Slice 0 at all. Note issue #10 sorts after #9 despite being first — title carries the order, not the number.
- #4 and #7 were partly ready-for-human because the design reference was missing. That block is now lifted — worth re-checking whether they can move to ready-for-agent.
- CLAUDE.md's "## Rules" section still has placeholder bullets — fill in before relying on it for project-specific rules.
