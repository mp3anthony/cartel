# HANDOFF
> Where we left off: current state and carry-over only. Rewritten at every wrap-up.
## Current state (2026-11-24, session 65)
- Docs-only repo tidy-up for home issue 17 (this PR): purpose paragraph and `CLAUDE.md` under 40 lines, workflow moved to `docs/workflow.md`, two dead research notes and closed `CHANGE-LOG.md` rows removed, `docs/environment.md` trimmed.
- Last `03-SPEC.md` section active: none. `main` stays at 0.0.76; no app code touched. Production holds real user data.
## Carry-over
- #112 guard shipped (0.0.76). Parent #112 closed; #151 (learned walking order) open and parked, needs its own grill.
- Ant to tag an item in Shopping Mode on his iPhone to confirm it saves.
- `migration_106` schema drop is overdue (`docs/environment.md`, Migrations). Needs Ant's separate go.
- #123 drag auto-scroll and other shipped work still need an iPhone check: VoiceOver, 120 Hz, iOS Safari touch while scrolling, keyboard open. Ant raises problems as normal reports.
- `03-SPEC.md` still says learned route (Slice 7, `shop_sessions` line, Definition of Done). A note; Ant to confirm wording.
- Nits, verified real: stale "household screen" comment at `mobile/src/screens/ListDetailScreen.tsx` about line 242; uneven comment wraps in `mobile/src/navigation/types.ts` and `mobile/src/screens/FeedbackScreen.tsx`; `mobile/package-lock.json` says 0.0.36; iOS location permission string in `mobile/app.json` says "location".
- Pending `CHANGE-LOG.md` rows for Ant to triage: captcha, first name or nickname, rename household, category and spending graphs.
- Known: after a reload, Back goes to Home.
- Test data on the shared Supabase project, anonymous and inert: lists "ZZ test 102" (59344e62-4855-4942-acda-d3d45f8fe244) and "ZZ test 111" (5a348252-1488-4cf2-9d02-a904ba20546a). Clean up by id only, never a blanket wipe.
- Ant mentioned an unlogged lag issue; he will log it himself.
## Next
1. Ant's iPhone tag check in Shopping Mode.
2. `migration_106` drop, only on Ant's separate go.
- Not ready without a grill: #151.
## Where things live
- Vocabulary: `CONTEXT-MAP.md`, `docs/context/`. Decisions: `docs/adr/`.
- `docs/conventions.md`, `docs/lessons.md`, `docs/environment.md`, `docs/workflow.md`.
- `01-CRD.md`, `02-DESIGN-REFERENCE.html`, `03-SPEC.md`; out-of-spec inbox `CHANGE-LOG.md`.
- Rules: `CLAUDE.md`.
