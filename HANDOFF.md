# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- Ticket / spec section: 03-SPEC.md § Slice 3, filed as issue #3. **Merged to
  `main`** via PR #13 (merge commit `b9b8420`, 2026-08-10). Issue #3 auto-closed
  on merge. https://github.com/mp3anthony/cartel/pull/13
- Status: Step 2 widened the issue's scope before any planning started — the
  original "no open questions" label only covered item-level sync (matching the
  literal acceptance test); agreed to also cover list-index-level sync (a list
  created/renamed/removed/promoted by another member updates the lists home
  screen live too), since leaving that screen on manual-refresh right next to a
  live-updating list would have been an inconsistent UX the CRD's own "real-time
  sync across household members" language doesn't support. Issue #3 was edited
  to record the widened scope and its testing checklist before Planner ran.
- All three of issue #3's checklist items verified live pre-merge, across two
  genuinely independent anonymous sessions (Browser pane + Claude-in-Chrome,
  `auth.uid()`s confirmed to differ first). Item-level add and check-off tested
  both directions; list-index create, promote, rename and soft-delete all
  confirmed propagating live with no manual refresh. Rename and soft-delete were
  triggered with a direct `execute_sql` UPDATE rather than through the app —
  neither has a UI path (see Loose ends) — which incidentally is a stronger test
  of the underlying mechanism than clicking a button would have been, since it
  proves Realtime delivers the event regardless of which client (or no client)
  performed the write. Native never run, as always.
- Before merging, a `code-review` pass ran (Standards + Spec axes, parallel
  sub-agents) against the merge-base. Standards: one non-blocking judgement
  call — the two new subscription effects in `useLists.ts`/`useListItems.ts`
  are duplicated-shape (channel → one `postgres_changes` listener → `refresh()`
  → cleanup), a second instance of the same smell category Slice 2's review
  already logged once (six same-shaped write-wrappers in `lists.ts`) — worth
  extracting to a shared `useTableSubscription` helper if a third instance
  shows up, not fixed inline. Spec: nothing wrong or out of scope; one finding
  worth carrying forward — see Loose ends re: rename/remove having no UI path,
  which a task chip now tracks.
- Next step: **Slice 4 (#4, Locations)** is currently labelled ready-for-human
  (design reference was missing) — check whether that block is actually
  lifted before trusting the label either way.

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
- `renameList`/`removeList` in `mobile/src/lib/lists.ts` are still **not** wired
  to any screen. Slice 3 exercised both directly against the database to test
  Realtime propagation (see Last active) — that is not the same as them being
  reachable from the app. Slice 3's code-review resurfaced this as a concrete
  gap (its own acceptance test can't be reproduced by a human clicking through
  the app), so it now has an open task chip ("Wire list rename/remove to the
  UI") rather than being silently left as before.
- #7 (route-learning heuristic) was labelled ready-for-human because the design
  reference was missing — unchecked this session, still worth re-checking before
  trusting the label.
- `CHANGE-LOG.md` has three pending items, none built: captcha on anonymous
  sign-in, orphaned households after member removal, and item quantities.
- `PrimaryButton`'s missing `aria-busy` (see Traps) has an open task chip.
- CLAUDE.md's "## Rules" section still has placeholder bullets.
