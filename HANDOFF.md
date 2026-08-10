# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- Ticket / spec section: 03-SPEC.md § Slice 4, issue #4. **Step 2 (Problem
  Agreement) done, Step 3 (build) starting now.** Slice 3 itself is merged
  (PR #13, `b9b8420`) — see prior entries below, kept for their still-relevant
  Traps/Decisions.
- Two threads closed out last session, in the order the user asked for:
  1. **Wire list rename/remove to the UI** — an open task chip from Slice 3's
     code review, not scoped under any Slice issue. User chose "straight to
     PR" over filing an issue first (small single-file diff, established
     pattern). **[PR #14](https://github.com/mp3anthony/cartel/pull/14),
     merged (`9c1dbe4`)** — adds "Rename list"/"Remove list" to
     `ListDetailScreen.tsx`, reusing `mutate()` and the `Field`/`Confirm`
     patterns already there for item rename and "Share with household".
     `tsc --noEmit` clean; Vercel preview check passed; also verified live
     against the local dev server (create → rename → remove, header and Lists
     index both updated correctly, no unrelated console errors). Reviewed
     clean (mergeable, checks green) and merged this session.
  2. **Slice 4 Step 2.** Issue #4 was `ready-for-human` since 2026-07-31,
     citing a blank `02-DESIGN-REFERENCE.md`. The file was filled in
     2026-08-09 — before this issue was next touched — but that fill-in never
     actually addressed the merge-prompt decision the label was really
     protecting; the label's literal wording had gone stale, its substance
     hadn't. Worked the real decision through with the user: merge is
     mandatory (no force-create-anyway override), the prompt names the
     existing location and its ~10m-rounded distance (safe — location data is
     global/anonymous per `03-SPEC.md` § 0, not a cross-household
     disclosure), radius locked at **100m** (tight end of the spec's
     ~100-150m range), and Slice 4 gets its **own standalone Locations
     screen** independently testable with no list involved — the issue's
     "attaching a list..." acceptance-test wording was loose carryover from
     Slice 5, not a real Slice 4/5 dependency. Recorded in
     `02-DESIGN-REFERENCE.md` § Slice 4 (commit `9def6b1`, pushed straight to
     `main` as a planning-doc change, same as this file). Issue #4 edited to
     match (scope, testing checklist, Step 2 note) and `ready-for-human`
     removed.
- Next step: PR #14 is merged, so Step 3 (Investigator → Planner → Code
  Writer → Docs) for Slice 4 is starting now — issue #4 was already ready to
  hand to Planner as-is. Slice 4 is a real build (new `locations` table +
  geo-distance query, a new mobile screen, device location permissions);
  expect a checkpoint with the user before Code Writer touches the schema or
  native permissions, even though the protocol allows running straight
  through without interrupting.

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
- `renameList`/`removeList` are now wired to `ListDetailScreen.tsx` — **[PR
  #14](https://github.com/mp3anthony/cartel/pull/14), merged.** Done.
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
