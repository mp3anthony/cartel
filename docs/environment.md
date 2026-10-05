# Environment and operations

Names only; never put secret values in this repo. The repository is public and production holds real user data.

## Hosting

- Repo: `mp3anthony/cartel` (public; it was flipped private and back to public on 2026-09-26). Never commit to `main`; work on branches. The repo was recreated fresh and the old sync-engine history was left behind; `origin/main` is the real main if a stale local branch disagrees.
- Vercel project `cartel` (Hobby). Production builds from `main`; every other pushed branch gets a preview. Root Directory is `mobile`; build and output come from `mobile/vercel.json`.
- Production is public at the stable alias `cartel-kappa.vercel.app` and the custom domain `cartel.hazardousschematics.com`. Previews sit behind Vercel SSO: use the Vercel MCP `get_access_to_vercel_url` for a 23-hour shareable link (also the way to test on a phone).
- Deployment Protection is a Vercel project setting (`preview` only), not code: see `docs/adr/0004-vercel-protection-preview-only.md`.

## Supabase

- One project, free tier, region ap-southeast-2, shared by local dev, previews and production: there is no dev or staging copy. It pauses after about 7 idle days (unverified); the first call back times out until the project is woken from the dashboard.
- Anonymous sign-ins are enabled (`docs/adr/0003-anonymous-auth-no-login-wall.md`).
- Edge Function `report-feedback` creates GitHub issues from in-app feedback. Its secret is `GITHUB_BUG_REPORT_TOKEN` (set by Ant in the dashboard or CLI); `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically. The token is never an `EXPO_PUBLIC_` variable.
- Storage bucket `feedback-screenshots` is public-read (see `docs/lessons.md`).
- `public.locations` is the seeded Store catalog, read-only to clients since `20261005000001` (no insert, update or delete grant or policy). Adding a store means updating `supabase/seed/store-catalog-christchurch.csv`, writing a migration, and Ant applying it by hand.
- Migrations on this project are applied by Ant in the dashboard SQL editor, after single-statement pre-flight checks.
- Realtime: only `lists` and `list_items` (migration `20260810000004`) and `shop_sessions` (added in its creating migration) are in the `supabase_realtime` publication. `locations`, `location_items` and `location_checkoffs` are deliberately not: they load on mount and refresh after a write. A table absent from the publication emits no events whatever the client subscribes to. Subscriptions: `useLists` is unfiltered (RLS scopes the rows, since one filter cannot say owner-or-household), `useListItems` filters on `list_id`; the asymmetry is deliberate. `useLists` also fires on item changes, because statement-level triggers on `list_items` bump `lists.last_activity_at` (#89), which keeps list-row counts live.
- **Two-step migrations (#89 precedent):** with one shared project, apply the additive migration first (the old frontend keeps working), merge the frontend, then apply the retiring migration only once Live shows the new version. Each step stops for Ant. Deploy-check queries are single statements.

## Environment variables

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: ship in the bundle by design (see `mobile/.env.example`).
- `EXPO_PUBLIC_VERCEL_ENV`: stand-in for Vercel's `VERCEL_ENV`, because Expo inlines only `EXPO_PUBLIC_*`. `mobile/vercel.json` forwards it in the build command.
- No Google Places key: #52 was closed as superseded by #107 (seeded store catalog, ADR 0007), so no maps or Places API key or billing is needed.

## Local development

- Web dev server on port 8082 (`npm --prefix mobile run web -- --port 8082`; `.claude/launch.json` uses it, 8081 is often occupied).
- Test against local dev, never production: every origin points at the same live Supabase project. Cleanup must never be a blanket wipe (`docs/lessons.md`).
- `expo export --platform web` is the build Vercel runs.

## Version footer

- `mobile/app.json` `expo.version` is the source of truth; `mobile/package.json` is kept in step. `mobile/src/lib/buildInfo.ts` reads it (the `expo-constants` package is not resolvable from app code).
- The footer reads `v<version> · Live | Preview | Dev` and sits at the bottom of the Household screen only (the in-household `HouseholdScreen`, not `HouseholdSetupScreen`; two separate components, easy to confuse when testing). Production is Live, a preview deploy is Preview, and an unset channel (local dev) is Dev, never "undefined".
- Verified live in all three environments on its first release. It first shipped on the Lists screen and moved to Household. Never hardcode a version or channel.

## Delegation kit (agy)

- `scripts/agy-delegate.ps1` and `GEMINI-DELEGATION.md` come from the shared agy delegation kit. To re-sync, compare SHA-256 and copy only if the kit changed, keeping repo rule 6 (design work carries the foundation) and the "tell Ant rather than loosening the filter" line in rule 4.
- Images are not sent to agy. The 24,000-character limit includes a preamble of about 500 characters. If `agy-workspace/_state.json` shows a cooldown, run `-Probe` first. The exit-3 fallback after a real quota hit is still untested.
