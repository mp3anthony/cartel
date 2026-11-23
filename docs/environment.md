# Environment and operations
Names only; never put secret values in this repo. The repository is public and production holds real user data.

## Hosting
- Repo: `mp3anthony/cartel` (public; `origin/main` is the real main). Never commit to `main`; work on branches.
- Vercel project `cartel` (Hobby). Production builds from `main`; every other pushed branch gets a preview. Root Directory is `mobile`; build and output come from `mobile/vercel.json`.
- Production is public at the stable alias `cartel-kappa.vercel.app` and the custom domain `cartel.hazardousschematics.com`. Previews sit behind Vercel SSO: use the Vercel MCP `get_access_to_vercel_url` for a 23-hour shareable link (also the way to test on a phone). Deployment Protection is a Vercel project setting (`preview` only), not code: see `docs/adr/0004-vercel-protection-preview-only.md`.

## Supabase
- One project, free tier, region ap-southeast-2, shared by local dev, previews and production: there is no dev or staging copy.
- Anonymous sign-ins are enabled (`docs/adr/0003-anonymous-auth-no-login-wall.md`).
- Edge Function `report-feedback` creates GitHub issues from in-app feedback. Its secret is `GITHUB_BUG_REPORT_TOKEN` (set by Ant in the dashboard or CLI); `SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected automatically. The token is never an `EXPO_PUBLIC_` variable. It accepts types `report` (current app), legacy `bug`/`feature` (cached pre-0.0.57 clients) and `store_missing`. Deploy the function BEFORE the app, or the new client's `report` type is rejected.
- Storage bucket `feedback-screenshots` is public-read (see `docs/lessons.md`).
- `public.locations` is the seeded Store catalog, read-only to clients since `20261005000001`. Adding a store means updating `supabase/seed/store-catalog-christchurch.csv`, writing a migration, and the orchestrator applying it (see Migrations).
- Realtime: only `lists`, `list_items` and `shop_sessions` are in the `supabase_realtime` publication. `locations`, `location_items` and `location_checkoffs` are deliberately not: they load on mount and refresh after a write. A table absent from the publication emits no events. `useLists` is unfiltered (RLS scopes the rows; one filter cannot say owner-or-household) and `useListItems` filters on `list_id`; the asymmetry is deliberate. `useLists` also fires on item changes, because statement-level triggers on `list_items` bump `lists.last_activity_at` (#89).

## Migrations
- Applied by the orchestrator through the Supabase MCP (authorised by Ant, 2026-10-11, for all migrations), following the runbook: single-statement pre-flight checks, a rolled-back dry run, the real run, post-checks, then the tests. Ant's "go" is needed before the real run only when the migration touches a locked invariant or architecture decision in `03-SPEC.md` section 0, changes RLS or other security policy, or deletes or rewrites user data.
- Two-step migrations (#89 precedent): apply the additive migration first (the old frontend keeps working), merge the frontend, then apply the retiring migration once Live shows the new version. Deploy-check queries are single statements.
- Dashboard SQL editor: on `rls_finish_shopping.sql` (it creates a temp table) choose "Run without RLS"; "Run and enable RLS" gives `relation "snap" does not exist`. A test ending in a `set_config` result row with no red error is a pass.
- After a Postgres major upgrade run `reindex index public.list_items_live_name_key` (the name fold depends on ICU tables), then `scripts/check-item-name-parity.mjs` and `supabase/tests/item_location_labels.sql`.
- Journal (checks in `supabase/checks/`, reverts in `supabase/rollback/`, tests in `supabase/tests/`):
  - #106 list-item fold: revert `106_list_items_revert.sql`. Location fold C1 (`20261011000000`): `106_location_items_revert.sql`. Labels and votes C2 (`20261012000000`): `106_c2_revert.sql`. All back up into schema `migration_106`. ADR 0008.
  - #90 leave household (`20261018000000`): revert `090_leave_household_revert.sql` (app first). Test `rls_leave_household.sql`. ADR 0009.
  - #112 Item location label guard (`20261114000000`, applied through `execute_sql`, so not in Supabase's migration history): revert `112_item_location_guard_revert.sql`. `106_c2_revert.sql` must not run unless #112 is reverted first.
- **Overdue:** the `migration_106` backup schema drop (due after 2026-11-10; it holds `voter_id` data). It is its own change, on Ant's separate go. That PR must also fix the `migration_106` schema-privilege asserts in `supabase/tests/item_name_fold_lists.sql` and `supabase/tests/item_name_fold_locations.sql`, and retire the `106_*` checks and rollback files and `supabase/tests/location_labels_transform.sql`.

## Environment variables
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: ship in the bundle by design (see `mobile/.env.example`).
- `EXPO_PUBLIC_VERCEL_ENV`: stand-in for Vercel's `VERCEL_ENV`, because Expo inlines only `EXPO_PUBLIC_*`. `mobile/vercel.json` forwards it in the build command.
- No Google Places key: #52 was closed as superseded by #107 (seeded store catalog, ADR 0007).

## Local development
- Web dev server on port 8082 (`npm --prefix mobile run web -- --port 8082`; `.claude/launch.json` uses it, 8081 is often occupied). Test against local dev, never production: every origin points at the same live Supabase project. Cleanup must never be a blanket wipe (`docs/lessons.md`). `expo export --platform web` is the build Vercel runs.

## Version footer
- `mobile/app.json` `expo.version` is the source of truth; `mobile/package.json` is kept in step. `mobile/src/lib/buildInfo.ts` reads it (`expo-constants` is not resolvable from app code). The footer is the first of two lines at the bottom of the Settings screen, `Cartel. v<version> · Live | Preview | Dev` (the second line is the copyright). Production is Live, a preview deploy is Preview, an unset channel (local dev) is Dev, never "undefined". Never hardcode a version or channel.

## Design reference Artifact
- `02-DESIGN-REFERENCE.html` is published as the Design Reference Artifact; republish it to the same Artifact at every change, and never overwrite any other Artifact.
