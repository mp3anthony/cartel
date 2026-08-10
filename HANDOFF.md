# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- Ticket / spec section: 03-SPEC.md § Slice 4, issue #4. **Step 3 (build)
  complete — all three phases done** (backend, native-permissions, UI).
  **[PR #15](https://github.com/mp3anthony/cartel/pull/15) open against
  `main`, live-verified on the Vercel preview this session, not yet
  merged** — that's the next decision, not this session's to make. PR #14
  (list rename/remove UI) and Slice 3 (PR #13) are merged and closed, no
  longer worth their own entries here.
- **This session's build ran the full Investigator → Planner → Code Writer
  → Code Reviewer chain autonomously**, with one checkpoint agreed with the
  user along the way (already resolved, not a standing decision to revisit):
  Slice 4 has nothing to attach a selected location *to* yet (`lists` has no
  location column — that's Slice 5), so a tap/merge-confirm sets an
  **ephemeral, client-only `selected` state** with a "Selected" `Badge` —
  nothing persisted. Gives Slice 5 a working UI hook instead of nothing.
  The prior session's two backend checkpoints (merge-race-window accepted;
  `earthdistance`/`cube` over PostGIS) are already recorded in
  `02-DESIGN-REFERENCE.md` § Slice 4 and still stand, not repeated here.
- **Native-permissions phase**: `expo-location` added, `mobile/app.json` gained
  an `expo.plugins` entry with the iOS usage-description copy. New
  `mobile/src/lib/geolocation.ts` wraps `requestForegroundPermissionsAsync`/
  `getCurrentPositionAsync`, collapsing every non-granted outcome (including a
  thrown call — unsupported browser, etc.) into a single `denied` result; a
  GPS-fetch failure *after* grant is a separate, retryable `error` outcome.
  Denial is **sticky for the screen's mounted lifetime** — no retry button, no
  settings deep-link, since neither is asked for by the spec — deliberately
  narrower than a shipped consumer app would want.
- **UI phase**: new `mobile/src/screens/LocationsScreen.tsx`, reached via a
  second `ListsScreen` header button alongside `Household`. Search filters the
  already-loaded index client-side (works identically whether permission was
  granted or denied). Merge-confirm reuses the existing `Confirm` component
  with `02-DESIGN-REFERENCE.md`'s locked copy verbatim.
- **Code review** (separate pass, fresh eyes) found no blockers on spec
  conformance or codebase conventions; two copy bugs fixed directly — a denial
  message pointing "below" when the search field is above it, and a
  zero-locations empty state that contradicted itself when permission was
  denied.
- **Live-verified on the Vercel preview** (mocking `navigator.geolocation` +
  `navigator.permissions.query` via injected JS, not real device GPS): direct
  create with no nearby match, merge-prompt trigger + confirm (creates
  nothing, selects existing) + cancel (creates nothing, returns to composer
  with name intact), denial fallback (real unmocked browser permission state —
  see Traps), search filter (case-insensitive substring, both match and
  no-match copy), row-selection toggling between multiple rows, `/locations`
  deep-link, header layout at 375px width. Confirmed via direct SQL that no
  duplicate rows leaked from any of the above. Not verified: real-device GPS
  (native has never been run — see Traps, unchanged this slice).
  Test rows created during verification were deleted afterward.

## Notes for next session

**Project setup**
- Supabase project `cartel`, ref `chacavfoewyiwrfgvxtj`, ap-southeast-2, free tier.
  Free-tier projects pause after ~7 days idle; the first call back times out until
  it is woken from the dashboard. Anonymous sign-ins are enabled.
- Vercel project `cartel` (mp3anthony's projects, Hobby) builds from `main` for
  production and from any pushed branch for a preview. Root Directory `mobile`,
  build/output from `mobile/vercel.json`. Preview deployments sit behind Vercel's
  own auth — use the Vercel MCP's `get_access_to_vercel_url` for a 23-hour
  shareable link rather than assuming a bare preview URL loads.
- Repo was recreated fresh; old sync-engine history was deliberately left behind.
  `origin/main` is always the real `main` if a stale local branch ever disagrees.

**Decisions that will look like mistakes if you don't know why**
- **Realtime is enabled per-table via publication membership, not per-row.**
  Migration `20260810000004` adds `lists`/`list_items` to the `supabase_realtime`
  publication — Slice 2 already wrote both tables' RLS with Realtime's
  authorization model in mind, but never actually switched it on. A table absent
  from that publication emits no `postgres_changes` events no matter what the
  client subscribes to; this was true and silent from Slice 2 until this slice.
- **`useLists`' subscription is unfiltered; `useListItems`' is filtered on
  `list_id`.** A user's visible `lists` rows are `owner = me OR household =
  mine` — one `postgres_changes` filter is a single equality expression and
  can't express that OR, so the index subscription relies on RLS alone to scope
  what arrives, same philosophy `loadLists()` already used for the query itself.
  `list_items` has no such OR (a `ListDetailScreen` is always exactly one list),
  so it filters. Don't "fix" the index subscription to match the item one — the
  asymmetry is deliberate, not an inconsistency.
- **No optimistic reconciliation, still.** A `postgres_changes` event just calls
  the hook's existing `refresh()` — the same full reload a manual write already
  triggers. A write on the writer's own device can now double-refresh (once from
  its own post-write call, once from the echoed event); harmless, not suppressed.
- **React Navigation, adopted as its own commit ahead of Slice 2's feature work.**
  Lists is the home screen for everyone now, household-or-not — the household is
  a route reached from the header, registered as one screen or the other but
  never both.
- **`lists`/`list_items` are written direct-to-table under RLS**, not through
  RPCs, except promotion. Don't silently extend the direct-write pattern to a
  future slice that *does* have an atomicity invariant — re-derive it, don't
  copy it.
- **No demotion function, and none should get added.** The want behind "make
  this personal again" is *copy*, which is Slice 9's job. Enforced by a
  withheld column-level UPDATE grant on `household_id`, not a trigger.
- **`position` is `collate "C"`, and `fractional-indexing`'s `digits` argument is
  never passed, anywhere.** This database sorts `'a1' < 'A1'` under its default
  ICU collation; base-62 keys only sort correctly under byte order. `03-SPEC.md`
  § Slice 2 has the full mechanism.

**Traps**
- RLS policy expressions run as the *querying* user. Revoking a policy-helper
  function's EXECUTE from `authenticated` silently breaks every read while writes
  keep working. See migration `20260810000002`.
- **A soft-delete policy must never reference `deleted_at`.** Realtime authorises
  each event against the subscriber's SELECT policy evaluated on the *new* row, so
  a policy saying `deleted_at is null` would suppress the very UPDATE that performs
  the deletion. This was a theoretical risk recorded in Slice 2 and a live-verified
  fact as of Slice 3 — the soft-delete UPDATE was confirmed arriving over both
  sessions' subscriptions before the client-side filter hid the row.
- **Two tabs of one browser profile are the same user.** `localStorage` is shared
  per-origin, not per-tab. Genuine two-session verification needs two separate
  browser profiles (Browser pane + Claude-in-Chrome), confirmed by checking the
  two sessions' `auth.uid()`s actually differ before trusting the test.
- `react-native-web` 0.21 does not map `accessibilityState.checked` (or `.busy`) to
  the DOM's `aria-checked`/`aria-busy`. `CheckTarget` in `ui.tsx` carries both for
  this reason. `PrimaryButton`'s `aria-busy` gap is still open (task chip filed).
- Android and iOS have **never been run** (#10, #1). The Vercel link is the
  agreed review surface. Treat native-only breakage as expected-but-undiscovered.
- Test users are anonymous rows in `auth.users` with `is_anonymous = true`. Reset
  between runs with
  `delete from public.households; delete from auth.users where is_anonymous = true;`
  — cascades `public.lists` and `public.list_items`. Done at the end of this
  session; stale rows from a prior session's testing were also found and cleared
  at the *start* of this one — always check before assuming a clean slate.
- **`set search_path = ''` breaks bare operators, not just bare function
  names.** `nearby_locations()` (Slice 4) needed `OPERATOR(extensions.@>)`
  instead of plain `@>` for the `cube`/`earthdistance` bounding-box check —
  writing `extensions.` in front of the left-hand operand doesn't
  schema-qualify an *operator* the way it does a function call; Postgres
  fails to resolve it and the migration won't apply. Every future function
  that reaches for an extension-provided operator (not just a function) hits
  this — `supabase/migrations/20260810000005_locations.sql`'s header comment
  has the full explanation.
- **Testing `expo-location` on the web preview needs both browser APIs mocked,
  not just one.** Overriding `navigator.geolocation.getCurrentPosition` alone
  isn't enough — `requestForegroundPermissionsAsync()` checks
  `navigator.permissions.query({name:'geolocation'})` first, and a headless
  browser's real default for that query is `denied`/unanswerable, not
  `granted`. Without also mocking `permissions.query`, every "granted" test
  scenario silently exercises the denial path instead — discovered when a
  mocked-granted create still came back denied. Confirmed harmless in this
  case only because it's the *same* fallback code path Slice 4 already needed
  to test; a future slice relying on this same shortcut wouldn't get so lucky.
- **Browser-pane `left_click` on a `ref_N` from `read_page` is unreliable on
  the first attempt right after a screen transition or full navigation** on
  this app's `react-native-web` stack — it silently no-ops (no error, no
  state change) rather than failing loud. Symptom: the UI looks like the
  click never happened. Retrying the same ref sometimes works after 2-3
  tries; the reliable fallback is `javascript_tool` doing
  `element.click()` directly (find by `textContent`), which worked every
  time it was tried. Text inputs have the matching failure mode — `computer`
  `type` can silently not land — verify via reading the input's `.value` and,
  if empty, set it with the native `HTMLInputElement` value setter +
  `dispatchEvent(new Event('input', {bubbles:true}))` rather than retrying
  `type` blindly (React-controlled inputs ignore a plain `.value =`
  assignment without the setter/event combo).
- There is still no test harness beyond SQL run via the Supabase MCP's
  `execute_sql` against the hosted project (no local CLI, no `config.toml`, no
  Docker). Each call commits in its own transaction regardless of an open
  `begin` — a multi-statement script in one call is fine, chaining state across
  calls is not. `supabase/tests/realtime_lists.sql` (new this slice) checks
  publication membership only — it cannot and does not test that events arrive
  over a live socket; that's the manual two-session check.

**Loose ends**
- Palette is locked (burnt orange `#C2410C`) with measured contrast ratios in
  `mobile/src/theme/tokens.ts` — that file is the source of truth, not the design
  doc.
- #7 (route-learning heuristic) is still labelled ready-for-human over a
  missing design reference — genuinely unchecked this session (only #4 was
  investigated). Worth the same treatment #4 got: check whether
  `02-DESIGN-REFERENCE.md`'s literal blocking claim is stale before trusting
  the label either way, same as #4's turned out to be — the design reference
  being non-blank doesn't by itself mean the *specific* decision the label
  cites has actually been made.
- `CHANGE-LOG.md` has three pending items, none built: captcha on anonymous
  sign-in, orphaned households after member removal, and item quantities.
- `PrimaryButton`'s missing `aria-busy` (see Traps) has an open task chip.
- CLAUDE.md's "## Rules" section still has placeholder bullets.
