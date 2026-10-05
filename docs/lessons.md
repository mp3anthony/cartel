# Lessons and known items

One line each. These were learned the hard way; do not relitigate them. Production holds real user data.

## Testing

- Live-check recipe (orchestrator only): clear `localStorage` and reload for a fresh anonymous user, seed the location, list, items and tags scoped to that user's id in one CTE `execute_sql`, exercise the UI, delete, then recount at zero. A stale session whose user was deleted makes inserts fail their foreign key.
- Cleanup must never be a blanket wipe: anonymous rows include real users. Select first, confirm every row was created this session, delete only those ids, and leave pre-existing test rows alone. Delete test GitHub issues that live tests create. The dev server reads the same Supabase project production uses; there is no disposable copy.
- Two tabs of one browser profile are the same user. Genuine two-session checks need two profiles, and confirm the two `auth.uid()` values differ before trusting the result.
- No test harness beyond SQL via `execute_sql` (no local CLI, config or Docker). Each call commits on its own, so chain state inside one call. `supabase/tests/realtime_lists.sql` checks publication membership only; live event delivery needs a manual two-session check. `execute_sql` returns only the last statement's result, so a capture such as a timestamp plus rows must be one statement (subselects or `json_agg`).
- Denied-RLS negative tests must read ground truth through the bypass role, never through the denied actor's own query (it sees nothing either way). When a change reverses a prior stance, update the older test and its header in the same PR.
- Seed real data rather than testing empty states, and scope clicks on near-identical rows by accessibility label or `read_page` ref, never by walking parent levels (a wrong write to production data does not announce itself; verify with a direct query).
- Code review misses same-tick races; the orchestrator's live check (three synchronous Enter keydowns on one field) found what reasoning did not. To test an in-flight race, wrap `window.fetch` to delay the POST.
- Enter and text in the Browser pane: `computer{key}` does not reliably reach react-native-web's keydown handler, so dispatch a `KeyboardEvent` through `javascript_tool`. `computer{type}` sometimes does not land text: set the native value and dispatch an `input` event. Clicks by `ref` can silently no-op right after a navigation; fall back to `element.click()`.
- Screenshots can return a stale frame or fail ("pane not displayed"): trust DOM, computed-style and DB reads, then re-screenshot. If DOM reads are also zero-size, ask whether the setup changed. `resize_window` preset `desktop` forces real compositing; `colorScheme` emulation needs a real dimension change plus reload.
- Geolocation needs both `navigator.geolocation.getCurrentPosition` and `navigator.permissions.query` mocked, or "granted" cases silently take the denial path. A failed location creation leaves permission denial sticky until the screen remounts.
- Headless Chromium cannot drive a native photo picker: inject a `File` into the hidden file input and dispatch `change`. A real phone keyboard cannot be observed; test the mechanism (focus stays, `defaultPrevented`).
- `PrimaryButton` is `aria-disabled` with an empty draft, so a synthetic mousedown reports `defaultPrevented` false; set text first.
- react-native-web 0.21 does not map `accessibilityState.checked` or `.busy` to `aria-checked` / `aria-busy`; `CheckTarget` in `ui.tsx` carries both for that reason.
- Verify the built output, not just the dev server: `npx expo export --platform web` caught the favicon-swallow bug in `public/index.html`.
- Native builds never run; iPhone Safari web and PWA is the tested surface. Native-only breakage is expected but undiscovered, including the iOS light and dark icon switch and the Android monochrome icon.

## Supabase

