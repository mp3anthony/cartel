# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- Ticket / spec section: 03-SPEC.md § Slice 1, filed as issue #1. **Closed.**
- Status: Slices 0 and 1 are done, merged to `main`, and live at
  https://cartel-kappa.vercel.app. Anonymous session persists across restarts,
  household creation and invite-code pairing work end to end, palette is locked.
  Verified across two independent browser sessions — never on a device.
- Next step: **Slice 2 (#2, Lists & Items)**, starting at Protocol Step 2. Its
  label says "no open questions"; that was also claimed for #1 and there were four.
  Interrogate it before planning.

## Notes for next session

**Project setup**
- Supabase project `cartel`, ref `chacavfoewyiwrfgvxtj`, ap-southeast-2, free tier.
  Free-tier projects pause after ~7 days idle; the first call back times out until
  it is woken from the dashboard. Anonymous sign-ins are enabled.
- Vercel project `cartel` (mp3anthony's projects, Hobby) builds from `main`, Root
  Directory `mobile`, build/output from `mobile/vercel.json`. Both `EXPO_PUBLIC_*`
  env vars are set for Production and Preview. Expo bakes env values in at build
  time, so a changed variable needs a redeploy, not just a save.
- Repo was recreated fresh; old sync-engine history was deliberately left behind.
  Local branch `main` still holds that abandoned history — `origin/main` is the real
  one. Anyone checking out `main` locally gets the wrong repo. Worth deleting.

**Decisions that will look like mistakes if you don't know why**
- **No navigation library.** A deliberate client call, taken knowing the cost lands
  in Slice 2. Screens are chosen from state in `App.tsx`. Slice 2 is the moment to
  revisit it — do not silently extend the conditional rendering as if it were a
  pattern.
- **Writes go through security-definer RPCs, reads go through RLS.** Keep the split.
  It is what makes invariants like "one household per user" and "one redemption per
  code" atomic and checkable in one place instead of scattered through client code.
- **No RLS policy tests for merely being signed in.** Anonymous users carry the
  `authenticated` role, so "allow authenticated" means "allow everyone" — the exact
  failure 03-SPEC.md § 0 calls a hard invariant violation. Policies test membership.
- **Glanceability applies to Shopping Mode alone**, not the whole app. Intentional
  split, don't "fix" it.
- The accessibility baseline in 02-DESIGN-REFERENCE.md was written by the
  orchestrator, not asked for by the client. Sensible default, not a requirement.

**Traps**
- RLS policy expressions run as the *querying* user. Revoking a policy-helper
  function's EXECUTE from `authenticated` silently breaks every read while writes
  keep working — creating a row succeeds and reading it back throws. Cost an hour;
  see migration `20260810000002`.
- Android and iOS have **never been run**, and that is recorded on #10 and #1 rather
  than implied to pass. The Vercel link is the agreed review surface for the client
  and their testers; Expo Go was considered and rejected as day-to-day workflow.
  Treat native-only breakage as expected-but-undiscovered, not a regression.
- Test users are anonymous rows in `auth.users` with `is_anonymous = true`. Reset
  between runs with
  `delete from public.households; delete from auth.users where is_anonymous = true;`

**Loose ends**
- Palette is locked (burnt orange `#C2410C`) with measured contrast ratios in
  `mobile/src/theme/tokens.ts` — that file is the source of truth, not the design doc.
- #4 (location merge UX) and #7 (route-learning heuristic) were labelled
  ready-for-human because the design reference was missing. That block is lifted —
  re-check whether they can move to ready-for-agent.
- `CHANGE-LOG.md` has two pending items neither of which is built: captcha on
  anonymous sign-in, and orphaned households after member removal.
- CLAUDE.md's "## Rules" section still has placeholder bullets.
