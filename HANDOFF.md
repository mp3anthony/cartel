# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- Ticket / spec section: 03-SPEC.md § Slice 2, filed as issue #2. **Merged to
  `main`** via PR #12 (merge commit `685b668`, 2026-08-10).
  https://github.com/mp3anthony/cartel/pull/12
- Status: before merging, a final code-review pass ran the `code-review` skill
  (Standards + Spec axes, parallel sub-agents) against the merge-base. Spec axis
  came back clean — both priority checks (no RLS SELECT policy references
  `deleted_at`; `digits` never passed to `generateKeyBetween`) verified by grep,
  not eyeballed. Standards axis found three non-blocking judgement calls (no
  repo standards doc exists, so these are Fowler-baseline smells, not rule
  violations): duplicated write-wrapping boilerplate in `mobile/src/lib/lists.ts`
  (six functions, same shape), `ListsScreen.submit()` re-inlining the
  busy/error/write/refresh sequence that `ListDetailScreen`'s `mutate()` helper
  already named and solved, and `mobile/src/lib/household.ts` picking up
  list-domain error codes it wasn't originally scoped for. None acted on —
  left as an easy follow-up, not urgent enough to hold the merge.
- All ten of issue #2's checklist items verified live pre-merge, across two
  genuinely independent anonymous sessions (see the Traps entry on browser tabs
  below — the first attempt at this used two tabs and proved nothing). Native
  never run, as always. Preview URL (now superseded by `main`, kept for
  reference): https://cartel-git-slice-2-lists-items-mp3anthonys-projects.vercel.app
- Next step: **Slice 3 (#3, Real-Time Household Sync)** starts at Protocol
  Step 2. Expect its "no open questions" label to be wrong too — check first.

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
  Local branch `main` held that abandoned history until this session, when merging
  PR #12 forced a real touch of `main` and it got repaired (`git branch -f main
  origin/main`) instead of deleted. If a checkout elsewhere still has the old
  local `main`, the same fix applies — `origin/main` was always the real one.

**Decisions that will look like mistakes if you don't know why**
- **React Navigation, adopted as its own commit ahead of Slice 2's feature work.**
  Lists is the home screen for everyone now, household-or-not — Slice 1's "the
  household screen is the whole app until you pair" could not survive Slice 2's own
  acceptance test. The household is a route reached from the header, registered as
  one screen or the other but never both, so the type system rules out landing on
  a household screen with no household to show.
- **`lists`/`list_items` are written direct-to-table under RLS**, not through
  RPCs — a deliberate departure from Slice 1's rule. That rule exists for
  invariants RLS can't express atomically; Slice 2 has none except promotion,
  which kept its RPC. Don't silently extend the direct-write pattern to a future
  slice that *does* have an atomicity invariant — re-derive it, don't copy it.
- **No demotion function, and none should get added.** The want behind "make this
  personal again" is *copy*, which is Slice 9's job. Enforced by a withheld
  column-level UPDATE grant on `household_id`, not a trigger — grep for a trigger
  here and you'll find nothing and wrongly conclude it's unenforced.
- **`position` is `collate "C"`, and `fractional-indexing`'s `digits` argument is
  never passed, anywhere.** Both are measured, not stylistic: this database sorts
  `'a1' < 'A1'` under its default ICU collation, byte order says the opposite, and
  base-62 keys only sort correctly under byte order. Separately, the package's
  *value* digits default to base 62 but its *integer-head* alphabet defaults to
  base 52 only when `digits` is omitted — passing it explicitly to "be consistent"
  produces an incompatible keyspace and corrupts existing ordering against new
  keys. `03-SPEC.md` § Slice 2 has the full mechanism.
- `renameList`/`removeList` exist in `mobile/src/lib/lists.ts` and are **not**
  wired to any screen — issue #2's checklist never needed list-level rename/delete,
  so no UI was built for it. Known dead code, not an oversight.

**Traps**
- RLS policy expressions run as the *querying* user. Revoking a policy-helper
  function's EXECUTE from `authenticated` silently breaks every read while writes
  keep working — creating a row succeeds and reading it back throws. Cost an hour
  in Slice 1; see migration `20260810000002` (whose own header comment pointed at
  the wrong file until this slice fixed it — the revoke is in `20260810000000`).
- **A soft-delete policy must never reference `deleted_at`.** Realtime authorises
  each event against the subscriber's SELECT policy evaluated on the *new* row, so
  a policy saying `deleted_at is null` would suppress the very UPDATE that performs
  the deletion — other members would never see a removal. Filtering `deleted_at` is
  the client query's job, always. Getting this backwards is invisible until Slice 3
  actually has two live subscribers.
- **Two tabs of one browser profile are the same user.** `localStorage` is shared
  per-origin, not per-tab — the anonymous session lives there, so two tabs prove
  nothing about cross-household visibility. Confirmed by accident this session:
  clearing one pane tab's storage to force a second identity silently clobbered the
  *other* tab's session too, because they were never independent. Genuine
  two-session verification needs two separate browser profiles (this session used
  the in-app Browser pane for one and Claude-in-Chrome for the other), confirmed by
  checking the two sessions' `auth.uid()`s actually differ before trusting the test.
- `react-native-web` 0.21 does not map `accessibilityState.checked` (or `.busy`) to
  the DOM's `aria-checked`/`aria-busy`. `CheckTarget` in `ui.tsx` carries both an
  explicit `aria-checked` prop and `accessibilityState` for this reason — without
  it the control announced `role="checkbox"` with no state at all, worse than no
  role. `PrimaryButton` has the equivalent gap for `aria-busy`, not yet fixed — a
  task chip was filed for it.
- Android and iOS have **never been run**, and that is recorded on #10 and #1
  rather than implied to pass. The Vercel link is the agreed review surface for
  the client and their testers; Expo Go was considered and rejected as day-to-day
  workflow. Treat native-only breakage as expected-but-undiscovered, not a
  regression.
- Test users are anonymous rows in `auth.users` with `is_anonymous = true`. Reset
  between runs with
  `delete from public.households; delete from auth.users where is_anonymous = true;`
  — this now also cascades `public.lists` and `public.list_items`.
- There is still no test harness beyond `supabase/tests/rls_lists.sql` (SQL-level
  RLS assertions only, run via the Supabase MCP's `execute_sql` against the hosted
  project — there is no local CLI, no `config.toml`, no Docker). That tool commits
  each call in its own transaction regardless of an open `begin`, so state never
  survives between separate `execute_sql` calls; a multi-statement script in one
  call is fine, chaining state across calls is not.

**Loose ends**
- Palette is locked (burnt orange `#C2410C`) with measured contrast ratios in
  `mobile/src/theme/tokens.ts` — that file is the source of truth, not the design
  doc.
- #4 (location merge UX) and #7 (route-learning heuristic) were labelled
  ready-for-human because the design reference was missing. That block is lifted —
  re-check whether they can move to ready-for-agent.
- `CHANGE-LOG.md` has three pending items, none built: captcha on anonymous
  sign-in, orphaned households after member removal, and item quantities
  (raised at Slice 2 Step 2, deliberately left out of that slice).
- `PrimaryButton`'s missing `aria-busy` (see Traps) has an open task chip.
- CLAUDE.md's "## Rules" section still has placeholder bullets.
