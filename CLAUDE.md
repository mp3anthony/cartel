# CLAUDE.md — [Project Name]

@PROTOCOL.md
@HANDOFF.md

Both files above load automatically every session — no need to ask for them.

## Rules

- The orchestrator delegates planning, review, design and large read-and-think work to Antigravity per
  `GEMINI-DELEGATION.md`, decides that itself without asking Ant, and falls back to Claude subagents on exit
  code 3. agy may fill the Planner or Code Reviewer role (never the Code Writer, never reviewing a plan it wrote
  as if independent) and never writes to the repo; PROTOCOL.md's pipeline still applies.

Nothing else belongs in this file. Explanations belong in the code, decisions and
reasoning belong in `SPEC.md`/ADRs, not here.
