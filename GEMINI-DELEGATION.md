# Delegating to Antigravity (agy)

Set up 2026-09-26 for Ant; kit copied per repo.
**The orchestrator decides when to delegate, per session, without asking Ant.** Ant only reviews when a
result is his to judge (design output, anything visual or taste-driven).

## How
`powershell -NoProfile -File scripts/agy-delegate.ps1 -Task plan|review|design|quick -PromptFile <f> -Files <repo paths>`
- Write the prompt file in the scratchpad, never in the repo.
- agy runs in `D:\Anthonys-HQ\business\hazardous-schematics\agy-workspace\<repo-folder-name>\`, one workspace per
  repo, holding only fresh copies of the named files. It never sees the repo, `.env`, `db/` or Git. The script wipes
  that folder each run (except `outputs\`).
- Every answer is also saved to `agy-workspace\<repo>\outputs\<timestamp>-<task>.md`.
- The cooldown file `agy-workspace\_state.json` is **shared by all repos** on purpose: the Google quota belongs to
  Ant's account, so one repo hitting the limit tells every repo.
- The reusable kit for new repos lives in `D:\Anthonys-HQ\business\hazardous-schematics\agy-delegation-kit\`.

## Which model (routing table lives at the top of the script; edit it there)
| Task | Model | Why |
|---|---|---|
| plan | claude-opus-4-6-thinking | most capable, worth the spend on plans and hard decisions |
| review | gemini-3.8-flash-medium | cheap, good enough for code review, audits, summaries |
| design | gemini-3.1-pro-high | strongest Gemini for briefs, copy, visual direction (orchestrator's pick, untested) |
| quick | gemini-3.8-flash-low | trivial lookups |

## Fallback when Google's limit hits (or agy fails or returns nothing)
- The script exits **3** and prints `AGY_UNAVAILABLE`. It records a 60-minute cooldown in `agy-workspace\_state.json`
  so later calls skip agy without wasting time.
- **On exit 3 the orchestrator does the task itself with Claude subagents** (never blocks on agy, never asks Ant).
- To check whether agy is back: `... agy-delegate.ps1 -Probe` (tiny cheap call; prints `AGY_AVAILABLE` and clears the
  cooldown). Probe at session start if a cooldown is recorded, and whenever a delegation is next worthwhile.
- Untested: a real quota hit (the detector matches quota/rate-limit/429 wording; adjust `$quotaPattern` if the
  real message differs). An empty answer also counts as unavailable.

## Rules
1. **Read-only, text out.** agy edits nothing and runs no commands. The orchestrator applies anything useful.
2. agy's `--print` mode ignores `permissions.allow` (google-antigravity/antigravity-cli#548), so it can't
   approve shell commands headless; it is told to use only its file-read tool inside the workspace.
3. **Never** `--dangerously-skip-permissions`, `--mode accept-edits`, or the gemini-cli MCP.
4. Secrets never go out (exit 4 on refusal): only allowlisted plain source/doc types are copied (`.md .txt .ts .tsx
   .js .jsx .mjs .css .json .html .svg .yml .yaml .ps1 .toml`); anything under `.git`, `.vercel`, `.next`,
   `node_modules`, `db/`, any `.env*`, `.npmrc`, key/cert files, names containing secret/credential, symlinks, and
   anything outside the repo is refused. It is a filter, not a guarantee: never name a file you suspect holds secrets.
5. **Suited to:** planning, review (agy is the independent reviewer, never the writer of the same code), audits
   against `02-DESIGN-REFERENCE.md`, design and copy ideas, large-context reading.
   **Never:** Git/GitHub, migrations, env, production. Those stay with the orchestrator.
6. **Design work carries the foundation:** every UI brief includes `02-DESIGN-REFERENCE.md` via `-Files`, and
   agy's output is checked for building on it, not replacing it. The locked palette's source of truth is
   `mobile/src/theme/tokens.ts` (include it too when colour is in play).
7. **Its output is a claim, not a fact.** Verify before acting; design output is shown to Ant for approval
   before anything ships. Image or asset generation is untested.
8. Prefer delegating when the input is large or the job is read-and-think; skip it for small edits.
