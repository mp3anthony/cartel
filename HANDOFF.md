# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- Ticket / spec section: 03-SPEC.md § Slice 0, filed as issue #10.
- Ticket / spec section: 03-SPEC.md § Slice 1, filed as issue #1.
- Status: **Slice 0 done and closed** (#10, PR #11). Deployed at https://cartel-kappa.vercel.app. **Slice 1 (#1) is now active, at Protocol Step 2** — scope questions raised with the client, not yet answered, no planning started.
- Next step: agree the Slice 1 scope questions (multi-household? invite-code lifecycle? is a household optional?), then the palette, then plan.

## Notes for next session

- Repo was recreated fresh at https://github.com/mp3anthony/cartel — old sync-engine-era history was deliberately left behind, not carried forward (see commit b653b3d, root commit of `main`).
- Design reference locked 2026-08-09 from five client screenshots (now in `design-refs/`). Tone is warm & friendly; the two dark/neon refs are recorded as *anti*-references, keeping only the ring-progress motif. Glanceability was deliberately scoped to Shopping Mode alone, not the whole app — that split is intentional, don't "fix" it.
- Palette was deliberately left unlocked: directional constraints only (light ground, single saturated accent, warm neutrals, no neon). Actual values get chosen during Slice 1 UI work.
- The accessibility baseline in 02-DESIGN-REFERENCE.md was written by the orchestrator, not specified by the client — it's a sensible default, not a client requirement. Revisit if it conflicts with something.
- Slice 0 was split out 2026-08-10 because slices 1-9 are all specced as vertical paths that assume an app and backend already exist. Three scope calls were made deliberately: anon auth stays in Slice 1 (so #1 needed no edit), theme *plumbing* is Slice 0 but palette *values* stay Slice 1, and no test/CI harness is in Slice 0 at all. Note issue #10 sorts after #9 despite being first — title carries the order, not the number.
- #4 and #7 were partly ready-for-human because the design reference was missing. That block is now lifted — worth re-checking whether they can move to ready-for-agent.
- CLAUDE.md's "## Rules" section still has placeholder bullets — fill in before relying on it for project-specific rules.
- Supabase project is `cartel`, ref `chacavfoewyiwrfgvxtj`, ap-southeast-2, free tier. Free-tier projects pause after ~7 days idle; the first call back then times out until it's woken from the dashboard.
- The connectivity probe uses `/auth/v1/health`, not the PostgREST root. The root answers 401 for every key while no schema is exposed, so it cannot tell a healthy project from bad credentials. Revisit once Slice 2 adds tables — a real query is the stronger check.
- Vercel was agreed as a **review surface** (shareable link, home-screen bookmark), not a platform change. React Native stays the target per 03-SPEC.md § 0. Drag-to-reorder and animated transitions (Slice 5+) don't behave the same under react-native-web, so those acceptance tests need a real device.
- Local branch `main` still holds the abandoned sync-engine history; `origin/main` is the fresh root. Anyone checking out `main` locally gets the wrong repo. Worth deleting or renaming.
- Vercel project `cartel` (mp3anthony's projects, Hobby) builds from `main` with Root Directory `mobile`; build/output come from `mobile/vercel.json`. Env vars `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set for Production and Preview — a new variable needs a redeploy, since Expo bakes them in at build time.
- Vercel's root-directory picker at import time only ever offered the repo root, even after `mobile/` was on `main` — its cached file tree was stale and the field is read-only there. Set it in Settings → Build and Deployment instead, where it's free text.
- Android and iOS have **never been run**. Recorded on #10 rather than implied to pass. The Vercel link is the agreed review surface for the client and their testers; Expo Go was considered and rejected as day-to-day workflow. First native run lands in Slice 1 — treat any native-only breakage as expected-but-undiscovered, not a regression.
- Slice 0 set `persistSession: false` on the Supabase client because there was no storage adapter and no auth. Slice 1 must add one (AsyncStorage), or every app restart mints a fresh anonymous user and the household is lost. This is scope Slice 1's issue does not mention.
