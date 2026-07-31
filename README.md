# Project Template — How To Use

Copy this whole folder to start any new project. Rename the folder to the project
name. Then work through the steps in order.

## Order of operations

1. **Run the `crd` skill.** Don't hand-fill a CRD template — the skill runs a live,
   one-question-at-a-time interview and produces `01-CRD.md` for you. This is the
   client-requirements layer: you wearing the client hat, telling the orchestrator
   what you want.

2. **Fill in `02-DESIGN-REFERENCE.md`.** Real-world sites/apps you're pointing to for
   look and feel. Leave blank if visual/UX isn't relevant to this project.

3. **`PROTOCOL.md` is already wired in.** `CLAUDE.md` imports it (and `HANDOFF.md`)
   via `@PROTOCOL.md` / `@HANDOFF.md`, so both auto-load every session — nothing to
   copy or reference manually. Just swap `[Project Name]` and fill in the two rule
   bullets in `CLAUDE.md`. `PROTOCOL.md` itself stays unedited, same on every project.
   Project-specific hard invariants (schema rules, locked architecture decisions) go
   in `03-SPEC.md`, not here.

4. **Turn the CRD into a spec.** Prompt: *"Read 01-CRD.md and write 03-SPEC.md,
   sliced vertically so each slice is independently testable, per PROTOCOL.md."*
   Not a named skill yet — a direct prompt, until/unless you build a `to-spec` skill
   the way you did with `crd`.

5. **Break the spec into tickets.** Prompt: *"Read 03-SPEC.md and file one GitHub
   issue per slice, labeled ready-for-agent or ready-for-human as appropriate."*
   Same caveat — direct prompt, not a skill, for now.

6. **`HANDOFF.md` and `CHANGE-LOG.md` are already stubbed in this folder.** Nothing
   to do here yet — the Protocol writes to them as work happens (Step 5 writes
   `HANDOFF.md` at session-end, Step 1 appends to `CHANGE-LOG.md` on out-of-spec
   requests).

7. **End the session.** Development starts fresh next session, with the orchestrator
   reading `HANDOFF.md` first per Protocol Step 0.

## What's in this folder

| File | Filled in by | When |
|---|---|---|
| `CLAUDE.md` | You, by hand (project name + rules) | Before first session |
| `01-CRD.md` | `crd` skill (interview) | Before anything else |
| `02-DESIGN-REFERENCE.md` | You, by hand | If visual/UX matters |
| `PROTOCOL.md` | Copied in unedited, auto-loaded via `@import` | Every project, identical |
| `03-SPEC.md` | Direct prompt, following PROTOCOL.md | After CRD exists |
| `HANDOFF.md` | Orchestrator, auto-loaded via `@import`, written at every session-end | Ongoing |
| `CHANGE-LOG.md` | Orchestrator, on out-of-spec requests | Ongoing |

## Documentation reminder

Nothing in here should restate what the codebase already explains. If a reader could
get it by opening the code, it doesn't belong in a doc. These files exist for the
things code *can't* say — decisions, reasoning, rejected paths, voice/tone.