- **Shared single project, no dev or staging.** A migration that revokes a grant the deployed frontend relies on breaks production the moment it is applied (2026-09-06: "You don't have access to that"). Apply the migration and merge the frontend in one short window, or hold revokes for a fast-follow migration after the frontend is live.
- Manual tests on a Preview: it is a separate anonymous user from the Live login, with no lists or household, so tests there must use a throwaway list made on the Preview.
- An optional argument on a same-name PostgREST overload causes PGRST203; give the new RPC its own name (`reset_list`) rather than overloading.
- Guards on server-maintained columns at insert time must be triggers: the table-level INSERT grant would otherwise let clients set them.
- When retiring an RPC across a two-step deploy, redefine the old signature in step one so it stays consistent with the new schema until it is dropped (#89: the old `finish_shopping(uuid)` could otherwise double-record while the old frontend was still live).
- Reversals work by recorded ids, never by timestamp. Read any column a later step will disturb before disturbing it (in #89, `last_activity_at` before unticking), and drop the triggers before bulk data fixes.
- `finish_shopping` locks items then the list; the `last_activity_at` triggers touch the list after item writes, so keep that item-then-list order in any new function.
- A `security definer` RPC is needed once no single column change can claim atomicity: lock the rows, re-check live state, do all writes in one transaction, so two concurrent calls serialise (`finish_shopping`, the correction vote).
- RLS expressions run as the querying user: revoking a policy helper's `EXECUTE` from `authenticated` silently breaks every read while writes keep working.
- `set search_path = ''` breaks bare operators too: `nearby_locations()` needs `OPERATOR(extensions.@>)` for cube and earthdistance.
- `location_item_votes.voter_id` references `auth.users`, so seeding a proposal from "someone else" needs a throwaway anonymous `auth.users` row; delete it afterwards.
- Storage: direct SQL `DELETE` on `storage.objects` is blocked. The `feedback-screenshots` bucket is public-read (required for GitHub's image bots) with authenticated own-folder insert and no delete path, like `location_items`. One test object is permanently orphaned there, harmless.
- Edge Function secrets: no MCP tool manages them. Ant sets `GITHUB_BUG_REPORT_TOKEN` through the dashboard or CLI; agents never handle a token.
- **report-feedback reasoning (cited by #68 and #69, PR #71; screenshots #70, PR #75).** Feedback becomes a GitHub issue through an Edge Function, not from the client, so the token never ships in the bundle. The function verifies identity server-side and never trusts the client, creates the `from-app` label idempotently, and returns 401 when unauthenticated. It is modelled on the sibling funded project's bug-report route. Rate limiting is deferred until real outside testers; contact-back is deliberately omitted (a patch-notes or known-issues feature would supersede it).
- A permission classifier blocks direct SQL writes to live production data; build the in-app path rather than routing around it. It also blocks agents applying migrations to production: agents write the migration file plus single-statement pre/post-flight checks, and Ant applies it by hand (#107 Migrations A and B).

## Tooling

- **Keyboard-close lesson (`ui.tsx`, `keepFocus`).** The mobile keyboard closing while adding items has two separate causes: the Return-key submit path (PR #60, `blurOnSubmit={false}`) and a tap on a neighbouring button shifting focus off the field (PR #61, `keepFocus`). `keepFocus` (web `onMouseDown` preventDefault) is opt-in, only for buttons next to a "keep typing" field.
- react-native-web: `textAlignVertical: 'top'` disables a `TextInput`'s vertical centring and a textarea never centres; give multiline inputs explicit `paddingVertical` and verify with computed styles.
- Two mounted `useListItems` hooks for one list collide on the Realtime channel and crash; `ListDetailScreen` stays mounted under `ShoppingScreen`, so topics carry a per-mount `useId()` suffix. Watch for any second concurrent consumer of a list-scoped hook.
- `expo-constants` is in the lockfile but not resolvable from app code; the version is read from `app.json` instead.
- `mobile/.env` can be corrupted by repeated appends (UTF-16, a BOM, leftover placeholders); read it back after any rewrite.
- Never set worktree isolation on an Agent call that continues a subagent via `SendMessage`; the worktree can vanish mid-session. After a merge, if `git push` is not a fast-forward, look for an unpushed commit that predates the session.
- Subagents cannot reach the Browser pane (it reads 0x0, screenshots fail); do not spawn a Verifier expecting it to.
- iOS PWA status bar: `expo-status-bar` is a no-op on web; chrome colour comes from the `theme-color` meta, the manifest `theme_color` and the top element's background. Its icon colour is one static choice (unverified).
- Generating icons: use resvg-js rather than sharp's librsvg for SVG with a data-URI `@font-face`.

## Process

- State plainly when a change was not live-reproduced or a theme or native build was not rechecked. Orchestrator-run passes with no full pipeline are flagged as deviations in the PR and handoff. Never self-review.
- Do not assume a report is a bug before checking the human context: #64 (a missing item tag) was not a bug; the user had never tagged it.
- Live verification caught bugs static review missed (`submitBehavior`, `headerBackVisible`); keep it in the flow.
- Diagnose identity and origin before blaming auth code: "new household every push" was a Vercel project setting, not code (`docs/adr/0004-vercel-protection-preview-only.md`).
- #102 "the x did nothing": cause NOT confirmed and not reproduced (diagnosed from code and migrations only; production not inspected). Ranked guesses: (1, ~60%) the "×" lived on the second line of the `autoFocus` pencil editor, so a tap closed the iOS keyboard and the shifting layout lost it; (2, ~25%) the editor's cancel "✕" was tapped instead; (3, ~10%) a silent 0-row update; (4, ~5%) a double-tap dropped by `mutatingRef`. 0.0.37 moves "×" onto the row with an inline confirm (removes guess 1) and turns a 0-row result into an error (surfaces guess 3), without proving either.
- #102 slice 3 drag (0.0.39): hand-rolled `PanResponder` handle with `touch-action: none`, `user-select: none` and a non-terminable responder, no gesture library. iPhone (iOS Safari) result: Ant tried the drag and said it looked pretty good; scenarios 3-7 (page scroll, small nudge, Shopping Mode, live sync, drag while editing) and the divider/callout checks were NOT tested, by his choice; he will raise a bug if any fails.
- Do not chase an unreproducible symptom (a 12 s check-off stall measured about 210 ms locally); fix perceived latency and say the cause was not reproduced.
- Parallel PRs bumping the same version field conflict trivially; bump inside the PR, not after merge.

## Known non-blocking

- **Boot failure, blank page (#42): never root-caused.** On mobile data the page was truly blank, never the recovery screen. Leading hypothesis: the JS bundle failing to fetch or parse on a weak connection, or a throw before the error boundary mounts. PR #50 added `AppErrorBoundary`, which only catches throws inside the mounted tree; PR #67 added a static fallback in `mobile/public/index.html` that shows "Cartel didn't load" with Reload if the root is still empty after 8 s (chosen versus about 200 ms normally, never tuned on a real slow load). If reported again, ask which screen showed: blank, "Cartel didn't load", or "Cartel hit a snag".
- Version footer was verified live in all three environments on its first release: `Dev`, `Preview`, `Live`.
- "JWT issued at future" (#117) is PostgREST error PGRST303 (HTTP 401), not an auth-js error: the token's `iat` is later than PostgREST's cached clock. Known upstream bug (supabase discussion #48123, PostgREST #5172), intermittent, not region-specific, not device clock skew. Most likely raised by the first PostgREST query after a fresh sign-in (household or lists load), not by `signInAnonymously`; a reload clears it because another thread answers. Unverified: the project's PostgREST version, and whether the failing call is the first query (a `household` rather than `session` diagnostic stage would confirm it). Shipped in 0.0.41: `retryOnJwtIssuedAtFuture` (`lib/postgrestRetry.ts`) retries the household and lists read loaders on `code === 'PGRST303'` only, after 300/800/1500 ms, logging `[cartel:postgrest-retry]` with a `label`. When retries run out, a friendly message shows and the Lists screen offers "Try again". Never re-run `signInAnonymously` or clear the session on error (ADR 0003).
- Scroll-to-top on error can push a focused editor in another row off-screen (accepted). Rapid double-taps in list detail are dropped, not queued.
- `PrimaryButton` lacks `aria-busy` (react-native-web does not map `busy`). `NavMenu`'s scrim has one pre-existing hardcoded colour.
- A denied location permission is sticky until remount, with no retry button or settings link; a "check settings" flow would be new scope.
- `SHOP_SESSION_HISTORY_CAP` (5) was not live-stress-tested (bulk insert to production was blocked); it rests on code review. The 8 MB screenshot cap is unconfirmed with Ant.
- Unverified or cosmetic: the iOS status-bar icon colour (one static choice), and nested-button hydration warnings from `ListDetailScreen` rows.
- #52 Places search-assist is closed, superseded by #107 (seeded store catalog, ADR 0007). Google Places was rejected because its terms forbid caching or storing Places content, and it needs an API key and billing prepayment. The old local branch `52-google-places-search-assist` is obsolete.
- Captcha on anonymous sign-in, orphaned households after a member leaves, and item quantities are not built; see `CHANGE-LOG.md`.
- `docs/research/todoist-list-ui.md` draws on Ant's screenshots, not a primary source.
- No leave-household action exists, so someone already in a household cannot join another. Tracked in #90.
- Driving the app in the in-app browser: `type` plus Return does not reliably submit the add-item field; fill it with `form_input`, then click "+". Click by `ref` or by frame coordinates, never screenshot pixels. A fresh origin can show "JWT issued at future" (#117); it should self-heal, and if it still shows, tap Try again.
