# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- **Slice 9 — Shop History & List Templates is implemented and verified,
  [PR #21](https://github.com/mp3anthony/cartel/pull/21) open pending
  merge**, closing issue #9 once merged.
  - **Label rationale re-checked before starting, per the standing practice
    #7/#8 established.** The two things worth checking specifically (per the
    user's own framing this session) both resolved cleanly with no genuine
    open question: (1) whether `shop_sessions` needs building for real now
    — yes, and Slice 7's own HANDOFF entry had already pre-announced the
    split ("gets built separately, as its own table, whenever Slice 9
    actually needs it"), so "Finish shopping" writing two independent rows
    (unchanged `location_checkoffs` + new `shop_sessions`) wasn't a fork, it
    was already decided; (2) what each of the two copy sources ("own history
    or an existing list") actually copies — `03-SPEC.md § 1`'s own "list
    snapshot, checked order" schema sketch resolves this directly: the full
    item set, not just what was checked, always starting unchecked. No
    Problem Agreement round; straight to Investigator → Planner → Code
    Writer, matching #8's pattern rather than #7's.
  - **`shop_sessions`' access shape mirrors `public.lists` exactly** —
    `owner_id` defaults to `auth.uid()`, `household_id` nullable (null =
    personal, same as `lists.household_id`), same
    `owner_id = auth.uid() or household_id = current_household_id()`
    predicate on both SELECT and INSERT. Direct-to-table write under RLS,
    not an RPC — same "may I write this row reduces to a plain check
    expression" reasoning Slice 2 gave for `lists` itself, unlike Slice 8's
    genuinely atomic quorum write. The one clause added beyond
    `lists_insert_own`'s own shape is `list_id is null or exists (select 1
    from lists where id = list_id)`, the same visibility-gate pattern
    `list_items_insert_visible` already established — stops a client
    attaching a shop_session to a list_id it can't see.
  - **This is a genuinely separate table from `location_checkoffs`, not a
    reinterpretation of it — both get written on "Finish shopping" going
    forward.** `03-SPEC.md § 0`'s hard invariant (location-global and
    household-private data must never share an access-control path) means
    one insert could never serve both consumers. `location_checkoffs` stays
    exactly as Slice 7 left it (anonymous, feeds route learning);
    `shop_sessions` is new, household-visible, feeds history/copy. The two
    writes in `finishShopping()` are sequential and independent, not
    wrapped in an RPC — a failure landing between them (a checkoff recorded
    with no matching session row) is accepted, not engineered against, the
    same class of risk this project already tolerates elsewhere (Slice 4's
    accepted location-merge race window, Slice 8's accepted three-way vote
    race).
  - **`item_names`/`checked_item_names` are stored un-normalized**,
    deliberately unlike `location_checkoffs`' array: that array is a global
    cross-household lookup/join key against `location_items.name`; this one
    is never joined against anything, only read back for display or fed
    straight into `addItems()` to recreate real list rows a person sees —
    silently lowercasing "Milk" into "milk" would be a visible regression
    here in a way it isn't there. `shop_sessions` was added to the
    `supabase_realtime` publication in the same migration that created it
    (unlike `lists`/`list_items`'s split across two migrations weeks apart)
    — no reason to ship a household-shared table without live sync for even
    one slice, per `03-SPEC.md § 0`'s sync invariant.
  - **`addItems()` (new, in `lists.ts`) is the one bulk-copy helper both
    copy flows share, and it still routes every generated key through the
    file's one private `keyBetween()`** — looped to produce N ascending
    keys, then written as a single multi-row `.insert([...])` rather than N
    sequential single inserts, so a mid-copy failure can't leave a
    partially-copied list the way N separate round trips could.
    `keyBetween()`'s own "only call into `fractional-indexing` anywhere in
    the app" doc-comment claim stays literally true — a second bulk-copy
    call site living outside `lists.ts` would have broken it.
  - **Two copy entry points, deliberately three separate composers, not one
    shared component.** `HistoryScreen`'s "Start new list from this" copies
    a past `shop_session`'s full `item_names` snapshot (not
    `checked_item_names` — CRD's "aren't creating from scratch each time"
    framing plus §1's "list snapshot" phrasing both read as "give me
    everything I shopped for," not "give me what I already got") and
    unconditionally attaches the session's location (a `shop_sessions` row's
    `location_id` is never null). `ListDetailScreen`'s own "Start new list
    from this" copies an existing list's current items and attaches its
    location only conditionally (a source list may have none). Both prefill
    the new list's name from the source, reuse `ListsScreen`'s
    "Share with {household}" checkbox convention, and never touch the
    source. Explicitly not extracted into one shared composer — the two
    flows' post-`createList()` sequences differ in exactly the way that
    would force most of a shared component's behaviour to be prop-drilled
    back out; see `ListDetailScreen.tsx`'s own copy-composer doc comment,
    which also cites `mutate()`'s established stance on this class of
    duplication being this codebase's norm, not an exception.
  - **`SHOP_SESSION_HISTORY_CAP = 10`** (`shopSessions.ts`) — the generous
    end of the issue's "5-10" range, enforced by `.limit()` in the loader,
    not a database constraint, matching `position`'s own "cap is a
    read-time concern" precedent from Slice 2. **Not live-stress-tested**:
    a synthetic bulk-insert meant to push one household past 10 sessions and
    confirm the oldest drops off was blocked by the permission classifier as
    a live-database write to the shared production project, and was not
    retried through another tool — the classifier's block was respected
    rather than routed around. This one behavior rests on code review of a
    single straightforward `.limit()` clause, not a live test; flagging
    explicitly per this project's "no silent caps" standard rather than
    letting it read as fully covered.
  - **`supabase/tests/rls_shop_sessions.sql`, 13 assertions (0-12), run
    clean against the live project — independently re-run by the
    orchestrator with a hand-verified copy of the same assertions, not just
    trusted from the implementing agent's own report.** Covers: positive
    control (0), household visibility (1), personal-stays-private-inside-a-
    household (2), stranger denial (3), the null=null property fresh
    against this policy (4), INSERT equal-rank (5), INSERT household-id
    smuggling denial (6), the `list_id`-visibility clause both ways (7-8),
    `location_id` FK enforcement (9), `list_id`'s `on delete set null`
    verified by actually hard-deleting the referenced list (10), and no
    UPDATE/DELETE path at all, not even for a row's own owner (11-12).
  - **Both acceptance-test bullets live-verified against local dev
    (`npx expo start --web`, port 8082) with two genuinely distinct
    anonymous users** (Browser pane + Claude-in-Chrome, confirmed differing
    `auth.uid()`s before trusting anything, per the standing trap below).
    User A created a household, a location, and a shared list; checked 2 of
    3 items and hit "Finish shopping" — confirmed by direct DB query that
    `item_names` held all 3 (the full snapshot) while `checked_item_names`
    held only the 2 checked, exactly per the resolved design. User D (a
    household member, not A, joined via invite code) saw the same history
    entry the moment they opened `/history` — real end-to-end visibility
    through the actual REST path, not just the RLS-level SQL proof — and
    used "Start new list from this" themselves (equal-rank invariant,
    exercised live, not just asserted by RLS test): the composer prefilled
    exactly `"Slice 9 QA Supermarket — 11 Aug 2026"`, and the resulting list
    had all 3 items, all unchecked, fresh `a0`/`a1`/`a2` position keys, and
    the same location attached — confirmed by direct DB query, alongside
    the original `shop_sessions` row and source list both still reading
    exactly as before the copy. Separately verified `ListDetailScreen`'s own
    copy path (source = an existing list, not a past session) from A's
    account, this time leaving "Share" unchecked to exercise the
    personal-copy path — same outcome shape (fresh unchecked items, correct
    scope, location inherited, source list's own checked/unchecked state
    confirmed unchanged by direct DB query). All test rows (2 anonymous
    users, 1 household, 1 location, 3 lists, 1 `shop_sessions` row, 1
    `location_checkoffs` row) queried and confirmed as this session's own
    before deletion, then deleted and reverified at zero.
  - `npx tsc --noEmit` clean. `mobile/app.json` and `mobile/package.json`
    bumped to `0.0.9`.
  - **Next up: once PR #21 is merged, Slice 9 completes the numbered slice
    list in `03-SPEC.md`.** Re-read `03-SPEC.md § 3`/`§ 4` and
    `CHANGE-LOG.md`'s three pending items (captcha on anonymous sign-in,
    orphaned households after member removal, item quantities) before
    assuming there's a Slice 10 waiting — none of those three has been
    scoped into a slice yet, and this file's own "Loose ends" section below
    has a few other open threads (native platforms never run, `PrimaryButton`
    `aria-busy` gap, CLAUDE.md's placeholder Rules section) worth triaging
    with the user rather than guessing at what's next.
- **Slice 8 — Location Correction Voting is done and merged.**
  [PR #20](https://github.com/mp3anthony/cartel/pull/20) merged to `main`
  (user gave the explicit go-ahead this session), closing issue #8. Feature
  branch deleted, both locally and on origin.
  - **Label rationale re-checked, same as #7's staleness check, and this time
    it held.** `01-CRD.md § 8` explicitly resolves quorum-of-2 as the
    mechanism and `03-SPEC.md § Slice 8` gives the same scope text as the
    issue — no genuine open question, so no Problem Agreement round; went
    straight to Investigator → Planner → Code Writer.
  - **The central design fork was RPC-vs-direct-table-write, and this is the
    first table in the schema where the RPC side actually won.** Every prior
    table (`location_items`, `location_checkoffs`, `locations`) concluded no
    function was needed because "may I write this row" reduced to a plain RLS
    check. Slice 8's write is different in kind: applying a correction on
    quorum is an atomic check-then-write that spans *two* tables
    (`location_item_votes` and `location_items.section`), which `using`/`with
    check` has no way to express. `public.vote_location_item_correction()`
    (`security definer`) is the sole write path for both tables — neither has
    an INSERT/UPDATE policy or grant reachable by a client at all, a
    deliberately *stronger* stance than `location_items`' own migration
    header predicted for itself ("Slice 8 will add an UPDATE policy") — that
    prediction was wrong once the atomicity requirement was actually worked
    through; overridden, not followed.
  - **`location_item_votes.voter_id` is stored but withheld from every SELECT
    grant, matching `locations.created_by`'s precedent, not
    `location_items`' complete absence of a creator column.** Real functional
    reason this table has that `location_items`/`location_checkoffs` never
    did: telling a proposer apart from an *independent* second confirmer
    needs some durable per-vote identity across two separate calls. Never
    reachable by any client query — the one place it's read is inside the
    function body.
  - **One table serves both "propose" and "confirm"** — no separate
    corrections table. A "proposed correction" is the distinct-values grouping
    of `(location_id, item_name, proposed_section)` that emerges from
    whichever vote rows exist; the first vote for a not-yet-seen tuple *is*
    the proposal, a second independent vote *is* the confirmation. Same
    voter voting the same tuple twice collides with `unique(location_id,
    item_name, proposed_section, voter_id)` and is rejected (`already_voted`)
    rather than silently accepted — deliberately the opposite of
    `tagItemLocation`'s 23505-is-fine leniency, because a duplicate vote from
    the same user is not equivalent to genuine second-voter progress. Two
    different proposed corrections for the same item can be pending at once;
    applying one via quorum deletes *all* pending votes for that item, not
    just the winning tuple's own two.
  - **`mobile/src/lib/locationItemVotes.ts` / `useLocationItemVotes.ts`**
    mirror `locationItems.ts`/`useLocationItems.ts` field-for-field.
    `ShoppingScreen.tsx`'s tagged-item `Badge` gained a sibling pencil
    `IconButton` opening a second inline composer
    (`correctingItemId`, same one-row-at-a-time shape as `composingItemId`);
    pending corrections render as a plain `Body` line + single-tap
    `PrimaryButton` "Confirm" — deliberately *not* the `Confirm` in-place-card
    primitive, because this system has no reject/veto verb (a user who
    disagrees with a proposal just never taps it) and `Confirm`'s contract
    requires an `onCancel` that would invent meaning nothing here has. Every
    viewer sees the same "Confirm" affordance regardless of whether they
    proposed it — the app never learns who voted, so there's no client-side
    attempt to hide it from the proposer; their own re-tap is rejected
    server-side and surfaces through the same `ErrorNote` path every other
    rejected write already uses.
  - **`supabase/tests/rls_location_item_votes.sql`, 14 assertions, run clean
    against the live project — independently re-run by the orchestrator, not
    just trusted from the implementing agent's own report.** Covers: quorum
    application + vote-row cleanup (assertions 0-1), `already_voted`
    rejection (2-3), two independent pending corrections coexisting and one
    applying wiping both (4-5), `correction_matches_current` /
    `item_not_tagged` rejection (6-7), no-household-required (8), `voter_id`
    unreadability (9), no direct-INSERT bypass of the RPC (10), composite FK
    enforcement + cascade (11-12), both check constraints (13).
  - **Both acceptance-test bullets live-verified against local dev with two
    genuinely distinct anonymous users** (Browser pane + Claude-in-Chrome,
    confirmed differing `auth.uid()`s before trusting anything, per the
    standing trap below). User A tagged a fresh item "Aisle 3", proposed
    "Aisle 9" — badge stayed "Aisle 3" (issue's first bullet) — then A's own
    tap on "Confirm" for their own proposal was rejected with the
    `already_voted` prose, badge still "Aisle 3" (the explicit
    single-user-edits-stay-pending negative case, not just implied). User B
    (different list, no shared household, matched via lowercase "milk"
    proving the name-normalization join) saw the same pending correction and
    confirmed it independently — both sessions read "Aisle 9" after reload,
    confirmed directly against the database (`location_items.section =
    'Aisle 9'`, zero remaining `location_item_votes` rows for that item). All
    test rows (2 anon users, 2 lists, 1 location, 1 location_items row)
    queried and confirmed as this session's own before deletion, then deleted
    and reverified at zero.
  - `npx tsc --noEmit` clean. `mobile/app.json` and `mobile/package.json`
    bumped to `0.0.8`.
  - **Next up: Slice 9 — Shop History & List Templates, issue #9** (depends
    on Slice 5, already merged — no blocker), the only remaining
    `ready-for-agent` slice. It's the slice that finally needs a real,
    household-attributed `shop_sessions` table — start by re-reading Slice
    7's entry below on why `location_checkoffs` was deliberately built
    anonymous/global instead and structurally can't be reused for it.
- **Slice 7 — Route Learning & Auto-Ordering is done and merged.**
  [PR #19](https://github.com/mp3anthony/cartel/pull/19) merged to `main`
  (user gave the explicit go-ahead this session), closing issue #7. Feature
  branch deleted, both locally and on origin.
  - **Issue #7 had been accidentally auto-closed** by GitHub's keyword
    detection matching "resolve #7" in a *previous* session's handoff commit
    message (`93fca49`) — that commit was only about verifying the label's
    accuracy, not completing the slice. Reopened at the start of this session
    with an explanatory comment before any real work started. If a future
    commit message needs to reference an issue number without triggering
    auto-close, avoid GitHub's close-keyword list ("closes", "fixes",
    "resolves" + others) immediately before the `#N`.
  - **Problem Agreement ran properly this time** (Protocol Step 3's
    escalation trigger — the ordering heuristic was a genuine open question,
    confirmed by re-reading `01-CRD.md`/`02-DESIGN-REFERENCE.md` and finding
    no resolution in either) — three real forks put to the user via
    `AskUserQuestion` before any Investigator/Planner/Code Writer work:
    (1) a separate anonymous `location_checkoffs` table vs. building the
    CRD-sketched combined `shop_sessions` table now, (2) observed-order-primary
    vs. section-grouped-primary vs. tags-only ordering, (3) a new "Finish
    shopping" button vs. auto-completing on last item checked. All three
    resolved to the recommended option. Full reasoning recorded in
    `03-SPEC.md § Slice 7`'s "Agreed 2026-08-11" block — read that before
    touching this slice's schema or algorithm again, not this file.
  - **New table `public.location_checkoffs`** (migration
    `20260811000001`), global and anonymous like `location_items` — no
    `household_id`/`list_id`/user column at all, `on delete cascade` on
    `location_id` (matches `location_items`, not `lists.location_id`'s
    set-null). One row per completed shop: an ordered array of normalized
    checked item names + `completed_at`. Not added to the realtime
    publication (matches `location_items`/`locations`).
  - **`mobile/src/lib/locationCheckoffs.ts`**: `loadLocationCheckoffs`,
    `recordLocationCheckoff`, `orderedCheckedItemNames`, and the three-tier
    `computeRouteOrder` (own history → section-tag fallback → entry order) —
    doc comments walk through the algorithm in full. `mobile/src/hooks/useLocationCheckoffs.ts`
    mirrors `useLocationItems.ts` field-for-field.
  - **`ShoppingScreen.tsx`** now renders `computeRouteOrder`'s output instead
    of `useListItems`'s raw order (read-time sort only — `position` is still
    never written, per Slice 2's already-locked decision) and gained a new
    confirm-gated "Finish shopping" `SecondaryButton` that writes one
    `location_checkoffs` row from whatever's currently checked. Doesn't reset
    `checked_at` or touch list reuse across weeks — deliberately out of
    scope, stays Slice 9's.
  - **Both acceptance-test bullets live-verified** against a local dev
    session (`npx expo start --web`, port 8082) rather than production — the
    Vercel preview/prod origins all point at the same live Supabase project,
    and production now holds a real household's data (see Traps below), so
    all test writes went through local dev instead. Verified beyond the
    minimum: a zero-history location rendered a fresh list in exact entry
    order; the same location after two recorded shops (checked
    eggs→bread→milk→apples both times) rendered a *new* list with a
    *different* entry order (apples→milk→bread→eggs) back in the observed
    eggs→bread→milk→apples order, reproduced identically after a full cold
    reload. Additionally isolated and confirmed the section-tag fallback
    tier specifically: an item ("yogurt") tagged with the same section as an
    already-observed item ("milk") but never itself checked at that location
    slotted in at milk's own mean position, tie-broken by entry order — and
    confirmed the true-zero-signal tier separately (untagged, unchecked
    "yogurt" sorted last before it was tagged). All test rows (1 location, 2
    lists, 2 checkoff rows, 2 location_items tags, 1 anonymous user) queried
    and confirmed as this session's own before deletion, then deleted and
    reverified at zero — see the corrected cleanup practice in Traps below,
    followed correctly here.
  - `npx tsc --noEmit` clean. `supabase/tests/rls_location_checkoffs.sql` (8
    assertions, positive control + cross-household visibility + structural
    anonymity + no-household-required-to-write + FK enforcement + cascade
    delete + both check constraints) ran clean against the live project.
  - `mobile/app.json` and `mobile/package.json` bumped to `0.0.7`.
- **Slice 6 is done and merged.** [PR #17](https://github.com/mp3anthony/cartel/pull/17)
  merged to `main`, closing issue #6. Feature branch deleted, both locally and
  on origin.
- **Version-footer task done, [PR #18](https://github.com/mp3anthony/cartel/pull/18)
  merged to `main`, branch deleted both locally and on origin.** Bottom of
  `ListsScreen` only, matching the scope confirmed with the user last session
  — Shopping Mode and every other screen untouched. `mobile/app.json` and
  `mobile/package.json` bumped to `0.0.6`. `mobile/src/lib/buildInfo.ts` reads
  the version from `app.json`'s `expo.version` via a plain JSON import — no
  `expo-constants` dependency needed (`resolveJsonModule` already on via
  `expo/tsconfig.base`); worth knowing `expo-constants` itself is in the
  lockfile but not actually resolvable from app code — it's nested under
  `mobile/node_modules/expo/node_modules/expo-constants`, not hoisted to
  `mobile/node_modules` top level.
  **The live/preview mechanism flagged last session as unverified is now
  confirmed working, live, in all three environments — not assumed.**
  `mobile/vercel.json`'s `buildCommand` is now
  `EXPO_PUBLIC_VERCEL_ENV=$VERCEL_ENV npx expo export --platform web`; Vercel
  sets `VERCEL_ENV` automatically for every build (no project setting needed,
  unlike Deployment Protection), so the shell forwarding was the only missing
  piece. Confirmed via `read_page` text content, not just visual inspection:
  local dev (`npx expo start --web`, no `VERCEL_ENV` set) read
  `"v0.0.6 · Dev"` — a named fallback rather than printing `undefined`; the
  real Vercel preview deployment for this PR's branch read
  `"v0.0.6 · Preview"`; production (`cartel-kappa.vercel.app`, after merge)
  read `"v0.0.6 · Live"`. One pre-existing hit along the way, not a
  regression: the preview deployment's first load threw the same one-off
  `"JWT issued at future"` error this file's Traps section already documents
  for a fresh origin's first visit — a plain reload cleared it immediately,
  same as before. Merged directly this session (user confirmed the
  go-ahead) rather than left for later, specifically so the live-environment
  verification above could happen rather than being deferred again.
- Full Investigator→Planner→Code Writer cycle run via subagents this session
  (no Problem Agreement round — issue was ready-for-agent and no genuinely
  open question came up). New `public.location_items` table (migration
  `20260811000000`), `mobile/src/lib/locationItems.ts`,
  `mobile/src/hooks/useLocationItems.ts`, `ShoppingScreen.tsx` changes,
  `supabase/tests/rls_location_items.sql` (7 assertions, ran clean). Full
  reasoning for every design fork is in the migration's and `locationItems.ts`'s
  own doc comments — see Decisions below for the ones likely to look like
  mistakes without that context.
- **Both halves of the issue's own acceptance test were live-verified with two
  separate real anonymous users** (Browser pane + Claude-in-Chrome, confirmed
  distinct `auth.uid()`s), not just the RLS-level proof: user A tagged "Milk"
  (`Dairy Aisle 3`) at a location A created; a second, completely unrelated
  user B — no household, never tagged anything — attached a *different* list's
  "milk" (lowercase, proving the name-normalization match) to the *same*
  location by search and saw `Dairy Aisle 3` the moment Shopping Mode loaded,
  with zero action beyond opening the screen. Also confirmed via
  `read_network_requests` that the `location_items` fetch's own `select=`
  query string names only `id,name,section,created_at` — no attribution
  reaches the wire in either direction.
- **Before Slice 6 started, fixed a real blocker: production required a new
  household on every push.** Root cause and fix are recorded under Decisions
  below — not a code bug, a Vercel project setting.
- **Production now holds a real household ("The Paull's") and a real list
  ("Weekly Shopping 🛒"), created between sessions — not test debris.**
  Discovered while cleaning up this session's own test rows; see the
  corrected Traps entry on test-data cleanup below before running the old
  blanket-wipe query again.

## Notes for next session

**Project setup**
- Supabase project `cartel`, ref `chacavfoewyiwrfgvxtj`, ap-southeast-2, free tier.
  Free-tier projects pause after ~7 days idle; the first call back times out until
  it is woken from the dashboard. Anonymous sign-ins are enabled.
- Vercel project `cartel` (mp3anthony's projects, Hobby) builds from `main` for
  production and from any pushed branch for a preview. Root Directory `mobile`,
  build/output from `mobile/vercel.json`. **Production is public, no auth wall**
  — reach it at the stable alias `cartel-kappa.vercel.app` (or
  `cartel-mp3anthonys-projects.vercel.app`; both point at whatever is currently
  live in production and never change). Preview deployments (any non-`main`
  branch) still sit behind Vercel's own SSO — use the Vercel MCP's
  `get_access_to_vercel_url` for a 23-hour shareable link for those, rather
  than assuming a bare preview URL loads. Deployment Protection is scoped to
  `preview` only (Vercel project setting, not code) — see Decisions below for
  why this matters and don't re-tighten it to `all` without re-reading that
  entry first.
- Repo was recreated fresh; old sync-engine history was deliberately left behind.
  `origin/main` is always the real `main` if a stale local branch ever disagrees.
- `.claude/launch.json` (new this slice) runs the web preview on port 8082, not
  Expo's default 8081 — 8081 was occupied in the session that added it. Use
  8082 going forward rather than assuming the default.

**Decisions that will look like mistakes if you don't know why**
- **Vercel Deployment Protection is scoped to `preview`, not `all` — flipped
  this session, before Slice 6.** The symptom reported was "I have to create a
  new household every time a new version is pushed to main." The identity
  model (`mobile/src/lib/supabase.ts`, `useAnonymousSession.ts`) was never
  broken — anonymous auth persisted to `localStorage` is *designed* to survive
  restarts, and does. The real cause: the project had no custom domain, and
  `ssoProtection.deploymentType` was `all_except_custom_domains` — meaning
  *every* URL the project has, production included, sat behind Vercel's own
  SSO gate. There was no stable, unauthenticated origin for the app to persist
  `localStorage` against. Whoever opened it — via a fresh
  `get_access_to_vercel_url` bypass link pointed at the latest deployment's
  unique per-push subdomain (`cartel-<hash>-mp3anthonys-projects.vercel.app`,
  which changes on every deploy by construction) — got a brand-new origin each
  time, hence a brand-new anonymous session, hence no household. Fixed by
  setting `ssoProtection.deploymentType: "preview"` via the Vercel MCP's
  `update_project_deployment_protection` — production is now public at the
  two stable `*-mp3anthonys-projects.vercel.app` aliases, previews stay
  gated. Confirmed live: same anonymous `sub` claim across repeated reloads of
  `cartel-kappa.vercel.app` in a fresh browser profile. This also incidentally
  fixed a bigger latent gap — before this, no household member other than the
  Vercel account owner could reach the app at all, which contradicts the
  CRD's explicit no-login-wall intent. Don't re-enable protection on
  production without solving the origin-stability problem some other way
  first (e.g. a custom domain, which is exempt from SSO regardless of this
  setting).
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
- **`LocationsScreen`'s "Selected" `Badge` is no longer a placeholder — Slice 5
  wired it up.** A new optional nav param `Locations: { attachToListId?:
  string }` and a single `handleSelect()` function are what make a selection
  "become real": absent the param it's still byte-identical to Slice 4
  (client-side badge only); present, every path that finalizes a choice (row
  tap, merge-confirm, just-created location) writes `location_id` via
  `attachLocation()` and navigates back to `ListDetail` instead. Two slices of
  HANDOFF called this "not a bug to finish" — it's finished now; don't add a
  second, parallel selection mechanism if a later slice wants attachment
  triggered from somewhere other than this screen.
- **Location-permission denial is sticky for the screen's mounted lifetime,
  with no retry button and no settings deep-link.** Once `requestLocation()`
  comes back non-granted, `LocationsScreen` never asks again until it
  remounts. Deliberately narrower than a shipped consumer app would want —
  built to satisfy issue #4's acceptance test exactly, not more. If a later
  slice wants a "check settings" flow, that's new scope, not a gap to patch.
- **No `shop_sessions` table this slice, and no RPC for the `location_id`
  write.** `lists.location_id` (migration
  `20260810000006_lists_location_attachment.sql`) is a plain nullable FK, `on
  delete set null` (mirrors `locations.created_by`'s own deletion story),
  gated by the pre-existing `lists_update_visible` RLS policy plus a new
  column-level `grant update (location_id)` — no new policy, because that
  predicate already has no per-column awareness to add one for. "Closed and
  resumed without losing check-off state" is satisfied entirely by
  `list_items.checked_at` (already existed since Slice 2, already persists,
  `useListItems` already reloads fresh on every mount) — `shop_sessions` is
  real but later scope (Slice 7/9, feeds history/route-learning), and
  building it now would be schema nobody reads yet. Confirmed by
  `supabase/tests/rls_lists_locations.sql` (6 assertions plus a positive
  control, following the `rls_lists.sql`/`rls_locations.sql` template) —
  including that a household mate may attach too (equal-rank invariant) and
  that `public.locations` stays globally visible to a stranger regardless
  (§0's household-private/location-global boundary still holds).
- **`attachLocation(client, listId, locationId)` is one function for attach,
  change, and detach** — detach is just a call with `null`. A separate
  `detachLocation` would only be this call with its second argument
  hard-coded.
- **`ShoppingScreen` tracks per-item pending state (`Set<string>` of
  in-flight item ids) instead of `ListDetailScreen`'s one shared `busy`
  boolean.** Deliberate: Shopping Mode's whole point is checking off several
  items in quick succession while walking, so one shared flag would
  serialize every tap behind the previous row's round trip. The `Set` only
  guards a row against double-tapping itself — different rows are free to be
  in flight together.
- **`CheckTarget` grew optional `size`/`label` props rather than a new
  parallel component.** When `label` is passed, the whole row (circle + text)
  renders as one `Pressable` — deliberately not a bare-circle `CheckTarget`
  nested inside a `Row`'s own `onPress`, which `Row`'s own doc comment already
  flags as two touchables reacting to one tap. Both props default to values
  that leave every pre-Slice-5 call site (`ListDetailScreen`'s per-item
  circle, `ListsScreen`'s share checkbox) rendering byte-identically. Two new
  tokens ride along in `tokens.ts`: `fontSize.large` (26) and
  `minTouchTargetLarge` (64, Material's "large touch target" tier), both
  Shopping-Mode-only — `tokens.ts` had carried a comment since Slice 4
  anticipating this ("Shopping Mode raises it in Slice 5"), now resolved as a
  sibling token rather than a replacement of `minTouchTarget`.
- **No "Finish shopping" button, no reordering or grouping of checked items in
  `ShoppingScreen`.** Out of scope by this slice's own plan — there's no
  session row to finalize, and Slice 2 already decided check-off never writes
  `position`.
- **`location_items` has no creator column at all — not even one withheld
  from a grant, unlike `locations.created_by`.** Nothing in this slice, Slice
  7 (route ordering reads accumulated tags, never who left them), or Slice 8
  (its own `location_item_votes` table owns supporter-id tracking, a separate
  concern) ever needed to read a creator off this table, so storing one would
  be exactly the "schema nobody reads" this project's Slice 5 `shop_sessions`
  reasoning already rejected once. Omission is also a strictly stronger
  reading of the issue's "not attributable ... anywhere in ... data" than
  store-and-withhold. `supabase/tests/rls_location_items.sql` assertion 2
  checks this structurally (queries `information_schema.columns`), not just
  that a grant withholds something.
- **Two households racing to tag the same untagged item is arbitrated by a
  bare `unique (location_id, name)` constraint, not a function or `.upsert()`.**
  First `INSERT` wins; the loser's `23505` is treated as *success*, not
  failure, in `tagItemLocation()` (`mobile/src/lib/locationItems.ts`) — the
  caller's own post-write `refresh()` (the same write-then-reload shape every
  mutation in this app already uses) picks up whichever section text actually
  won, so there's nothing a second round trip would buy. Slice 8 is where a
  *correction* to an already-set tag gets a real mechanism (quorum voting);
  this slice deliberately has none, by design, not as a gap.
- **No stored `list_items.location_tag_id`, despite 03-SPEC.md § 1 listing it
  in the aspirational schema shape.** "Is this item tagged, and what does it
  say" is always resolved by a live lookup (`sectionForItemName()`, list's
  `location_id` + this item's normalized name against `location_items`), with
  nothing written back onto `list_items`. A stored FK would still need that
  same lookup to auto-populate for a *second* household's items that never
  went through any tagging action themselves — which is exactly what the
  acceptance test requires — so the stored column would be sync work bought
  for nothing. Don't add it later without a concrete reason a live lookup
  can't cover (Slice 7's route ordering hasn't been planned yet — check
  there first).
- **`location_items` was never added to the `supabase_realtime` publication,
  matching `locations` (also never added — only `lists`/`list_items` were, in
  migration `20260810000004`).** `useLocationItems` loads once on mount, no
  subscription, `refresh()` picks up a tag just written — same shape as
  `useLocations`. The issue's acceptance test reads as satisfied by a fresh
  load ("shopping the same location for the first time"), not live push
  mid-shop; live-verified this session with two real sessions, a fresh
  `ShoppingScreen` mount was all household B needed.

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
- **Two mounted `useListItems` instances for the same `listId` collide on the
  same Realtime channel and crash.** `ListDetailScreen` stays mounted
  underneath `ShoppingScreen` in the native-stack navigator when navigating
  between them, so both hooks called `client.channel('list-items:<id>')`
  with the same bare topic — Supabase's `client.channel(topic)` returns the
  *existing* channel for a topic it's already seen rather than creating a new
  one, and calling `.on()` on a channel that's already `subscribe()`d throws.
  Slice 3's original doc comment on `useListItems` had explicitly flagged
  this as theoretically possible but left it undefended as "not reachable
  today"; Slice 5 made it reachable and it crashed live (an uncaught error on
  `ShoppingScreen`) before the fix. Fixed by suffixing the channel topic with
  a per-mount-instance `useId()` (`mobile/src/hooks/useListItems.ts`) — both
  instances still filter server-side on the same `list_id`, so two screens
  showing the same list now redundantly self-refresh on each other's writes
  too, accepted under the same "redundant but harmless" reasoning `useLists`
  already relies on for a write's own echo. Watch for this again any time a
  future slice mounts a second concurrent consumer of the same list-scoped
  hook.
- **Two tabs of one browser profile are the same user.** `localStorage` is shared
  per-origin, not per-tab. Genuine two-session verification needs two separate
  browser profiles (Browser pane + Claude-in-Chrome), confirmed by checking the
  two sessions' `auth.uid()`s actually differ before trusting the test.
- `react-native-web` 0.21 does not map `accessibilityState.checked` (or `.busy`) to
  the DOM's `aria-checked`/`aria-busy`. `CheckTarget` in `ui.tsx` carries both for
  this reason. `PrimaryButton`'s `aria-busy` gap is still open (task chip filed).
- Android and iOS have **never been run** (#10, #1). The Vercel link is the
  agreed review surface. Treat native-only breakage as expected-but-undiscovered.
- **The old blanket-wipe cleanup query below is now DANGEROUS — do not run it.**
  Test users are anonymous rows in `auth.users` with `is_anonymous = true`, and
  every prior slice's cleanup ran
  `delete from public.households; delete from auth.users where is_anonymous = true;`
  between/after test runs on the (until this session) reasonable assumption that
  every anonymous row in production was another session's test debris. That
  assumption broke this session: production has been public and unauthenticated
  since the Deployment Protection fix above, and a real household ("The Paull's",
  one member, list "Weekly Shopping 🛒") now exists from genuine use between
  sessions. A blanket wipe run today would delete a real person's data, not test
  debris. **Before any cleanup query, `select` first and confirm every row you're
  about to delete is one you created this session** (Slice 6's cleanup did this —
  queried households/lists/anon-user ids first, found "The Paull's", scoped the
  actual delete to only the specific ids this session's testing had created, left
  everything else untouched). This is a standing change to the cleanup practice,
  not a one-off caveat — re-derive "is this actually mine" every session from now
  on rather than trusting a cached blanket query from before production went
  public.
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
- **One-off "JWT issued at future" error, seen once, unresolved.** Immediately
  after flipping Deployment Protection this session, the very first cold load
  of `cartel-kappa.vercel.app` in a fresh browser profile threw this on the
  initial anonymous sign-in; a plain reload succeeded and the same session
  persisted cleanly across several more reloads afterward. Browser clock was
  confirmed correct (matched real time) at the point of the error, so it
  wasn't ordinary client/server clock skew. Not chased further since it
  didn't recur — flagging in case it shows up again for someone else's first
  visit to a newly-public origin.
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
- **#7's `ready-for-human` label was checked this session (the #4-style
  staleness check was still outstanding) and confirmed accurate, unlike #4's
  turned out to be.** Read `02-DESIGN-REFERENCE.md` in full: its only route-
  learning mention (the per-item colour chip, § reference 2) is about
  *displaying* a tagged section, not about *how tags + observed check-off
  order combine into an order* — the actual algorithm question the issue's
  label rationale cites. No section resolves it, locked or otherwise. Also
  confirmed `shop_sessions` (03-SPEC.md § 1's aspirational schema) does not
  exist yet in any migration — Slice 5 deliberately deferred it here, so
  Slice 7 is also the slice that has to create it. Next session should open
  with Problem Agreement on the ordering heuristic itself (Protocol Step 3's
  escalation trigger), not skip straight to Investigator/Planner.
- `CHANGE-LOG.md` has three pending items, none built: captcha on anonymous
  sign-in, orphaned households after member removal, and item quantities.
- `PrimaryButton`'s missing `aria-busy` (see Traps) has an open task chip.
- CLAUDE.md's "## Rules" section still has placeholder bullets.
