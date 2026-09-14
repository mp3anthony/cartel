# HANDOFF.md

> Read first, every session (Protocol Step 0). Written last, every session
> (Protocol Step 5). Keep it short — this is a pointer, not a log.

## Last active

- **2026-09-14 session — #42 narrowed and mitigated (not root-caused),
  shipped and merged, [PR #67](https://github.com/mp3anthony/cartel/pull/67).
  Session run under a tight usage budget (~5% left at the start), by the
  user's own explicit choice — flagging that up front since it shaped every
  call below: a small direct fix instead of a full Investigator → Planner →
  Code Writer → Reviewer pipeline, and no live-browser reproduction. [#52](https://github.com/mp3anthony/cartel/issues/52)
  is still the only other open item, unchanged, still blocked on the user's
  $50 GCP prepayment. Nothing is queued — next session starts with the
  user, same as before.**
  - **Asked the user the three questions this file's own prior entry had
    queued up** (`AskUserQuestion`, per Protocol Step 0), and the answers
    were a real, load-bearing finding, not just colour: **truly blank page,
    never the "Cartel hit a snag" recovery screen, on mobile data.** That
    single detail rules out what PR #50 already built and points somewhere
    new — `AppErrorBoundary` (#50) only catches a throw *inside* the
    mounted React tree; a genuinely blank page means React never got that
    far, which the boundary structurally cannot help with regardless of
    what it logs.
  - **Leading hypothesis, not confirmed**: on a weak mobile connection the
    JS bundle (or a chunk) fails to fully fetch/parse, leaving only the
    static HTML shell (`mobile/public/index.html`'s own background-color
    CSS) with nothing else — matches "truly blank," matches "mobile data,"
    matches the intermittency. An early throw *before* `AppErrorBoundary`
    itself mounts (e.g. in `ThemeProvider`/`SafeAreaProvider` in `App.tsx`)
    is a second, less-explored possibility not ruled out either way this
    session — the fix below is deliberately agnostic between the two
    rather than betting on one.
  - **Fix, scoped down given the budget**: a static, framework-free
    fallback added directly to `mobile/public/index.html` (no subagent
    pipeline this time — a conscious, explicitly-confirmed-with-the-user
    trade-off, not a shortcut taken silently). A small inline `<script>`
    checks 8s after load whether `#root` still has zero children; if so, a
    plain HTML "Cartel didn't load" message + Reload button (already
    present in the DOM, `display: none` until then) becomes visible. Pure
    DOM/CSS/JS, zero React dependency — the whole point is that it works
    even in the exact scenario `AppErrorBoundary` can't reach. 8s was
    picked against #50's own prior session's measured ~200ms normal
    round-trip time as a large safety margin, not tuned against a real
    slow-load reproduction.
  - **Verified via a real `npx expo export --platform web`** (the actual
    command Vercel's build runs) — confirmed the favicon `<link>` injection
    and `#root` both still come through untouched (this file's own Traps
    section already documents a prior session hijacking that same
    injection point via a careless comment; checked directly this time,
    not assumed), and the new fallback markup/script survive the build
    byte-for-byte. **Explicitly not live-reproduced** — no real dropped
    bundle or throttled connection was simulated to confirm the fallback
    actually fires in anger; this is a well-reasoned static-analysis fix,
    stated as such in the PR rather than implied as fully tested.
  - **This is still recovery/mitigation, not a diagnosed root cause** —
    same honest framing #50's own entry used. If the user reports this
    again post-merge, the new fallback screen itself becomes a real
    diagnostic signal going forward (distinguishes "bundle/boot never
    happened at all" from every other failure mode #50's logging already
    covers) — next session should ask specifically whether the *new*
    "Cartel didn't load" screen showed, versus a blank page, versus #50's
    "Cartel hit a snag" screen, before assuming which layer failed.
  - `npx tsc --noEmit` not re-run — this change touches only static HTML,
    no TypeScript. `mobile/app.json`/`mobile/package.json` bumped to
    `0.0.27` directly on `main` after merge — an oversight under the
    usage-budget pressure (missed in the PR itself), caught and fixed
    same-session rather than left drifting for whoever ships next.

- **2026-09-06 (third) build session — #63 (add an item mid-shop) and #65
  (per-location item catalog) shipped together in one PR
  ([PR #66](https://github.com/mp3anthony/cartel/pull/66)), both issues
  auto-closed on merge. [#64](https://github.com/mp3anthony/cartel/issues/64)
  resolved and closed the same session — not a bug: the user confirmed
  directly that the original Milk tag at Pak'nsave Papanui never actually
  happened, they simply weren't aware at the time of how to tag/add a
  location's items. Consistent with the prior session's own finding (every
  `location_items` row at that location dated to a single day, no earlier
  tag existing) — that finding just didn't yet have the human context to
  close it. [#52](https://github.com/mp3anthony/cartel/issues/52) is still
  the only thing left open, parked/blocked on the user's $50 GCP
  prepayment, unchanged. Nothing is queued — next session starts with the
  user.**
  - **#63's Problem Agreement ran this session** (`AskUserQuestion`, not
    skipped): new item starts unchecked; route placement uses
    `computeRouteOrder`'s existing section-tag-fallback tier if already
    tagged, entry-order tail otherwise (verified live reading the algorithm
    already handles a brand-new item correctly — no new ordering logic
    needed); UI is a persistent composer. **The UI placement was corrected
    mid-session by the user after the Planner's first draft**: the
    composer sits at the **top** of the Shopping Mode list (above every
    item row), not the bottom — the user's own reasoning: the top of the
    screen is where attention actually is while shopping (point of view /
    "next item to grab"), not the bottom. The Planner had specified the
    bottom per the orchestrator's own initial (wrong) instruction; caught
    and fixed in the plan file before any code was written, so the
    Code Writer never had to be corrected. New `addBusyRef`/`addBusy` pair
    is a dedicated guard, deliberately not reusing `ShoppingScreen`'s
    existing per-item `pending: Set<string>` (that Set is keyed by
    existing item ids, useless for a not-yet-inserted item, and reusing a
    single shared boolean would have blocked unrelated check-off taps
    mid-write — the exact anti-pattern the issue's own design notes warned
    against). Reuses `addItem()` unchanged and `PrimaryButton`'s `keepFocus`
    prop from #61.
  - **#65 was already fully scoped** (`ready-for-agent`, no Problem
    Agreement round needed) — both real design forks were resolved with
    the user via `AskUserQuestion` in the prior session before filing.
    New `LocationCatalogScreen` (deep-linkable at `location/:locationId`),
    reached via a "View catalog" button on each `LocationsScreen` row.
    Reuses `loadLocationItems` and the *exact same* quorum-vote correction
    flow (`voteLocationItemCorrection`) Shopping Mode's pencil icon already
    uses — no new backend mechanism, no schema/migration changes. Grouped
    by section, alphabetical within each. Real empty state for an untagged
    location. Deliberately does not support tagging a never-before-tagged
    item (stays Shopping Mode's `tagItemLocation()` first-write-wins path
    only, per the issue's explicit non-goal).
  - **Both issues bundled into one PR at the user's request** — planned
    together (confirmed non-overlapping files: `ShoppingScreen.tsx` for
    #63 vs. `LocationCatalogScreen.tsx`/`LocationsScreen.tsx`/
    `App.tsx`/`navigation/types.ts` for #65, with only the last two shared
    and edited additively) since a single Code Writer pass could safely do
    both. Standard pipeline: Planner (plan saved to `PLAN-63-65.md`,
    committed on the branch) → Code Writer → separate Code Reviewer (zero
    findings, first pass) → orchestrator's own live-browser verification.
  - **Live-verified with real seeded-then-cleaned-up data**: added an item
    mid-shop via the real UI, confirmed unchecked/correct tail position/
    check-off-unblocked-during-write; a rapid triple-Enter burst on the new
    composer produced exactly 1 row, confirmed directly against the
    database (the `addBusyRef` guard actually works, not just compiles).
    For #65: proposed a correction from the catalog with one anonymous
    session, confirmed the same-proposer `already_voted` rejection, then
    confirmed it from a second, independent real anonymous session — and
    confirmed the applied correction shows identically from both the
    catalog and Shopping Mode (same underlying tables). Verified the real
    empty state on a genuine zero-tagged-item location ("New World South
    City") rather than a throwaway. **One thing worth carrying forward**:
    the second live-verification session (Claude-in-Chrome) turned out to
    be a *persisted* real anonymous test account from 2026-08-14
    ("Weekly Shop"), not a fresh one — Chrome profiles aren't incognito
    between sessions the way two separate tools might suggest. Still a
    genuinely distinct `auth.uid()` for the quorum test, but cleanup had to
    specifically scope to only this session's own new rows and leave that
    older account/household alone — confirmed untouched afterward, same
    "select first, confirm ownership" discipline this file has documented
    since production went public.
  - `npx tsc --noEmit` clean throughout (Code Writer, Code Reviewer, and
    the orchestrator independently). `mobile/app.json`/`mobile/package.json`
    bumped to `0.0.26`.

- **2026-09-06 (second) build session — #58 shipped and merged
  ([PR #62](https://github.com/mp3anthony/cartel/pull/62)), keyboard-close
  regression fully closed with a second, separate fix
  ([PR #61](https://github.com/mp3anthony/cartel/pull/61)), and three new
  issues filed: [#63](https://github.com/mp3anthony/cartel/issues/63)
  (`ready-for-human`, add-an-item mid Shopping Mode),
  [#64](https://github.com/mp3anthony/cartel/issues/64) (`ready-for-human`,
  a possible silent tag-loss bug — genuinely unresolved, see below), and
  [#65](https://github.com/mp3anthony/cartel/issues/65) (`ready-for-agent`,
  per-location item catalog — both design forks already resolved with the
  user via `AskUserQuestion`, no Problem Agreement round needed).
  [#52](https://github.com/mp3anthony/cartel/issues/52) is still open,
  still parked/blocked on the user's $50 GCP prepayment, unchanged. Next
  session should start with the user on #64 (it needs their memory of what
  happened, not more data-side investigation), then #63's Problem
  Agreement, then #65 (already unblocked) if nothing else is queued.**
  - **#61 — the keyboard-close bug PR #60 was supposed to fully close
    turned out to have a second, separate root cause the user was still
    hitting.** PR #60 (prior session) only fixed the *Return-key* submit
    path. Tapping the adjacent "Add"/"Create" button is a different code
    path — a plain DOM click shifts focus to the button first, blurring
    the field and dismissing the keyboard before `onPress` even runs.
    Fixed by giving `PrimaryButton` an opt-in `keepFocus` prop
    (`onMouseDown={e => e.preventDefault()}`, web-only), applied to
    exactly the three buttons next to the three "keep typing" composer
    fields — not a blanket default. Live-verified via a real dispatched
    `mousedown` that `event.defaultPrevented` fires and
    `document.activeElement` stays on the input, then confirmed the click
    still submits normally. **Honest gap, stated in the PR**: this
    Browser pane has no real on-screen keyboard to observe — verification
    proved the underlying mechanism, not that a real phone's keyboard
    visibly stays up. Orchestrator-diagnosed and fixed directly (not
    through the full subagent pipeline) — a quick, well-scoped
    conversational report, same precedent as #60's own session.
  - **#58 — partial finish keeps list active; history marks items not
    bought.** Ran the full pipeline: Planner (produced a plan the
    orchestrator saved as this session's `PLAN-58.md`, since the Planner
    role has no write tool) → Code Writer → separate Code Reviewer →
    orchestrator's own live-browser verification (subagents still can't
    reach real Browser-pane compositing, standing constraint since
    2026-08-15's Batch A).
    - **Design**: new `security definer` RPC, `public.finish_shopping()`
      (migration `20260906000000`), replacing the sequential
      direct-table-write shape (`archiveList()`'s conditional-update claim
      → `recordLocationCheckoff()` → `recordShopSession()`). Once a
      partial finish must leave `archived_at` null, there's no longer a
      single column whose transition can serve as an atomicity claim — the
      function instead locks the list row and its item rows, re-checks
      live state, and does everything (both inserts, the archive-or-trim
      branch) in one transaction, the same shape Slice 8's
      `vote_location_item_correction()` already established. Two
      concurrent finishes for the same list now serialize on the row lock
      instead of racing. `archiveList()`, `unarchiveList()`,
      `recordLocationCheckoff()`, `recordShopSession()` are all deleted —
      fully superseded, not left dead. Direct-write grants for the
      columns/tables they used are revoked; the RPC is now the only write
      path.
    - **History** shows every item from a shop's full snapshot, marking
      anything not bought "(not in this shop)" — applied uniformly to
      every card. Deliberately no separate "partially completed" badge
      (explicit choice): the per-item breakdown alone already says
      everything a badge would duplicate.
    - **Code review caught one real blocking bug**: the RPC's new
      exception codes (`already_finished`, `nothing_checked`,
      `no_location`) weren't mapped in `humanise()` — a lost race would
      have shown the user a raw internal string instead of a sane message.
      Fixed and re-verified by the same review pass.
    - **Orchestrator's own live verification caught a second real bug
      neither subagent flagged**: the "Finish shopping" confirm dialog's
      copy still said "It won't uncheck anything or change today's list"
      — true before this issue, false now (a partial finish does remove
      the checked items). Fixed live, before opening the PR.
    - Live-verified end to end against real seeded-then-cleaned-up data:
      partial finish trims the list and keeps it active; finishing the
      remainder later archives it and creates a **second, independent**
      History entry without touching the first; "Start new list from
      this" on a partial-finish card still copies the full original
      snapshot; directly re-invoking the RPC against an already-finished
      list cleanly raises `already_finished` with no duplicate write (the
      concurrency guard the issue explicitly asked not to hand-wave). All
      test rows queried and confirmed as this session's own before
      deletion, then deleted and reverified at zero.
    - `npx tsc --noEmit` clean throughout. `supabase/tests/rls_finish_shopping.sql`
      (new, 6 assertions) ran clean; `rls_lists_archived_at.sql` deleted
      (its assertions directly UPDATE `archived_at` as `authenticated`,
      which the new revoke breaks — its own atomicity claim is exactly
      what this issue supersedes).
    - **Housekeeping-only mismatch, not a correctness issue**: the live
      project's migration history has two applied entries (an original +
      a live follow-up fixing a `shop_sessions.location_id` NOT NULL
      violation the new RLS test itself caught before it ever reached the
      client) consolidated into one committed migration file. Verified the
      live function body is byte-identical to the committed file.
    - **`mobile/app.json`/`mobile/package.json` bumped 0.0.24 → 0.0.25 on
      both PR #61 and PR #62 independently** (same precedent as several
      past sessions) — both branches converged on the identical value, so
      the merge needed no manual resolution.
  - **A real, self-inflicted incident happened between these two PRs
    merging, worth remembering as a standing lesson**: the Code Writer
    applied #58's migration (including the grant revocations) directly to
    the **live, shared Supabase project** — the same one `main`'s deployed
    Vercel production build reads from — mid-session, well before PR #62
    was reviewed, verified, or merged. Production's still-deployed old
    frontend code (`archiveList()`/`recordLocationCheckoff()`/
    `recordShopSession()`, all direct table writes) started failing every
    real "Finish shopping" attempt with a permission-denied error the
    instant those grants were revoked — the user hit this live, on their
    phone, mid-session, and reported it as "You don't have access to
    that." Root cause confirmed by reading `humanise()`'s generic-denial
    fallback and correlating the timing, not guessed. **Fixed by merging
    PR #62 immediately** once the user approved both PRs — the moment the
    new RPC-based frontend deployed, the mismatch was gone. **The
    standing lesson**: this project's Supabase project is a single shared
    instance with no separate dev/staging tier, so a migration that
    *revokes* a grant an already-deployed frontend still relies on is
    live-breaking the moment it's applied, regardless of whether the
    matching frontend PR has merged yet. A future session doing a
    migration of this shape (RPC replacing direct writes, with a grant
    revocation) should either apply the migration and merge the frontend
    PR in the same short window, or hold the revoke statements back into a
    fast-follow migration applied only after the frontend is confirmed
    live.
  - **Investigated a second user report in two rounds — the first
    conclusion was real but incomplete, the user's pushback surfaced a
    genuinely separate, unresolved question. [#64](https://github.com/mp3anthony/cartel/issues/64)
    filed for it, `ready-for-human` — this is NOT closed, don't assume it
    is.** Initial report: "items I've located in previous shops aren't
    repopulating." First check: `milk`/`energy drinks` were tagged
    2026-08-23 at **Woolworths Papanui**, but today's list was shopping
    **Pak'nsave Papanui** — a different store, and `location_items` tags
    are deliberately per-location, so that specific case is genuinely
    working as designed (per-location crowd-sourcing, not a repopulation
    failure) — told to the user as such. **The user immediately pushed
    back with a detail that reframes the question**: they said Pak'nsave
    is specifically where their "big shop" happens, and they'd tagged
    Milk there before, at least once. Checked again, directly: `locations`
    has exactly one Pak'nsave Papanui row (created 2026-08-15, never
    duplicated), and **every** `location_items` row at that location —
    all nine of them, Milk included — has a `created_at` of *today*, all
    within an 11-minute window. There is no tag at this location
    predating today, full stop. Also ruled out a location-merge/cascade
    explanation: grepped `mobile/src` and confirmed **no code path in
    this app ever deletes a `locations` row** at all ("merge" here only
    means "reuse the existing nearby row," never delete-and-recreate), so
    there's no mechanism in current code that could have cascade-wiped a
    real tag. **Genuinely unresolved**: either the original Milk tag at
    Pak'nsave never actually saved at the time (a real, currently
    unlocated silent-write-failure bug — `tagItemLocation()`'s `23505`-
    is-fine handling is flagged in the issue as worth a hard look, not
    assumed innocent), or the user is thinking of Woolworths and the two
    "...Papanui" names got crossed in memory. Data alone can't
    distinguish these. Next session should start by asking the user for
    any more specific memory of the original tagging (roughly when, which
    store, whether they saw it confirm) before jumping to a live
    network-level repro.
  - **[#63](https://github.com/mp3anthony/cartel/issues/63) filed,
    `ready-for-human`**: no way to add an item while in Shopping Mode
    (`ShoppingScreen.tsx` has no "Add an item" field at all today, only
    `ListDetailScreen` does). Two genuine open questions recorded in the
    issue rather than guessed at: whether a newly-added item starts
    checked or unchecked, and where it slots into `computeRouteOrder()`'s
    output. Design notes for whoever picks it up: reuse `addItem()`
    unchanged, reuse the `busyRef`-not-`busy`-state re-entrancy guard
    pattern and #61's `keepFocus` fix rather than re-deriving them, and
    don't let a new add-composer's write-in-flight state block unrelated
    check-off taps (`ShoppingScreen` already uses a per-item `pending` set
    for exactly this reason).
  - **[#65](https://github.com/mp3anthony/cartel/issues/65) filed,
    `ready-for-agent`**: a per-location item catalog — browse everything
    ever tagged at a store, reached from `LocationsScreen`. Raised by the
    user in the context of #64 (a catalog would make "has anyone tagged
    this before" answerable at a glance instead of needing a DB check).
    Both real design forks resolved via `AskUserQuestion` before filing,
    not guessed: placement (a link from each `LocationsScreen` row, not a
    new top-level nav item) and editability (inline correction *is* in
    scope, reusing the existing quorum-vote flow Shopping Mode's pencil
    icon already uses — not read-only, and not a new correction
    mechanism). Explicitly does not support tagging a brand-new,
    never-tagged item from the catalog itself — that stays
    `tagItemLocation()`'s first-write-wins path in Shopping Mode; the
    catalog only ever shows/corrects items that already have at least one
    tag. Independent of #52 despite both touching locations.

- **2026-09-06 (first) build session — keyboard-close-on-add fixed and merged,
  [PR #60](https://github.com/mp3anthony/cartel/pull/60). Reported
  conversationally (not a filed issue), diagnosed and resolved same
  session via subagents at the user's explicit request. #52 is still
  parked/blocked on the user's $50 GCP prepayment (unchanged, see below);
  [#58](https://github.com/mp3anthony/cartel/issues/58) (partial-finish
  redesign, `ready-for-agent`, filed since the last session) is still open
  and untouched — next session should pick it up if nothing else comes up
  first.**
  - **Root cause**: `editable={!busy}` on "Add an item"
    (`ListDetailScreen.tsx`) and the analogous "List name"
    (`ListsScreen.tsx`) / "Location name" (`LocationsScreen.tsx`) create
    fields blurred the field the instant a write started (`busy` flips
    true for the round trip) — on react-native-web, disabling a focused
    `TextInput` blurs it, closing the on-screen keyboard even though the
    write resolves almost instantly. Fixed by removing `editable={!busy}`
    from just these three fields (the "keep typing to add the next one"
    composers) and leaving every other `editable={!busy}`/
    `editable={!pending...}` field alone (rename fields, tag/correction
    composers, household code fields, `submitCopy()`) — those are one-shot
    dialogs whose field disappears on success, so the same blip isn't
    user-visible there. Added `blurOnSubmit={false}` to ListsScreen's/
    LocationsScreen's fields (ListDetailScreen already had it from Batch
    A/#43's unrelated earlier fix).
  - **Pipeline caught a real, more serious bug live that code review
    missed — worth remembering as a general lesson**: removing
    `editable={!busy}` meant the Return-key path needed its own guard
    against a fast double-Return firing two overlapping writes. First pass
    (Planner-specified, Code-Writer-implemented, Code-Reviewer-approved
    with zero findings) added `|| busy` — reading React state — to each
    handler (`add()`/`submit()`/`submitCreate()`). **The orchestrator's own
    live-browser verification then proved this doesn't work**: dispatching
    3 rapid synchronous `KeyboardEvent('keydown', {key:'Enter'})` events on
    one field created 3 duplicate items, not 1. Root cause: React batches
    `setBusy(true)`, so several keydown handlers fired in the same
    synchronous burst all read the same stale `busy === false` from their
    closures before any render flushes — a genuine race the separate
    Reviewer's static-plus-reasoning pass didn't catch (it reasoned
    "React flushes the prior setBusy before the next event's handler
    runs," which is wrong for events dispatched synchronously in the same
    script execution, only true across separate event-loop turns). **This
    is the same class of bug Batch F's HANDOFF entry already
    documented once** (a reconciliation effect reading batched `pending`
    state instead of a synchronous ref) — the fix follows that same
    established idiom: a `busyRef` (`useRef`) per screen, set synchronously
    the instant a write starts and cleared once it settles
    (`.finally()`/`try-finally`, verified to cover every early-return
    branch — `LocationsScreen.submitCreate()` has 5), checked in the guard
    instead of the batched `busy` state. `busy` state itself is untouched
    as the UI source of truth (button disabling/spinners).
  - Sent back to a **fresh** Code Writer subagent (not a continued session
    — this environment's `SendMessage` isn't available for Agent-tool
    subagents here, confirmed via `ListAgents` showing no such peer/session
    to target) with the full diagnosis and the exact required fix shape;
    then a **fresh separate Code Reviewer** subagent re-verified — this one
    had real Browser-pane access and reproduced the rapid-triple-Return
    scenario itself, confirming exactly one row created per burst
    post-fix, both via the UI and a direct DB check.
  - **Live-verified by the orchestrator directly** against local dev
    (`mobile-web`, port 8082), real seeded-then-cleaned-up data: created a
    real test list via Return-key submit (confirming the field-focus fix
    itself — typed a list name, hit Return via a dispatched `KeyboardEvent`
    since `computer{action:"key"}` doesn't reliably reach RN-web's keydown
    handler here, same documented trap as Batch A — confirmed focus stayed
    on the same input element immediately after submit, then typed the
    next item with zero re-click needed), then reproduced and confirmed
    the fixed re-entrancy behavior (3 rapid Returns → exactly 1 "Eggs" item
    once the ref-based fix landed, vs. 3 duplicate "Eggs" rows on the first
    attempt before the fix). One environment note: `computer
    {action:"screenshot"}`/`read_page` initially reported a `0x0` viewport
    ("pane not displayed") until `resize_window {preset:"desktop"}` forced
    a real compositing size — after that, `read_page`/`computer` worked
    normally for the rest of the session. All test rows (own: 1 anonymous
    user, 1 list, up to 5 items incl. the 3 duplicate "Eggs"; the separate
    Reviewer subagent's own: 1 location, 1 list, 1 item) queried and
    confirmed as this session's own before deletion, then deleted and
    reverified at zero.
  - `npx tsc --noEmit` clean throughout (both Code Writer passes, both
    Code Reviewer passes). `mobile/app.json`/`mobile/package.json` bumped
    to `0.0.24`.
  - Not filed as a GitHub issue — reported conversationally and resolved
    same-session per the user's own explicit instruction ("resolve
    however's most logical, use subagents"), consistent with this
    project's precedent for small, well-scoped, immediately-actioned fixes.

- **2026-08-24 build session — #52 (Google Places search-assist) fully
  implemented, reviewed, and live-tested — parked, not merged, blocked on a
  real external cost the user can't cover right now. Nothing left to build;
  next session should start by checking whether that's changed, not by
  re-running Investigator/Planner/Code Writer.** Every open design question
  from the issue's own `ready-for-human` label was closed via
  `AskUserQuestion` this session (key called directly from the client,
  Autocomplete (New) + Place Details (New), attribution placement, and the
  real structural fork the issue didn't originally name — whether a picked
  suggestion's coordinates or a fresh GPS fix drive the nearby-merge check
  and the saved row; resolved as the picked place's coordinates, GPS only as
  the no-pick fallback) — full Investigator → Planner → Code Writer →
  separate Code Reviewer pipeline ran straight through with no further
  Problem Agreement needed.
  - **Where it's parked**: branch `52-google-places-search-assist`,
    committed (not pushed, not merged, not a PR) — `git checkout
    52-google-places-search-assist` to resume. New
    `mobile/src/lib/googlePlaces.ts` (stateless `searchPlaces`/
    `fetchPlaceDetails` against Places API (New), session-token lifecycle,
    `Outcome<T>`-shaped errors), `env.ts`'s `googlePlacesApiKey` made
    optional (its absence can never fail `envResult.ok` or blank-page the
    app — only hides the search-assist UI section),
    `LocationsScreen.tsx`'s debounced search state + `submitCreate`'s
    coordinate-source branch + new local `PlaceSuggestionRow`,
    `.env.example` documents the new optional var. `npx tsc --noEmit` clean.
    `mobile/app.json`/`package.json` bumped to `0.0.24` **on that branch
    only** — `main` is still `0.0.23`, don't assume the two stay in sync
    while this is parked.
  - **Code review (separate subagent session, never self-reviewing) found
    one real blocking bug and two related should-fixes, all in
    `pickSuggestion`'s missing staleness guard** — a slow/abandoned Details
    call's response could land after the user had already moved on (cleared
    the field, cancelled, picked a different suggestion) and silently
    overwrite `name`/`pickedPlace` with stale data. Applied directly by the
    orchestrator (small, well-specified, single-file fix — same
    `seq`-capture-and-check pattern `runPlaceSearch` already used elsewhere
    in the same file), then **re-verified by the same original Reviewer
    session** against the real disk state, not the description of the fix —
    confirmed clean, one purely cosmetic nice-to-have noted (a sub-second
    flicker window on Create-tap-during-pick, never wrong persisted data),
    not required before merge.
  - **One real process mistake this session, worth remembering**: at the
    re-verify step, an `Agent` call was fired with a placeholder prompt and
    `isolation: 'worktree'` by mistake — this is exactly the anti-pattern a
    2026-08-17 session (Batch D's entry, further down this file) already
    documented and named: never wrap a *continuation* of an existing
    subagent's already-loaded session in a fresh worktree. Caught
    immediately before the bad agent could do anything, stopped via
    `TaskStop`, and the real re-verify request sent correctly via
    `SendMessage` to the original Reviewer session's agent id instead. No
    damage done, but this is the second time this exact mistake has been
    made and documented — worth being genuinely careful about next time
    rather than assuming the earlier note was enough.
  - **Live verification found the actual root cause of "no joy" after the
    user set up the API key**, in three real steps, none of them guesses:
    (1) `mobile/.env` had gotten corrupted into UTF-16 encoding with the key
    line triplicated (from repeated append attempts), which the orchestrator
    fixed via a PowerShell rewrite — **and that rewrite itself had a bug**:
    a leading byte-order-mark on the first line broke a regex anchor and
    silently dropped both Supabase env vars from the file. Caught
    immediately by reading the file back before declaring success; restored
    both values from this same session's own earlier `cat mobile/.env`
    output (both are non-secret, ship-in-the-bundle-by-design values per
    the file's own `.env.example` comment, so this was recovery from
    already-seen data, not fresh credential handling). (2) The real content
    of the "fixed" file turned out to be the literal placeholder text
    `your_key_here` — copied verbatim from the orchestrator's own example
    command instead of the user's real key substituted in. (3) Once a real
    key was in place and the dev server restarted, the app's own displayed
    error ("Store search is misconfigured for this build") wasn't enough to
    diagnose from — the orchestrator installed a `window.fetch` interceptor
    via `javascript_tool` to capture the real Google response without ever
    reading the actual key value, and got the real answer directly from
    Google: `SERVICE_DISABLED` — **"Places API (New) has not been used in
    project 457203238164 before or it is disabled."** The key, its HTTP-
    referrer/API restrictions, and all the application code were correct
    throughout — the Google Cloud project simply never had the specific
    "Places API (New)" service (distinct from the similarly-named legacy
    "Places API") enabled.
  - **Real blocker, not a code or setup mistake**: enabling that service
    prompted Google Cloud for a one-time NZ$50 refundable Cloud Billing
    prepayment (a real, legitimate Google mechanism for certain
    country/risk billing profiles — confirmed via web research this
    session, not assumed) before the account's billing can activate at all.
    The user doesn't have $50 to put toward this right now — explicit
    instruction to park the issue, not chase a workaround. No known
    documented way to skip this prepayment was found. **Resume path is
    simple and needs no further design work**: once the user can cover that
    prepayment and enables Places API (New) on Cloud project
    `457203238164`, check out the parked branch, restart the dev server,
    and pick up live verification exactly where this session left off (a
    real NZ supermarket search, the zero-results case, abandon-without-
    picking, the coordinate-source branch, and the nearby-merge dedup
    check — full manual test plan already written into the Planner's
    original brief, not repeated here) — then open the PR and merge. No
    re-running Investigator/Planner/Code Writer.
  - This is a genuinely different kind of parked state than any prior
    `ready-for-human` entry in this file — those were blocked *before* any
    code was written pending a design or setup decision; this one is
    blocked *after* a complete, reviewed, mostly-live-verified
    implementation, purely on the user's own external finances. Worth the
    distinction if a future session's triage ever needs to prioritize what
    to pick up next.

- **2026-08-23 build session — #57 (clear shop history: per-entry and
  clear-all delete) shipped and merged, [PR #59](https://github.com/mp3anthony/cartel/pull/59).
  Issue auto-closed on merge. Fully scoped `ready-for-agent` issue with no
  genuine open design question (the issue itself resolved access shape and
  clear-all scope), so this ran without a Problem Agreement round — straight
  to implementation, a separate Code Reviewer subagent pass, live-browser
  verification, then merge on the user's go-ahead. [#52](https://github.com/mp3anthony/cartel/issues/52)
  is still the only thing left `ready-for-human`/blocked on the user —
  nothing else is queued, next session starts with the user.**
  - **First real DELETE grant `shop_sessions` has ever had** — the table was
    deliberately append-only since Slice 9 (`20260811000003_shop_sessions.sql`'s
    own header said so explicitly). New migration
    `20260823000002_shop_sessions_delete.sql` adds a DELETE policy that
    reuses the table's own SELECT predicate verbatim
    (`owner_id = auth.uid() or household_id = current_household_id()`) —
    equal-rank, not owner-only, matching every other household-shared
    table's precedent, per the issue's explicit instruction not to make
    shop history the first exception.
  - New `deleteShopSession()`/`deleteAllShopSessions()` in `shopSessions.ts`.
    The clear-all variant deliberately avoids a truly unfiltered
    `.delete()` call (which would read as a mistake to the next editor) —
    it uses `.delete().not('id','is',null)`, an always-true filter, and
    relies on RLS alone (not the filter) to bound the affected rows to the
    caller's own visible set, not just the `SHOP_SESSION_HISTORY_CAP=10`
    page `HistoryScreen` renders.
  - `HistoryScreen.tsx` gained a "Clear all history" action and a per-card
    "Delete" action, both behind the app's existing shared `Confirm`
    in-place card (same pattern as `ListDetailScreen`'s "Remove list") —
    no new confirmation primitive needed.
  - **New `supabase/tests/rls_shop_sessions_delete.sql` (6 assertions), run
    clean against the live project — its own header documents a real bug
    caught while authoring it, not a product bug**: a denied DELETE is
    silent under RLS (it just matches 0 rows, no exception raised), so
    checking whether a row survived a blocked delete *through the denied
    actor's own query* is meaningless — that actor has no SELECT
    visibility into the row either way, so the check always reads "gone"
    regardless of whether the delete actually worked or was blocked, and
    would silently pass a broken policy. Caught by directly reproducing
    each negative case both ways against the live project before locking
    the assertions in; fixed by checking ground truth via the bypass role
    instead. Worth remembering for any future negative-case RLS assertion
    on this project: the denying actor's own visibility is exactly what's
    being denied, so it can never be the check.
  - **Updated the original `rls_shop_sessions.sql`**: removed its now-stale
    assertion 12 ("no DELETE path at all, not even for the row's own
    owner") — this PR deliberately reverses that stance, so left
    unedited it would fail the next time anyone re-runs that file.
    Updated the header prose to point at the new test file instead of
    leaving stale "append-only" documentation. Re-ran the remaining 12
    assertions clean.
  - **A separate Code Reviewer subagent pass (never reviewing its own
    code) found one real UI bug before merge**: `beginCopy()`/
    `beginDeleteSession()` never reset `confirmingClearAll`, so the
    screen-level "Clear all history" confirm and a card's own
    delete-confirm/copy-composer weren't actually mutually exclusive —
    contradicting the code's own doc comment claiming at most one
    confirmation is ever shown. Fixed directly and re-verified live
    (opened clear-all's confirm, tapped a card's Delete, confirmed the
    clear-all confirm closed).
  - **Live-verified in the real Browser pane** against local dev
    (`mobile-web`, port 8082) with real seeded-then-cleaned-up data, not
    just code review: per-entry delete, clear-all (landing correctly in
    the "No shops recorded yet" empty state), and both Cancel paths for a
    real anonymous test user — each outcome confirmed against the
    database directly (not just the UI), and confirmed clearing history
    left the referenced location and any lists untouched. All test rows
    queried and confirmed as this session's own before deletion, then
    deleted and reverified at zero, across two separate seed/verify
    rounds (one for the delete/clear-all flows, one for the mutual-
    exclusion fix).
  - `npx tsc --noEmit` clean throughout. `mobile/app.json`/
    `mobile/package.json` bumped to `0.0.23`.

- **2026-08-23 build session — #31 (iOS PWA status bar stays white,
  doesn't follow theme) shipped and merged, [PR #56](https://github.com/mp3anthony/cartel/pull/56).
  Issue auto-closed on merge. This was the last `ready-for-human` item
  besides [#52](https://github.com/mp3anthony/cartel/issues/52) (still
  blocked on the user's own Google Cloud billing/API key setup) —
  nothing else is queued, next session starts with the user.** Unlike
  #52, #31's `ready-for-human` label turned out to be resolvable
  without a design interview: the "genuine open technical question" the
  label cited was really a research gap, not a decision only the user
  could make — closed by reading `expo-status-bar`'s actual web source
  (confirmed a complete no-op — four empty functions in
  `StatusBar.web.ts`) and researching iOS Safari/PWA `theme-color`
  behaviour, then confirming the resulting plan with the user via
  `AskUserQuestion` before writing any code. Real on-device verification
  (the other half of the label) still genuinely needed the user's iOS 26
  device — orchestrator built it, self-reviewed via a separate Code
  Reviewer subagent (zero findings), then handed the user a Vercel
  preview-branch shareable link (`get_access_to_vercel_url`) to test
  directly; user confirmed it worked and gave the go-ahead to merge.
  - **Root cause, not previously known**: `App.tsx`'s existing
    `ThemedStatusBar` (`expo-status-bar`) never touched web/PWA chrome
    at all — its web implementation is a no-op. The installed-PWA status
    bar background is governed purely by `<meta name="theme-color">` /
    `manifest.json`'s `theme_color` (both static, unwired leftovers from
    #26's session) and, per iOS 26 reports, the top element's own
    painted background — none of which tracked the app's Light/Dark/
    System state. `manifest.json`'s `theme_color` was also simply wrong
    — it held the accent color, not `tokens.color.ground`, which is what
    the header actually renders at the very top of every screen.
  - **Fix, layered rather than betting on one mechanism** (sources on
    iOS 26's exact behaviour genuinely conflict, cited in the PR body):
    static `prefers-color-scheme`-split `theme-color` meta tags + a
    matching `body` CSS rule in `public/index.html` (System/no-JS
    fallback), `manifest.json`'s `theme_color` corrected to `ground`,
    and a new `ThemedPwaChrome` component (`App.tsx`, sibling to
    `ThemedStatusBar`) that overwrites both the meta tags' `content` and
    `body`/`html`'s inline background live whenever `resolvedScheme`
    changes — the only way to track an **explicit** in-app override that
    disagrees with the OS scheme, not just System.
  - **Deliberately not touched**: `apple-mobile-web-app-status-bar-style`
    (the status bar *icon/text* colour, separate from its background).
    No documented `prefers-color-scheme` equivalent and no confirmed
    live-update path for an already-installed home-screen icon exist for
    that meta tag — it can only ever be one static baked-in choice,
    legible in one theme and not the other (e.g. `black-translucent`
    gives a transparent bar with permanently-white icons: great in Dark,
    poor contrast in Light). Flagged in the PR as a likely follow-up
    needing an explicit human call on which theme to favor, rather than
    silently picked. **The user confirmed the shipped fix as "perfect"
    without raising this** — read as icon legibility not being a problem
    in practice, not as the question having been separately re-litigated;
    worth a quick re-check if it ever comes up rather than assuming it
    was formally resolved.
  - `npx tsc --noEmit` clean (orchestrator and the separate Code Reviewer
    session both). `mobile/app.json`/`mobile/package.json` bumped to
    `0.0.22`.

- **2026-08-23 build session — #54 (edit a location's chain after creation)
  shipped and merged immediately after #51, [PR #55](https://github.com/mp3anthony/cartel/pull/55).
  Issue auto-closed on merge. Filed and built same-session, not at a future
  handoff: the user checked #51's real output on their own phone right after
  it shipped and found the actual gap this closes — see below. [#52](https://github.com/mp3anthony/cartel/issues/52)
  is still the only thing left `ready-for-human`/blocked on the user —
  nothing else is queued, next session starts with the user.** Same
  pipeline as #51: Planner → Code Writer → Code Reviewer (separate session,
  one real should-fix found and fixed directly) → orchestrator live-browser
  verification → merge (user's own "sort it all now" was the go-ahead for
  both the fix and the merge).
  - **Why this exists**: right after #51 merged, the user looked at the real
    production donut chart on their phone and asked why it showed no
    colours — turned out both of their real, already-in-use locations
    ("Pak'nsave Papanui", "Woolworths Papanui") had `chain = null`, because
    #51 could only set a chain *at creation time* and both predate it. A
    direct SQL fix was tried first and correctly **blocked by the
    permission classifier** as a live production data write — respected
    rather than routed around; building the real in-app edit feature and
    using it through the actual UI was the legitimate path instead, and is
    what actually happened.
  - **Design**: an open, non-owner-scoped `chain`-only UPDATE policy/grant
    on `public.locations` — deliberately not restricted to the row's
    creator, since this table has no ownership concept surfaced anywhere in
    its UI and SELECT/INSERT are already open to any authenticated user.
    `name`/`lat`/`lng` still have no UPDATE grant at all, unchanged.
  - New `updateLocationChain()` (`locations.ts`). `LocationsScreen.tsx`
    gained a pencil `IconButton` + status `Badge` on every row, reusing
    #51's own `ChainPicker` inline rather than duplicating it — deliberately
    a **sibling** of each row's `Row`, not nested inside its `trailing`
    slot, to avoid the two-nested-Pressables-react-to-one-tap problem
    `CheckTarget`'s own doc comment in `ui.tsx` already warns against.
    Writes immediately on tap, no Save/Cancel — matches the picker's own
    established feel from the create-composer.
  - `supabase/tests/rls_locations_chain.sql` grew from 6 to 11 assertions —
    #51's old "no UPDATE grant exists" negative control flipped into two
    positive ones (owner updates their own location; a genuinely *different*
    user also succeeds, proving the policy is actually open and not
    accidentally owner-scoped), plus new coverage that `name`/`lat`/`lng`
    stay unwritable (individually, and as part of one combined statement
    with `chain`) and that the check constraint still applies on UPDATE, not
    just INSERT. Ran clean against the live project, independently
    re-verified by both the Code Reviewer and the orchestrator.
  - **Code review caught one real should-fix**: closing a row's picker after
    a successful write unconditionally cleared `editingLocationId` — if a
    user switched to editing a *different* row while an earlier write was
    still in flight (only the saving row's own pencil gets disabled, not
    every other row's), the earlier write resolving would snatch the other
    row's now-open, untouched picker closed out from under them. No data
    corruption, fully recoverable by re-tapping, but a real glitch reachable
    given this feature's own motivating scenario (correcting several
    null-chain locations in one sitting). Fixed directly by only clearing
    `editingLocationId` when it still matches the row that was actually
    saved, re-verified clean.
  - **Live-verified against the real Supabase project — the same one
    production reads from — not a disposable test copy**, since fixing the
    two real locations *was* the point. Used the actual UI (local dev,
    pointed at the live project) to set "Pak'nsave Papanui" → `paknsave`
    and "Woolworths Papanui" → `woolworths`, confirmed via direct DB query
    after each. Verified changing an already-set chain by round-tripping
    Pak'nsave Papanui through Four Square and back, confirmed at each step.
    **One real mistake happened and was caught mid-session, worth knowing
    if this pattern gets reused**: an early `javascript_tool` DOM-query
    script located a pencil button by walking up a fixed number of parent
    elements from a text node and querying for the first `✏`-labelled
    button within that ancestor — too loose a locator, and it actually
    landed on a different row's button, silently setting the real "New
    World South City" location to `paknsave` instead of the intended
    "Pak'nsave Papanui" row. Caught immediately via a direct
    `execute_sql` check (not assumed correct from the click "succeeding"),
    reverted through the same real app UI back to `null` (its original
    state) before continuing, rather than patched via a raw SQL write. The
    fix for the rest of this session's testing: use `read_page`'s
    structured refs and the row's own unique `accessibilityLabel` (e.g.
    `[aria-label="Edit chain for Pak'nsave Papanui"]`) to scope every
    click precisely, instead of ad-hoc DOM-parent-walking — reliable every
    time it was used afterward. **Lesson for any future session driving
    this Browser pane against a list of near-identical rows**: prefer
    `accessibilityLabel`-scoped queries over walking a fixed number of
    parent levels from matched text — the latter is exactly the kind of
    thing that silently targets the wrong row when the DOM structure
    doesn't nest the way you assumed, and unlike a wrong read, a wrong
    *write* against production data doesn't announce itself — only a
    direct DB check after the fact caught this one.
  - `npx tsc --noEmit` clean throughout (Code Writer, Code Reviewer, and the
    orchestrator independently). `mobile/app.json`/`mobile/package.json`
    bumped to `0.0.21`.

- **2026-08-23 build session — #51 (chain brand colours on the store donut
  chart) shipped and merged, [PR #53](https://github.com/mp3anthony/cartel/pull/53).
  Issue auto-closed on merge. [#52](https://github.com/mp3anthony/cartel/issues/52)
  (Google Places search-assist, below) is still `ready-for-human` and
  genuinely blocked on the user — nothing else is queued, so next session
  should start with the user, not by picking up a pre-scoped issue.** Same
  pipeline as every prior batch: Planner → Code Writer → Code Reviewer
  (separate subagent session, zero blocking/should-fix findings) →
  orchestrator live-browser verification → merge (user gave the explicit
  go-ahead this session).
  - **Scope decision, stated up front and held throughout**: `chain` is set
    at location-creation time only — `LocationsScreen.tsx` has no
    edit-a-location flow for *any* field today (only create/select/merge),
    so building one just for this issue was judged disproportionate. No
    UPDATE grant/policy was added to `public.locations`; the table's
    pre-existing "no edit flow in scope" invariant (from Slice 4) now
    explicitly covers `chain` too. The issue's own testing checklist item
    about "editing a location" is the one item this PR doesn't satisfy —
    flagged plainly in the PR body rather than silently implied as done.
  - New nullable `chain text` column (check-constraint enum:
    `new_world`/`paknsave`/`four_square`/`woolworths`/`freshchoice`/`other`)
    — text+check, not a Postgres enum type, matching this table's own
    existing style. `'other'` is a real explicit selectable value, not just
    reachable via `null` — both render identically (today's
    tint-mixed-accent look), but a user who deliberately picks "Other"
    persists that as a conscious choice.
  - **New `mobile/src/theme/chainColors.ts`** — the chain→hex lookup, kept
    in its own sibling file rather than inline in `tokens.ts` specifically
    so `tokens.ts`'s own "one accent only" doc comment stays literally true.
    Colours are theme-invariant (same hex light/dark) — confirmed live, not
    just asserted.
  - **`DonutChart.tsx`**: a segment with a recognised chain renders in that
    chain's real brand colour; `null`/`'other'` falls through to the
    pre-existing `mixWithSurface()` tint-mixed-accent look, byte-identical
    to before #51. The collapsed "Other stores" tail bucket never uses a
    chain colour, regardless of what the collapsed locations' own chains
    are — a mix of multiple locations' history can't sensibly show one
    brand colour.
  - **`LocationsScreen.tsx`** gained a new local `ChainPicker` (not added to
    `ui.tsx` — single-use, chain-domain-specific) in the create-location
    composer: a vertical `Row`-based list, deliberately **not**
    `SegmentedControl` (the existing 3-option Light/Dark/System primitive)
    — 6 options including long labels ("Four Square", "FreshChoice") and
    the apostrophe in "PAK'nSAVE" don't fit that primitive's unwrapped
    single-row track built for 3 short options. PAK'nSAVE's yellow swatch
    (`#FFD600`) gets a border since it has near-zero contrast against light-
    theme `surface`/`ground` otherwise.
  - `supabase/tests/rls_locations_chain.sql` (new, 5 assertions: SELECT
    grant actually includes `chain`, a valid value round-trips, the check
    constraint rejects a realistic-looking bad value (`'countdown'` —
    Woolworths NZ's pre-rebrand name, not an arbitrary string), `'other'` is
    a real explicit value distinct from `null`, no UPDATE grant/policy
    exists at all) — ran clean against the live project (ref
    `chacavfoewyiwrfgvxtj`), independently re-run by both the Code Reviewer
    and the orchestrator, not just trusted from the Code Writer's own
    report.
  - **Live-verified in the real Browser pane** against local dev
    (`mobile-web`, port 8082) with real seeded-then-cleaned-up data — not
    just code review. Created 3 real test locations via the actual UI
    composer (New World, PAK'nSAVE, and one left at the default "Other"),
    confirmed via direct DB query that `chain` persisted correctly for each
    (`new_world`/`paknsave`/`null`). Seeded 3 `shop_sessions` rows (one per
    test location) via SQL to populate the donut chart, then confirmed via
    the actual rendered SVG `stroke` attributes — not a screenshot, since
    `computer{action:"screenshot"}` failed with the same "Browser pane is
    not displayed" error this file has documented before — that all 3
    segments were visually distinct: New World `#E11A2C` and PAK'nSAVE
    `#FFD600` exact brand hexes, the unset location's segment computed
    exactly via `mixWithSurface()`'s own formula (`#866c20` in dark theme,
    `#da8d6d` in light — hand-verified both by computing the blend by hand).
    Re-verified in light theme via `resize_window`'s `colorScheme` param
    paired with a real dimension change plus a page reload (the pairing
    this file has previously documented as necessary for
    `prefers-color-scheme` emulation to actually take effect in this pane —
    held again this session) — confirmed brand hexes stayed identical
    across themes (theme-invariant, as designed) while the fallback tint
    correctly recomputed per theme. Chain-picker swatch colours themselves
    were also confirmed via computed `background-color` reads against the
    expected `rgb()` conversions of each brand hex, at the correct 14×14px
    size, before any location was created. Pre-existing locations with
    `chain = null` (real ones already in the dev database — "New World
    South City", "Pak'nsave Papanui", "Woolworths Papanui") loaded and
    rendered throughout with no crash. All test rows (1 anonymous user, 3
    locations, 3 `shop_sessions` rows) queried and confirmed as this
    session's own before deletion, then deleted and reverified at zero.
  - **One environment note, not a code issue**: `computer{action:"left_click"}`
    timed out once on the nav-menu button early in this session's testing —
    consistent with this file's already-documented click-reliability trap
    for this Browser pane — worked around with the same `javascript_tool`
    direct-`.click()` fallback already recommended elsewhere in this file.
    No new issue filed; nothing about this session suggests the underlying
    cause has changed.
  - `npx tsc --noEmit` clean throughout (Code Writer, Code Reviewer, and the
    orchestrator independently). `mobile/app.json`/`mobile/package.json`
    bumped to `0.0.20`.
  - **A local-only commit from the start of this session
    (`74d9ba0`, the prior research session's own handoff) had never been
    pushed to `origin/main`** — discovered when `git pull` after this PR's
    merge produced a real merge commit instead of a fast-forward. Pushed
    immediately after merging so `origin/main` and local `main` are back in
    sync (`551f6c8`). Worth a passing note only — no data was at risk, but
    if a future session's `git push` after a merge doesn't fast-forward
    cleanly, check for exactly this (an unpushed local commit predating the
    session) before assuming something is wrong.

- **2026-08-23 research session — NZ supermarket branding + Google Places
  investigated, zero code written. Next session should start by building
  [#51](https://github.com/mp3anthony/cartel/issues/51) directly
  (Planner → Code Writer → Code Reviewer, same pipeline as every batch
  above) — it's fully scoped, `ready-for-agent`, no more input needed from
  the user.** Two out-of-spec ideas the user raised conversationally, run
  through Protocol Step 1 (out-of-spec → `CHANGE-LOG.md`) then Step 2
  (Problem Agreement via `AskUserQuestion`, not skipped) before either
  became an issue. A dedicated research subagent did the actual legwork
  (`docs/research/nz-supermarket-branding-and-google-places.md`, cited
  primary sources throughout) — both issues below cite it rather than
  re-deriving the research in the issue body.
  - **[#51](https://github.com/mp3anthony/cartel/issues/51) — real NZ
    supermarket brand colours on the dashboard donut chart (from #22) and
    store badges, replacing today's single tint-mixed accent colour.**
    `ready-for-agent`, start here. Chains confirmed still real/current as
    of 2026 (Countdown fully renamed to Woolworths, Dec 2025 — no
    "Countdown" stores left) with hex values pulled from each chain's own
    logo SVG or live site CSS, not guessed: New World `#E11A2C`, PAK'nSAVE
    `#FFD600`, Four Square `#ED1D24`/`#278342`, Woolworths `#007837`,
    FreshChoice `#D8232A`/`#9EC73D`. **One correction worth knowing before
    touching `locations`**: FreshChoice/SuperValue are Woolworths NZ
    franchises (via their WDL subsidiary), not Foodstuffs South Island as
    might be assumed — don't group them with New World/PAK'nSAVE/Four
    Square in any UI copy or grouping logic. SuperValue itself is
    deliberately excluded from the chain picker — down to ~3 stores
    nationally, being phased into FreshChoice. **Real schema decision,
    confirmed with the user via `AskUserQuestion` rather than assumed**: a
    new explicit `chain` field on `locations` (dropdown: New
    World/PAK'nSAVE/Four Square/Woolworths/FreshChoice/Other), not
    auto-detection from the location's free-text name — name-matching was
    explicitly rejected as too fragile (typos, reordered words, unrelated
    names). Full hex table + sourcing notes, plus a "sample real signage
    before shipping" caveat (neither chain publishes a formal brand PDF),
    in the research doc.
  - **[#52](https://github.com/mp3anthony/cartel/issues/52) — Google
    Places API as a search-assist when creating a location.**
    `ready-for-human`, genuinely blocked, don't hand this to
    Investigator/Planner yet. Scope agreed with the user: search-assist
    only (prefills the existing manual-create form's fields from a Google
    result; the row still saves into Cartel's own `locations` table
    exactly as today, no live/recurring Google querying, no change to the
    existing GPS-based nearby-check). A genuine live-search feature was
    explicitly considered and rejected as not worth the complexity at this
    app's scale (2 users) — see the research doc, Question 2, for why:
    Google's Places ToS only allows keeping `place_id` indefinitely
    (lat/lng caps at 30 days, everything else — name, address — isn't
    supposed to be cached at all), which is a genuine tension with even the
    search-assist pattern on a strict reading, flagged in the issue as
    accepted-low-risk for a private 2-household app rather than hidden.
    Cost was never the blocker — 500-2,000 calls/month lands entirely
    inside Google's free monthly allowance (5,000 calls, Nearby-Search-Pro
    SKU) — the blockers are (a) Google Cloud billing/API key setup, which
    only the user can do (a credit card has to go on file even to stay
    inside the free tier — no agent action can complete this), and (b) a
    real architecture fork not yet decided: Autocomplete+Place Details vs.
    another endpoint (the research covered `searchNearby`, not this
    feature's actual "search by name/area" shape, so that's still open),
    and whether the API key is called directly from the mobile-web client
    or proxied through a new Supabase Edge Function.
  - Both issues are logged in `CHANGE-LOG.md`'s 2026-08-23 rows.

- **2026-08-18 build session — Batch G (#42) shipped and merged,
  [PR #50](https://github.com/mp3anthony/cartel/pull/50). Issue auto-closed
  on merge. This was the last item in the 2026-08-15 triage backlog —
  Batches A through G are all now shipped. Nothing is queued; next session
  should start with the user, not by picking up a pre-scoped batch.**
  Same pipeline as Batches A-F: Planner → Code Writer → Code Reviewer
  (separate subagent session, zero findings on first pass) → orchestrator
  live-browser verification. Defensive-recovery only, per this batch's own
  prior triage note — the actual root cause of the intermittent JWT error
  was never diagnosed or reproduced, only its blank-page symptom.
  - **The real mechanism behind the reported blank page was almost
    certainly an uncaught exception with nothing to catch it** — both
    *known* error branches in `App.tsx`'s `Bootstrapped`
    (`useAnonymousSession`'s and `useHousehold`'s `status === 'error'`)
    already rendered real error screens before this batch; there was no
    React error boundary anywhere in the app, so any *unhandled* throw
    elsewhere in the tree (e.g. surfacing from Supabase internals on a
    genuinely bad JWT) would have unmounted straight to a blank page with
    nothing shown. Fixed with a new `AppErrorBoundary` (class component —
    `componentDidCatch`/`getDerivedStateFromError` have no hook
    equivalent, not left as an open question), wrapping only the
    `Bootstrapped` branch in `App.tsx` (not `ConfigErrorScreen`, a
    separate config-time problem that never touches Supabase).
  - **Both pre-existing error branches gained a manual "Try again" retry**,
    where previously the only way out was an external browser reload.
    Session retry re-runs `useAnonymousSession`'s effect via a new internal
    retry-token (`retry()`, exposed on the hook's `error` variant) rather
    than reloading the page; household retry reuses the hook's own
    pre-existing `refresh()` — no new mechanism needed there. Deliberately
    no automatic/silent retry, no backoff, no retry limit anywhere — every
    retry added is a single manual click, per the batch's own explicit
    non-goals.
  - **New shared `logDiagnostic(scope, subject, extra)`**
    (`mobile/src/lib/logging.ts`) — plain `console.error` with a
    `[cartel:<scope>]` prefix and a JSON body including an `isJwtShaped`
    flag, since this codebase has no telemetry/logging service and adding
    one was explicitly out of scope. Called from the error boundary's
    `componentDidCatch`, both `useAnonymousSession` error paths,
    `useHousehold`'s error path, and a new `client.auth.onAuthStateChange`
    listener in `supabase.ts` (registered once, inside the singleton-client
    creation block) logging every auth transition — this last one is the
    actual "catch it in the act" monitoring the issue asked for, since
    nothing previously logged auth state transitions at all. No change to
    `autoRefreshToken`/`persistSession`/`detectSessionInUrl`.
  - **Live-verified in the real Browser pane** against local dev
    (`mobile-web`, port 8082), all three recovery paths exercised for real
    via temporary, fully-reverted test-only source edits (confirmed
    `git diff` clean before opening the PR, `npx tsc --noEmit` clean
    throughout): injected a real throw in `Bootstrapped` guarded by a
    `?crashtest=1` query param → confirmed the "Cartel hit a snag" screen
    rendered instead of a blank page, the full component stack logged via
    `[cartel:error-boundary]`, clicking Reload triggered a genuine
    full-page reload (confirmed via a second, later-timestamped
    `componentDidCatch` log entry for the same crash), and removing the
    crash condition let the app recover cleanly to a normal Dashboard.
    Separately forced `useAnonymousSession` and `useHousehold` into their
    error branches (query-param-guarded temporary edits, each reverted
    before the next test) and confirmed "Try again" advanced an
    attempt-counter each click (0→1, then a separate 1→2 test) with no
    full page reload for either — proving the retry-token/`refresh()`
    mechanisms actually re-run client-side rather than just compiling.
    Confirmed `[cartel:auth-state]` lines (`INITIAL_SESSION`, `SIGNED_IN`)
    appear on a normal fresh load. The Browser pane's `computer` click
    tool timed out once mid-session on the Reload button (consistent with
    this file's already-documented click-reliability trap) — worked around
    with the same `javascript_tool` direct-`.click()` fallback the trap
    entry already recommends, no new issue.
  - `npx tsc --noEmit` clean throughout (Code Writer, Code Reviewer, and
    the orchestrator after every temporary test edit was reverted).
    `mobile/app.json`/`mobile/package.json` bumped to `0.0.19`.

- **2026-08-18 build session — Batch F (#39) shipped and merged,
  [PR #49](https://github.com/mp3anthony/cartel/pull/49). Issue auto-closed
  on merge. Batch G (below, still fully scoped from the 2026-08-15 triage
  session) is the only one left — pick it up directly next session, no
  further triage needed.** Same pipeline as Batches A-E, but with a real
  investigation step first per this batch's own HANDOFF note not to assume
  the fix: measured actual check-off round trips live against local dev
  (`mobile-web`, port 8082) before any Planner work — two real taps came
  back in ~210ms and ~207ms, click-to-DOM-update, nowhere near the
  reported 12 seconds. This confirms (as the prior triage session's own
  note already suspected) that neither missing-optimistic-UI nor the
  redundant reload fully explains a literal 12s stall in isolation — the
  real-world stall is most plausibly explained by conditions this local
  environment can't reproduce (the user's actual network, Supabase
  free-tier cold start). The fix doesn't chase an exact 12s repro; it
  makes perceived latency near-zero regardless of the underlying
  round-trip time, which is what the issue actually asked for.
  - **Optimistic check-off UI**, `ShoppingScreen.tsx` only (not
    `ListDetailScreen.tsx`'s own per-item circle — out of scope, issue
    title/repro is specifically Shopping Mode). A new `optimisticChecked:
    Map<string, boolean>` overlay flips a row's checkmark on the same tick
    as the tap, read through a new `isChecked(item)` helper used
    everywhere a row's effective checked state matters (`CheckTarget`'s
    `checked` prop, the header's `N of M checked` count) — `computeRouteOrder`
    deliberately still reads raw `checkoffs`/`locationItems`, unrelated to
    this per-session toggle state. `toggle()` no longer calls its own
    `refresh()` on success — that was the second, redundant reload the
    issue's own text named — relying instead on the pre-existing Realtime
    echo in `useListItems.ts` to eventually confirm the write.
  - **`finishShopping()`'s freshness fix, a genuine correctness fix, not
    one more accepted-race precedent.** Removing `toggle()`'s own
    `refresh()` meant `finishShopping()` could no longer trust the
    render-time `items` it was called with to be fresh enough for the
    *permanent* `location_checkoffs`/`shop_sessions` record it writes — a
    user checking an item and immediately hitting "Finish shopping" before
    the Realtime echo lands (or ever, if that device's channel is
    degraded) could have silently dropped that item from history forever.
    Fixed by having `useListItems`'s `refresh()` return the `Outcome` it
    already computed internally (previously discarded — additive change,
    `ListDetailScreen.tsx`'s own existing `await refresh();` call is
    unaffected), and `finishShopping()` now calls it once itself right
    after the archive claim succeeds, using that guaranteed-fresh array —
    not the stale `items` parameter — for both `orderedCheckedItemNames`
    and `recordShopSession`. A failed forced-refresh reuses the same
    compensating-`unarchiveList()` pattern the function's other two
    failure branches already use. Deliberately reasoned as *not* the same
    class as Slice 4's location-merge race, Slice 8's vote race, or Slice
    9/Batch C's own accepted write-gap risk — those are all self-healing
    or bounded; a silently incomplete permanent history record isn't.
  - **Code review (separate session) caught one real, severe bug before
    merge**: the reconciliation `useEffect` that clears an overlay entry
    once real data confirms it was originally keyed on `[view, pending]`,
    so it re-ran on every `pending` change too — `toggle()`'s own `finally`
    clears `pending` as soon as `setChecked()`'s round trip resolves, well
    before the slower Realtime-echo refresh that actually updates `view`
    lands, so the reconciliation effect fired early, read the still-stale
    `view`, and deleted the just-set overlay entry before any real
    confirmation existed — a visible checked→unchecked→checked flicker, or
    a checkbox stuck unchecked indefinitely if the echo never arrived at
    all. This would have defeated the entire point of the fix. **Applied
    directly by the orchestrator** (small, well-specified, single-file
    change — read `pending` through a `useRef` synced by its own effect
    instead of depending the reconciliation effect on `pending` itself, so
    it only fires when `view` changes) rather than routed back through the
    Code Writer session, then **re-verified by the same separate Reviewer
    session** against the actual disk state, not the description of the
    fix — confirmed clean, no new findings, no stale-ref race (React
    commits effects in declaration order, so the ref-sync effect — declared
    first — always runs before the reconciliation effect reads it, whether
    they fire in the same commit or different ones).
  - **Live-verified in the real Browser pane** against local dev with real
    seeded-then-cleaned-up data: created a list, attached a pre-existing
    test location ("New World South City" — untouched, not created by this
    session), entered Shopping Mode. Repeated check/uncheck on the same
    item traced via `aria-checked` polling (30ms/10ms intervals over
    4-5s windows) confirmed instant flip with zero reversion — no flicker,
    confirming the review fix actually landed on the rendered page, not
    just in source. Header count stayed in sync with the optimistic state
    throughout. The specific `finishShopping` race was exercised directly,
    not just reasoned about: checked an item and, with literally zero added
    delay, immediately tapped "Finish shopping" and confirmed — then
    queried `shop_sessions.checked_item_names` directly and confirmed the
    just-tapped item was correctly included, the exact case the freshness
    fix targets. All test rows (1 anonymous user, 1 list, 3 `list_items`,
    1 `shop_sessions` row, 1 `location_checkoffs` row) queried and confirmed
    as this session's own before deletion, then deleted and reverified at
    zero; the pre-existing test location itself was left untouched.
  - One pre-existing, unrelated console noise seen during testing, not
    investigated further: a stray `Failed to load resource: 409` and the
    long-standing nested-`<button>` hydration warnings this file's Traps
    section already documents for `ListDetailScreen`'s `Row` — both
    appeared to be stale/buffered from an earlier, unrelated interaction
    in the same tab session (a stale-localStorage FK-violation retry before
    this session's real testing began) rather than something this batch's
    diff introduced; not chased further since nothing in the actual
    check-off/finish-shopping flow showed any error-state UI.
  - `npx tsc --noEmit` clean throughout (Code Writer, Code Reviewer twice
    — original pass and re-verify — and the orchestrator after applying
    the review fix directly). `mobile/app.json`/`mobile/package.json`
    bumped to `0.0.18`.

- **2026-08-18 build session — Batch E (#32) shipped and merged,
  [PR #48](https://github.com/mp3anthony/cartel/pull/48). Issue auto-closed
  on merge. Batches F-G (below, still fully scoped from the 2026-08-15
  triage session) are next, suggested order F → G unchanged.** Same
  pipeline as Batches A-D: Planner → Code Writer → Code Reviewer (separate
  subagent session from Code Writer) → orchestrator did live-browser
  verification directly → orchestrator merge (standing go-ahead, no
  per-batch re-ask needed). One fix-and-reverify round was not needed this
  time — the Code Reviewer's independent pass found zero issues on the
  first round.
  - Presentational-only batch, no schema changes. Replaced the bare,
    unlabeled `+` `IconButton` shown under each untagged shopping-list item
    with a small local `Pressable` ("+ Tag aisle") styled in the app's one
    accent color, so it reads as an action rather than stray punctuation.
    `beginTagging()`, `composingItemId`, and the inline composer it opens
    are unchanged — this was purely about the affordance being
    recognizable at a glance, not the underlying route-learning/tagging
    mechanism (which already works from check-off order; section tags are
    only a fallback).
  - **Deliberately local composition, not a shared-primitive change** —
    `IconButton` (`ui.tsx`) was NOT extended with a label prop (it has a
    fixed single-glyph 44×44 contract shared by 4 other call sites —
    diluting that for one caller was rejected), `Badge` was NOT made
    pressable (it's a pure-display "scope marker" used by 5 other call
    sites — conflating "display a fact" with "create a fact" was
    rejected), and no new shared primitive was added (YAGNI — one call
    site today). All reasoning is in the plan and repeated in the PR body
    — if a second real caller for a labeled-icon-button shape shows up
    later, extracting a shared primitive then is grounded in two real
    usages instead of a guess.
  - **One known, deliberately-untouched gap, carried forward not
    introduced**: the new affordance still has no `pending`/`disabled`
    guard (`pending.has(item.id)`), same as the bare `+` `IconButton` it
    replaced — unlike the ✏ correction-pencil icon and the composer's
    Save/Cancel buttons in the same file, which do check it. Confirmed via
    the diff that this predates the batch; flagged as a possible separate
    follow-up rather than fixed inline (out of scope for a
    presentational-only fix).
  - **Live-verified in the real Browser pane** against local dev
    (`mobile-web`, port 8082) with real seeded-then-cleaned-up data: created
    a personal list, a fresh test location (geolocation mocked per this
    file's own documented `navigator.permissions.query` +
    `getCurrentPosition` trap — and re-discovered that a failed location
    creation attempt leaves `LocationsScreen`'s permission-denial sticky
    until the screen remounts, exactly as this file's Loose-ends section
    already documented; worked around by navigating back to
    `ListDetailScreen` and re-opening "Attach a location" rather than
    retrying in place), attached it, entered Shopping Mode, and confirmed
    via computed styles on the real DOM: the new control renders "+Tag
    aisle" as two text nodes, `border-radius: 999px` (pill), 1px border in
    the dark-theme `border` token color, 44px min height, and both text
    nodes in the dark-theme `accent` color (`#C9A227`) at the correct
    `fontSize`/`fontWeight` (16/700 for "+", 13/600 for "Tag aisle") — all
    token-driven, none hardcoded. Also drove the full interaction through:
    clicked the new affordance, the same `Field`+Save/Cancel composer
    opened as before, typed "Aisle 3", saved, and confirmed the row
    correctly flipped to the tagged state (`Badge` "Aisle 3" + pencil
    `IconButton`) — the underlying tagging mechanism is unaffected by the
    presentational change, confirmed live not just by code reading. All
    test rows (1 anonymous user, 1 list, 1 location, 1 `location_items`
    row) queried and confirmed as this session's own before deletion, then
    deleted and reverified at zero — deletion also incidentally confirmed
    cascade/Realtime removal worked (the list disappeared from the live
    UI immediately after the SQL delete, with no manual refresh).
    `computer{action:"screenshot"}` was not attempted this session (not
    needed — DOM/computed-style verification was sufficient and consistent
    with the last two sessions' documented pattern of screenshot
    unreliability in this pane); did not retest whether that constraint
    has changed.
  - `npx tsc --noEmit` clean throughout (independently re-run by the Code
    Writer and the Code Reviewer). `mobile/app.json`/`mobile/package.json`
    bumped to `0.0.17`.

- **2026-08-17 build session — Batch D (#34) shipped and merged,
  [PR #47](https://github.com/mp3anthony/cartel/pull/47). Issue auto-closed
  on merge. Batches E-G (below, still fully scoped from the 2026-08-15
  triage session) are next, suggested order E → F → G unchanged.** Same
  pipeline as Batches A-C: Planner → Code Writer → Code Reviewer (separate
  subagent session from Code Writer) → one fix-and-reverify round on the
  reviewer's findings → orchestrator did live-browser verification directly
  → orchestrator merge (standing go-ahead, no per-batch re-ask needed).
  Presentational-only batch, no schema changes — the plain-text "shop
  recorded" confirmation in `ShoppingScreen.tsx`'s `justFinished` render is
  now a new `Banner` primitive in `ui.tsx`: bordered, elevated, icon-carrying,
  in-flow (not an overlay/toast library — matches `Confirm`'s existing
  precedent that react-native-web has no `Alert`, so anything not rendered
  in the document never appears on this project's one verified surface).
  - **No auto-dismiss timer, deliberately.** `justFinished` already persists
    until the screen unmounts by construction (`toggle()` early-returns once
    the list is archived, so nothing resets it mid-mount) — an
    auto-hiding banner would have *reduced* visibility versus the old
    persistent text, working against the issue's own ask ("hard to miss...
    before putting your phone away"). Manual dismiss (×) is local-only
    `Banner` state, never wired back into `ShoppingScreen` — confirmed this
    doesn't interact with the "Finish shopping" button's own disabled
    gating (`list.archivedAt !== null`, independent of `justFinished`).
  - **The "already recorded" (archived-but-not-just-finished) branch is
    deliberately untouched** — still plain `Body` text, out of scope per
    the issue (which is specifically about the moment right after
    finishing a shop, not a returning visit to an already-archived list).
  - **Code review (separate session) caught three real, if minor, issues,
    all fixed before merge**: a `Banner` doc comment citing reasoning
    supposedly explained in "ShoppingScreen's justFinished doc comment" —
    which doesn't exist, a dead pointer — fixed by inlining the actual
    reasoning; `accessibilityLabel="Dismiss"` lacked context, breaking this
    codebase's own established pattern of naming what a control acts on
    (every other dismiss/action control does, e.g. `NavMenu`'s "Close
    menu") — fixed to `"Dismiss confirmation"`; and `banner`'s
    `alignItems: 'center'` was inconsistent with `ErrorNote`'s own
    `errorRow` precedent (`'flex-start'`, so a wrapped multi-line message
    top-aligns against the icon/button) — fixed to match. **One real
    process hiccup worth remembering**: the fix-round agent was
    accidentally spawned with `isolation: 'worktree'` (should never have
    been set — nobody asked for one), and that worktree was auto-removed
    mid-session while the agent was still using it, hard-blocking its
    `Bash`/`Edit`/`Write` tools entirely. The agent correctly refused to
    self-recover via `EnterWorktree`/`ExitWorktree` (out of its own
    authorized scope) and reported the failure clearly instead of
    pretending to have finished — the orchestrator applied the three
    (already well-specified, drafted-but-undelivered) fixes directly
    instead, and the original separate Reviewer session re-verified the
    real result against disk, not against any claim. **Lesson for next
    time**: never attach `isolation: 'worktree'` to an `Agent` call whose
    job is to `SendMessage` into an *existing* subagent's already-loaded
    session — that existing session isn't scoped to a fresh worktree the
    way a brand-new agent would be, so the isolation wrapper adds risk
    (a worktree that can vanish out from under a resumed session) for zero
    benefit. Reserve `isolation: 'worktree'` for genuinely new, first-run
    agents that need an isolated copy to mutate files in parallel.
  - **Live-verified in the real Browser pane** against local dev
    (`mobile-web`, port 8082) with real seeded-then-cleaned-up data, not
    just code review: checked off an item, tapped "Finish shopping",
    confirmed → `Banner` rendered with `role="alert"`, a check glyph, bold
    text, and a working dismiss (`aria-label="Dismiss confirmation"`,
    confirming the review fix actually landed on the rendered page, not
    just in source). Computed styles confirmed dark-theme `surface`/
    `positive` tokens, 2px border, `radius.lg`, `elevation.card` shadow,
    and `alignItems: flex-start` all applied correctly on the live DOM.
    Dismissing the banner removed only the banner — button/rest of screen
    unaffected. Re-checked at 375px mobile width — banner and dismiss
    control both rendered without clipping. One pre-existing, unrelated
    nested-button console warning in `ListDetailScreen`'s `Row` was present
    both before and after this change — not introduced by this PR, not
    investigated further (out of this batch's scope).
  - **`computer{action:"screenshot"}` failed all session ("the Browser pane
    is not displayed, so the page is not compositing frames")** — but
    unlike the prior (Batch C) session's *total* failure, `read_page`/
    `javascript_tool`'s `getBoundingClientRect()` and computed-style reads
    worked fine throughout, returning real non-zero rects and real values
    every time. Verification proceeded via DOM/computed-style checks
    instead of a visual screenshot — a different, narrower failure mode
    than Batch C's (that session's `getBoundingClientRect()` also returned
    all-zero rects, meaning nothing in the pane was reachable at all).
    Worth tracking if this recurs a third time: screenshot-specifically
    failing while DOM-level reads keep working may point at something more
    specific than the general "pane not displayed" state Batch C's entry
    described.
  - **One live-verification gap, flagged rather than silently skipped**:
    did not re-verify live that a full remount of the *specific* archived
    list still renders the plain `Body` "already recorded" text instead of
    `Banner` — there's no URL-based deep link back into an archived list
    once `ListsScreen`'s active view filters it out (Batch C's own
    behavior, confirmed still working during this session's testing), and
    building a throwaway path to reach it felt disproportionate to a
    presentational-only batch. That render branch is byte-identical to
    Batch C's own structure otherwise; both the Code Writer and Reviewer
    independently traced why `justFinished` resets to `false` on remount
    before this was accepted as adequately covered by code-level reasoning
    instead.
  - All test rows (2 lists, 2 `shop_sessions`, 2 `location_checkoffs`, one
    location — New World South City, pre-existing, NOT created by this
    session, correctly left untouched) queried and confirmed as this
    session's own before deletion, then deleted and reverified at zero.
  - `npx tsc --noEmit` clean throughout (independently re-run by the Code
    Writer, the Code Reviewer twice, and the orchestrator after applying
    the fixes directly). `mobile/app.json`/`mobile/package.json` bumped to
    `0.0.16`.

- **2026-08-17 build session — Batch C (#33, #35) shipped and merged,
  [PR #46](https://github.com/mp3anthony/cartel/pull/46). Both issues
  auto-closed on merge. Session stopped here on purpose per the user's own
  framing ("start batch C, merge it once done and stop there") — Batches
  D-G (below, still fully scoped from the 2026-08-15 triage session) are
  next, suggested order D → E → F → G unchanged.** Same pipeline as
  Batches A/B: Planner → Code Writer → Code Reviewer (separate subagent
  session from Code Writer) → one fix-and-reverify round on the reviewer's
  findings → orchestrator merge. **One real deviation from every prior
  batch, flagged in the PR body and here, not silently skipped: no
  live-browser verification happened this session.** The Browser pane was
  not displayed on the user's side for the whole session — `computer
  {action:"screenshot"}` timed out repeatedly ("the Browser pane is not
  displayed, so the page is not compositing frames"), and `getBoundingClientRect()`
  on real DOM elements returned all-zero rects, meaning even the
  `javascript_tool` DOM-dispatch fallback that worked in every prior
  session couldn't actually interact with anything (clicks/pointer events
  landed on zero-size elements and did nothing) — this is a **different,
  new failure mode** from the previously-documented "subagents can't reach
  compositing" constraint: this time the *orchestrator's own* Browser pane
  tools couldn't composite either, for the whole session, not just once
  transiently the way #25's entry noted. Surfaced to the user directly via
  `AskUserQuestion` rather than silently merging unverified or silently
  blocking — user explicitly chose to skip live verification and merge on
  `npx tsc --noEmit` (clean) + the new RLS test (6 assertions, ran clean
  against the live project) + two full code-review rounds instead. If this
  same pane-not-displayed failure recurs next session, it's worth asking
  the user directly whether something changed in their setup, rather than
  assuming it's the same transient blip #25's entry described.
  - **Design**: one nullable `lists.archived_at timestamptz` column
    (matching the `checked_at`/`deleted_at` idiom, not a status enum — per
    the user's standing schema-approach go-ahead for this batch, no
    separate approval round). Set the moment `finishShopping()` succeeds.
    Filters `ListsScreen`'s active view (#33); `archiveList()`
    (`lists.ts`) uses a conditional UPDATE (`.is('archived_at', null)`) as
    an atomic claim so concurrent `finishShopping()` calls for the same
    list can only ever have one winner (#35) — this is the real mechanism,
    not just the pre-existing UI-level double-tap guard.
    Deliberately kept out of `lists_select_visible` (would suppress the
    Realtime UPDATE event that performs the archiving — this project's
    documented Realtime-authorization trap, first flagged for
    `deleted_at`) and out of `loadLists()`'s own filtering (both
    `ShoppingScreen`'s own post-archive confirmation and
    `DashboardScreen`'s proxy fix below need to see `archivedAt` on every
    row, not have archived rows silently absent).
  - **Also fixed, flagged in triage and not silently left**:
    `DashboardScreen.tsx`'s "Continue shopping" widget relied on
    `loadInProgressListIds()`'s "has at least one unchecked item" proxy —
    a list finished with leftover unchecked items would have kept
    resurfacing there even after archiving landed. Fixed by excluding
    archived lists before computing "in progress" ids
    (`DashboardScreen.tsx`'s `listIds` memo). The proxy itself still has
    other pre-existing rough edges beyond this one, explicitly left alone.
  - **Code review (separate session) caught three real issues, all fixed
    before merge — the most significant being a genuine data-loss
    regression the Planner's own write-order trade-off introduced**:
    archive-first (needed for the #35 atomicity guarantee) meant that if
    `location_checkoffs`/`shop_sessions` failed to write *after* the
    archive claim succeeded (e.g. a transient network blip — this
    project's Supabase free tier has documented latency issues elsewhere
    in this file), the list ended up permanently archived with **no**
    history ever written, and any retry would silently show "Shop
    recorded" anyway (`archiveOutcome.value === false` reads as "already
    done", not "actually lost"). Fixed with a new compensating
    `unarchiveList()` call on that failure path, restoring the list to
    retryable rather than silently and permanently losing that shop's
    history — the fix was sent back to the *same* Code Writer session
    (context already loaded) but re-verified by the *original* separate
    Reviewer session, not a fresh one, keeping the never-self-review rule
    intact for the part that matters (nobody reviewed their own code) without
    burning a third full-context session. The other two findings (item
    checkboxes stayed interactive on an archived list in both
    `ShoppingScreen` and `ListDetailScreen`; the "Finish shopping" confirm
    dialog could get stuck open if a remote device archived the list while
    it was open) were both fixed cleanly, confirmed by the re-review.
  - **Two narrower edge cases survived the fix-and-reverify round,
    surfaced explicitly by the reviewer and knowingly accepted rather than
    engineered around further** — consistent with this project's existing
    risk tolerance for rare multi-write races (same class as the accepted
    `shop_sessions`/`location_checkoffs` write-gap risk and the location-
    correction quorum vote's race window, both already documented
    elsewhere in this file): (1) if the compensating `unarchiveList()`
    call itself *also* fails — two consecutive network failures, not one
    — the list can still end up permanently archived with no history; (2)
    a second device that loses the archive-claim race can show a stale
    "Shop recorded" message briefly if the winning device's write later
    fails and gets compensated. Neither is fixed; both are known and
    written down here rather than silently reintroduced as an unknown
    later.
  - `supabase/tests/rls_lists_archived_at.sql` (new, 6 assertions
    including a regression test that the conditional-update guard is
    atomic at the SQL level, independent of application code) — ran clean
    against the live project. No new RLS policy needed
    (`lists_update_visible` already had no per-column awareness); the
    migration only added the column plus a column-level UPDATE grant.
  - `npx tsc --noEmit` clean throughout (independently re-run by both the
    Code Writer and the Code Reviewer). `mobile/app.json`/
    `mobile/package.json` bumped to `0.0.15`.

- **2026-08-15 build session — Batch B (#36, #38) shipped and merged,
  [PR #45](https://github.com/mp3anthony/cartel/pull/45). Both issues
  auto-closed on merge. Batches C-G (below, still fully scoped from the
  prior triage) are next in the suggested order — start with Batch C.**
  Same pipeline as Batch A: Planner → Code Writer → Code Reviewer
  (separate subagent session from Code Writer, per the user's explicit
  reminder this session to never let a subagent review its own code) →
  orchestrator did live-browser verification directly (subagents still
  can't reach the Browser pane's compositing — same standing constraint
  as Batch A, held again this session, not re-tested). #36 (remove
  Household card) and #38 (Refresh affordance for Nearby stores) both
  touch only `DashboardScreen.tsx`, non-overlapping sections, so one PR
  as planned. #36 also required a two-prop call-site edit in `App.tsx`
  (`household`/`memberCount` dropped from the `<DashboardScreen>` call —
  confirmed no other screen's props touched). #38 needed zero logic
  change to `checkNearby()` itself — it already reset to `checking` as
  its first statement, so a plain "Refresh" `SecondaryButton` gated on
  `nearbyState.status` being `denied`/`error`/`found` (not `idle`/
  `checking`) was sufficient. Live-verified in the real Browser pane
  against local dev (`mobile-web`, port 8082): loaded Dashboard on a
  fresh anonymous no-household session and confirmed zero Household card
  renders; clicked "Check for nearby stores" → landed on the browser's
  standard geolocation-denied state → "Refresh" button appeared as
  expected; clicked "Refresh" → check re-ran, landed on `denied` again,
  button still present — confirms re-triggering works without leaving the
  screen. `npx tsc --noEmit` clean throughout (independently re-run by
  both the Code Writer and the Code Reviewer). `mobile/app.json`/
  `mobile/package.json` bumped to `0.0.14`.

- **2026-08-15 triage/build session — Batch A (#43, #40, #41, #37) shipped
  and merged, [PR #44](https://github.com/mp3anthony/cartel/pull/44). User
  stopped the session after Batch A on purpose ("Lets just do batch A for
  now") — Batches B through G below are fully scoped and triaged but
  **zero code written for any of them**. Start the next session by picking
  any batch below directly; the triage legwork (codebase surface, real
  dependencies, risk flags) is already done and shouldn't be re-derived.**
  - **Full formal pipeline ran for the first time with five distinct
    subagent roles** (Triage → Planner → Code Writer → Code Reviewer →
    Verifier), per the user's explicit request this session, rather than
    the orchestrator triaging directly (2026-08-14 style) or running an
    abbreviated Investigator→Planner→Code Writer chain (2026-08-15 #26
    style). One deviation, flagged in the PR body and here: **the Verifier
    step was NOT run as a separate subagent** — confirmed live that
    subagents spawned via the `Agent` tool have no actual display/
    compositing access to the Browser pane (`preview_start`/`navigate`
    succeed and `get_page_text` returns real content, but `read_page`/
    `resize_window`/screenshot report a `0x0` viewport, and the orchestrator's
    own `computer{action:"screenshot"}` call from the *main* session also
    failed once with "the Browser pane is not displayed" before working
    again — the pane's compositing appears to need to be actively displayed
    in the user's UI, which a background subagent can never trigger). The
    orchestrator did the live verification directly instead, using the real
    Browser pane tools. **This is a standing constraint for every future
    batch's Verifier stage, not a one-off** — plan for the orchestrator to
    do live-browser verification itself, not a delegated Verifier subagent,
    unless this changes.
  - **Live verification caught two real bugs Code Review's static read
    missed — both fixed before merge, both are general lessons for any
    future `App.tsx`/RN-web work, not just this batch:**
    1. `submitBehavior="submit"` (the RN prop for "don't blur on submit")
       is silently dropped by this project's react-native-web 0.21.2 —
       it's absent from that version's `TextInput` forwarded-props
       allow-list. The web build only ever consults `blurOnSubmit`. Any
       future fix in this vein needs `blurOnSubmit={false}`, not (or not
       only) `submitBehavior`.
    2. `headerBackVisible: false` on `Stack.Navigator`'s `screenOptions`
       — the standard native-stack way to hide the back chevron — **does
       nothing on the web build**. Confirmed by reading
       `@react-navigation/elements`'s `Header.js`: on web this project
       falls back to that package's plain JS `Header` component (not
       native-stack's native `ScreenStackHeaderConfig`), whose `headerLeft`
       defaults to rendering a `HeaderBackButton` whenever
       `navigation.canGoBack()` is true — `headerBackVisible` is never
       read on that path at all. The real, working fix (now shipped) is
       `headerLeft: () => null` in the same `headerOptions()` object in
       `App.tsx` — this also fully resolves #41 for every future screen
       with no further work needed. **General lesson**: any native-stack
       option whose name doesn't appear in
       `@react-navigation/elements/lib/module/Header/Header.js` is
       suspect on this project's web build — check that file, not just
       the TypeScript types, before trusting a native-stack option works
       here.
  - **Batch A testing, live-verified with real seeded data**: created one
    anonymous test household ("QA Batch A Test Household") + one personal
    list ("QA Focus Test List") via the real UI. Confirmed #43 by typing
    and submitting 3 items consecutively via a JS-dispatched real `Enter`
    `KeyboardEvent` (the Browser pane's own `computer{action:"key",
    text:"Return"}` did NOT reliably reach react-native-web's `keydown`
    handler in this environment — a new instance of this project's
    already-documented click/type-unreliability trap, worth remembering:
    dispatch a raw `KeyboardEvent('keydown', {key:'Enter', keyCode:13,
    which:13, bubbles:true})` via `javascript_tool` instead of trusting
    `computer{action:"key"}` for Enter-to-submit flows in this pane).
    Confirmed #40 via the input's literal `placeholder` attribute.
    Confirmed #41 via `document.querySelector('a[href="/"]')` returning
    `null` (zero back-link elements in the DOM) after the fix, vs. a real
    visible 30×30 chevron before it. Confirmed #37 via `v0.0.13 · Dev`
    rendering on the real (in-household) `HouseholdScreen`, not the
    no-household `HouseholdSetupScreen` (two separate components — the
    footer only lives on the former; don't confuse them when testing #37
    again). All test rows (1 anonymous user, 1 household, 1 list) queried
    and confirmed as this session's own before deletion, then deleted and
    reverified at zero. `npx tsc --noEmit` clean throughout.
    `mobile/app.json`/`mobile/package.json` bumped to `0.0.13`.

  ### Batches B–G — triaged, scoped, ready to build, nothing implemented

  Full context: a dedicated Triage subagent read all 12 issue bodies via
  `gh issue view` plus the actual codebase and proposed this batching;
  the user confirmed batching, order, and (for Batch C) the schema
  approach via `AskUserQuestion` before Batch A started. Suggested order
  is **B → C → D → E → F → G**, sequential (not parallel — avoids
  worktree/branch complexity; C should land before D/E/F since all three
  touch `ShoppingScreen.tsx`). Each batch: create a branch off `main` →
  Planner subagent → Code Writer subagent → Code Reviewer subagent
  (separate session from Code Writer) → orchestrator does live-browser
  verification itself (see constraint above, don't spawn a Verifier
  subagent expecting it to reach the Browser pane) → open PR → merge
  (user has already given standing go-ahead to merge each batch once
  verified clean, no need to re-ask per batch).

  - **Batch B — "Dashboard trims" (#36 + #38), 1 PR.** Both touch
    `DashboardScreen.tsx`, non-overlapping sections — batching is a
    convenience, not a real dependency. #36: remove the `Heading>Household
    </Heading>` card block (~lines 386-403) — already reachable via the
    nav menu, per #26's HeaderLogo/NavMenu work. #38: `nearbyState`/
    `checkNearby()` (~lines 270-343) needs a manual "Refresh" affordance
    instead of forcing a full remount to re-check nearby stores.
  - **Batch C — "Finish shopping lifecycle" (#33 + #35), 1 PR — the
    biggest/riskiest batch, Planner has the user's explicit go-ahead to
    design the schema approach without a separate approval round.**
    #33 (finished lists should leave the active Lists view) and #35 (same
    shop can be recorded to history more than once) need the *same*
    underlying signal — Triage's recommendation, grounded in the code:
    a nullable `archived_at`-style column (matching this codebase's
    existing `checked_at`/`deleted_at` idiom, never a status enum), set
    the moment `finishShopping()` succeeds, both filters `ListsScreen`'s
    active view (#33) and guards against a second `shop_sessions` write
    for an already-archived list (#35). **Real gap Planner must resolve,
    not skip**: `DashboardScreen.tsx`'s "Continue shopping" widget and
    `startOrContinueAtLocation()` both use `loadInProgressListIds()`
    (`lists.ts`), whose own doc comment defines "in progress" as "has at
    least one unchecked item" — a proxy, not real schema. Since
    `finishShopping()` only requires `checkedCount > 0` (not that
    everything is checked), a list finished with leftover unchecked items
    would still read as "in progress" under today's proxy and could
    resurface on the Dashboard even after archiving lands — Planner needs
    to either fix this proxy too or explicitly, visibly scope it out
    rather than silently leave it. Touches `ListsScreen.tsx`,
    `DashboardScreen.tsx`, `lists.ts`, `shopSessions.ts`, likely a new
    migration.
  - **Batch D — "Finish-shopping toast" (#34), 1 PR, standalone.**
    Presentational only — replace the plain `<Body>` "shop recorded" line
    in `ShoppingScreen.tsx`'s `justFinished` render with something hard to
    miss (a toast/banner; may need a new primitive in `ui.tsx`). No schema
    dependency on Batch C — sequenced after it purely to avoid two agents
    editing the same finish-shopping region of `ShoppingScreen.tsx`
    back-to-back.
  - **Batch E — "Aisle-tag affordance" (#32), 1 PR, standalone.** Make the
    bare `+` (`IconButton glyph="+"`, ~line 572 of `ShoppingScreen.tsx`,
    `tagRow`/`beginTagging`) self-explanatory — **not** removal, see the
    QA-session entry above for why. Different region of the same file as
    C/D — sequence after them, don't parallelize.
  - **Batch F — "Check-off latency" (#39), 1 PR, standalone — investigate
    before assuming the fix.** `toggle()` in `ShoppingScreen.tsx` has no
    optimistic UI by *deliberate* prior design (the screen's own header
    doc comment says so explicitly — "the UI only ever shows a checked
    state the database has already accepted"); fixing #39 properly means
    consciously overriding that decision, not patching around it.
    `useListItems.ts`'s Realtime subscription re-firing `refresh()` on the
    writer's own echo is a second contributing factor. Neither alone
    obviously explains a full ~12s stall per the issue's own text —
    Triage's recommendation: have Investigator actually check real
    round-trip time (network tab / Supabase logs) before committing to
    "add optimistic UI" as the whole fix; there may be a third factor
    (free-tier cold project, RLS cost, `ap-southeast-2` latency, or a
    connection to #42's session issues).
  - **Batch G — "JWT blank-screen recovery" (#42), 1 PR, standalone,
    parallelizable with anything.** The issue's own text admits it "isn't
    reliably reproducible" — scope is defensive recovery + logging
    (error boundary, retry, a real error state instead of a blank page) in
    `App.tsx`'s `Bootstrapped`/session gate + `supabase.ts`, **not** a
    root-cause fix. Say so explicitly if picking this up — don't imply the
    root cause was found.

- **2026-08-15 QA session — first real end-to-end shop completed post-#26
  merge; 12 issues filed ([#32](https://github.com/mp3anthony/cartel/issues/32)-[#43](https://github.com/mp3anthony/cartel/issues/43)),
  zero code changes this session.** User ran the app through a full real
  shopping trip and reported issues conversationally; used the `qa` skill
  (background Explore agent for codebase context, `AskUserQuestion` for the
  genuine design forks) rather than jumping straight to fixes. One finding
  worth knowing before touching any of these: **the "+" the user wanted
  removed from Shopping Mode turned out to be the same feature as their
  separate "no way to tag an aisle" complaint** — it's the (unlabeled)
  aisle/section-tagging trigger, not a divider; resolved as "keep the
  feature, make it self-explanatory" (#32), not removal. Route learning
  itself needs no fix — confirmed by reading `computeRouteOrder` that
  check-off order alone is the primary ordering signal; aisle tags are only
  a fallback for items never personally checked off at that location
  before.
  - **#33/#34/#35 are a deliberate 3-way breakdown of one "Finish shopping"
    complaint** (list doesn't leave the active view / confirmation message
    is too easy to miss / the same shop can be recorded to history more
    than once) — independently fixable, no blocking relationship between
    them, but #35 flags that archiving (#33) may partially-but-not-fully
    cover the duplicate-recording case, so it should still be verified and
    guarded on its own rather than assumed fixed as a side effect.
  - **All 12 issues are labeled `ready-for-agent`** — every real design fork
    (list lifecycle on finish, dashboard household card, which screen the
    "+" was on, nearby-store refresh UX) was resolved with the user via
    `AskUserQuestion` this session, so none of them need a Problem Agreement
    round before Investigator/Planner work starts.
  - **Next session should start with a dedicated triage pass across
    #32-#43** — the user explicitly asked for triage to run as its own
    subagent (separate from Planner/Code Writer/Code Reviewer), proposing
    batching/execution order before any implementation starts, rather than
    the orchestrator triaging directly the way the 2026-08-14 session did
    for #22-#26.

- **2026-08-15 build session — #26 (in-app Light/Dark/System theme toggle)
  shipped and merged, [PR #30](https://github.com/mp3anthony/cartel/pull/30)
  (user gave the explicit go-ahead this session — "merge the PR and I'll
  check it in the morning"). Closes the last item from the prior session's
  triage batch (#22-#26); nothing from that batch is outstanding anymore.**
  Ran the full formal pipeline this time (Investigator → Planner → Code
  Writer subagents, not orchestrator-direct like #22/#23/#25) — the design
  interview was already closed per the prior session's HANDOFF entry, so
  this session started straight at Investigator rather than reopening any
  design question. Full reasoning for every fork (the `Palette`/`Tokens`
  type split, why `elevation.card.shadowColor` couldn't just follow
  `textPrimary` in dark mode, why the toggle is a new `SegmentedControl`
  primitive and not three `PrimaryButton`s, the `cartel.themeMode`
  AsyncStorage key, the `NavMenu` scrim's one pre-existing hardcoded color)
  is in the PR body and `tokens.ts`/`ThemeProvider.tsx`'s own doc comments —
  not repeated here.
  - **Two things were folded into this PR mid-session at the user's direct
    request, after the mechanism (`resolvedScheme`) already existed to
    support them** — both logged in `CHANGE-LOG.md` as their own
    out-of-spec rows (status `done`, same PR) rather than silently riding
    along inside #26's own line, per Protocol Step 1:
    1. **`HeaderLogo`** (new, `mobile/src/components/HeaderLogo.tsx`) — every
       screen's header now shows the "Cartel" wordmark (reusing #25's
       `splash-icon.png`/`splash-icon-dark.png`, not a third asset pair)
       instead of the plain text screen name, swapped by `resolvedScheme`.
       Each screen's own name still sets the browser tab title via
       `options.title` (`headerTitle` only overrides what's drawn in the
       header) — confirmed `ListDetailScreen`/`ShoppingScreen`'s
       `navigation.setOptions({ title })` calls needed no change.
    2. **`mobile/public/{index.html,manifest.json,icon.png}`** — the user
       reported "Add to Home Screen" on their phone showing a plain "C"
       instead of the app icon. Root cause, confirmed by reading the
       installed `@expo/cli` source directly rather than guessing: this
       project's Expo/Metro web toolchain (SDK 57) has **no config-driven
       `apple-touch-icon` or web-manifest generation at all** — the old
       `expo-pwa`/`@expo/webpack-config`-era feature doesn't exist in the
       Metro web bundler this project uses, and favicon is the *only* image
       with special-cased handling (`web.favicon` → generated `favicon.ico`
       + an auto-injected `<link rel="icon">`). Fixed via Expo's supported
       `public/` folder override mechanism: `public/index.html` replaces the
       built-in template (confirmed via a real `npx expo export
       --platform web`, not just trusted) with two added `<link>` tags,
       `public/manifest.json` is a minimal valid Web App Manifest, and
       `public/icon.png` reuses the existing light-colorway app icon —
       deliberately one static file, not a light/dark pair, since neither
       iOS's nor Android's home-screen bookmarking has an OS-level
       dark-variant mechanism for this (same constraint #25 already
       documented for the favicon). **Caught a real bug in the first draft
       before it shipped**: the build injects the favicon `<link>` via a
       literal string-replace of the closing `</head>` tag, and my own
       explanatory comment in `public/index.html` initially spelled that
       tag out literally as an example — which hijacked the replace target
       and swallowed the favicon link into the comment instead of the real
       `<head>`. Only visible by actually running the export and reading
       the output byte-for-byte; the dev-server preview alone wouldn't have
       shown it. Fixed by rewriting the comment to never spell the tag out
       literally, with an explicit warning left in place for whoever edits
       that comment next.
  - **Live-verified with real seeded data**, not just empty states or code
    review: created one anonymous test household + one personal list + one
    item via the actual UI (browser pane), then for every theme-dependent
    checklist line —
    - **Palette actually changes everywhere, not just Household**: toggled
      Light/Dark from the `SegmentedControl`, screenshotted and/or read
      computed `background-color` on Dashboard, Lists, Locations,
      ListDetail, Shopping (blocked/no-location state), History, and the
      `NavMenu` popover+scrim, confirmed exact hex matches against both
      palettes on every one.
    - **System follows the OS scheme live, no restart**: this took real
      trial and error — the Browser pane's `resize_window` `colorScheme`
      param uses CDP media emulation, which does **not** reliably fire the
      `matchMedia` `change` event on an already-open page (confirmed by
      directly instrumenting a `MediaQueryList` listener: 0 fires across
      several attempts where only `colorScheme` changed with no
      accompanying dimension change). It genuinely doesn't work when only
      `colorScheme` changes with identical width/height — pairing it with
      an actual dimension change made it fire reliably, reproduced in both
      directions. Once past that tooling quirk, this is **directly
      confirmed working**, not inferred from source reading alone: the
      palette flipped live with zero navigation between the two states.
      Worth remembering next time live `prefers-color-scheme` emulation
      needs testing in this Browser pane — always pair a `colorScheme`
      change with a real (even 1px) dimension change, or it may silently
      no-op.
    - **Persists across restart**: set Dark, confirmed
      `localStorage['cartel.themeMode'] === 'dark'`, reloaded (this
      project's standing equivalent of "restart" on its web-only
      verification surface), confirmed the app still rendered dark and the
      stored value survived — same AsyncStorage-on-web mechanism
      `src/lib/supabase.ts`'s session persistence already relies on.
    - **Status bar line**: not verifiable on this project's web-only
      surface (no native status bar in a browser, and native has never been
      run in this project — a pre-existing, standing limitation carried
      forward from every prior slice, not new here). Code-review only.
  - All test rows (1 anonymous user, 1 household, 1 list, 1 item) queried
    and confirmed as this session's own (`is_anonymous = true`, sole
    household member) before deletion, then deleted and reverified at zero
    — same practice as every prior slice.
  - `npx tsc --noEmit` clean throughout. `mobile/app.json` and
    `mobile/package.json` bumped to `0.0.12`.
  - **Nothing left outstanding from the prior session's #22-#26 triage
    batch.** `CHANGE-LOG.md`'s three long-standing pending items (captcha on
    anonymous sign-in, orphaned households, item quantities) are still
    unscoped and still the most likely next-session starting point if
    nothing else comes up — see that file directly rather than this one for
    their current status.

- **2026-08-14 build session, ended by explicit handoff to a new session —
  #25, #22+#24, and #23 shipped and merged; #26's design is approved but
  nothing is built yet.** Worked through issues #22-#26 in the order set at
  the end of the triage session below: #25 solo first, then #22+#24
  together, then #23, then #26 last. This entry was updated pass-by-pass as
  PRs opened, not written once at the end.
  - **#25 (app icon) — done, [PR #27](https://github.com/mp3anthony/cartel/pull/27)
    merged to `main` (user gave the explicit go-ahead this session).** Recovered
    the exact approved glyph path data
    (basket, C-monogram arc, wheels, dotted route to a destination dot) from
    the prior session's published artifact, "The Cartel File", via
    `WebFetch` against its `claude.ai/code/artifact/...` URL rather than
    re-deriving the design from scratch. Rasterized the full asset set with
    `resvg-js` (not `sharp`'s bundled librsvg — its CSS support for a
    data-URI `@font-face`, the way the artifact itself embedded
    UnifrakturCook, is unreliable; `resvg-js` takes a font file directly and
    sidesteps that) + `sharp` for post-processing (alpha stripping,
    trim/pad on the wordmark lockup). UnifrakturCook fetched straight from
    Google Fonts' CSS2 API rather than extracted from the artifact's base64
    blob — same open font, simpler path to a raw TTF. Full reasoning for
    every per-asset decision (safe-zone percentages, why the adaptive-icon
    foreground/monochrome use a tighter ~50% scale than the flat iOS icon's
    ~72%, why `android-icon-background.png` became a `backgroundColor`
    value instead, the splash-screen light/dark call that wasn't explicit
    in the issue text) is in the PR body and the commit message — not
    repeated here. `npx tsc --noEmit` clean, `npx expo config` resolves
    clean, a real `npx expo export --platform web` (the actual command
    Vercel's build runs) produces a correct `favicon.ico` and `<link
    rel="icon">`. **Not verified**: the iOS light/dark icon switch and
    Android's monochrome/themed-icon rendering — this project has never run
    on a native device or simulator (standing note further down this file),
    so those two `#25` testing-checklist items stay unchecked pending a
    real device. This pass was executed directly by the orchestrator
    (asset generation, app.json wiring, verification) rather than handed
    through the formal Investigator → Planner → Code Writer subagent
    pipeline — the design-recovery step (fetching and reading the prior
    session's artifact) and the asset-generation step turned out to be the
    same continuous piece of work, and splitting it across subagent
    handoffs would have meant re-deriving the same context rather than
    saving any of it. Flagging the deviation rather than implying the
    formal pipeline ran.
  - **#22 + #24 (dashboard + global nav menu) — done, one pass, one PR
    ([PR #28](https://github.com/mp3anthony/cartel/pull/28)), merged to
    `main` (user gave the explicit go-ahead this session, same round as
    #27's).** `Lists` moved off the home route; a new `Dashboard` screen
    (`mobile/src/screens/DashboardScreen.tsx`) is home instead, in the
    issue's priority order (new list → continue shopping → store-frequency
    donut → household snapshot → recent activity). `ListsScreen`'s old
    3-button header row is gone, replaced by one hamburger wired *globally*
    in `App.tsx`'s `screenOptions` (`mobile/src/components/NavMenu.tsx`) — a
    `Modal`-based popover, not an absolutely-positioned view, since the
    header is a separate native-stack layer a screen-relative popover can't
    reliably draw over. Two new library functions carry real reasoning worth
    knowing before touching them again: `lists.ts`'s `loadInProgressListIds`
    (client-side reduction over `list_items`, not a server aggregate — "in
    progress" is still the same has-at-least-one-unchecked-item proxy the
    triage entry below already flagged as never fully re-confirmed) and
    `shopSessions.ts`'s `loadShopSessionLocationCounts` (genuinely uncapped,
    doesn't reuse `SHOP_SESSION_HISTORY_CAP`). The store chart
    (`mobile/src/components/DonutChart.tsx`, new `react-native-svg`
    dependency) is single-hue by construction — `tokens.ts` locks the app to
    one accent, so segments are tint-mixed strengths of that same accent
    rather than a conventional multi-colour pie, capped at the top 5 stores
    plus an "Other" wedge. **Live-verified with real seeded data**, not just
    empty states: inserted two locations, an in-progress list, and two
    `shop_sessions` rows via direct SQL for the local dev session's own
    anonymous test user (confirmed zero pre-existing rows for that user
    first, same practice as every prior slice), reloaded the app, and
    confirmed the chart's 50/50 split, the "Continue shopping" list, tapping
    the store *with* an in-progress list (went straight to it), and tapping
    the store *without* one (created `"QA Dashboard Test Store B — 14 Aug
    2026"`, attached the location) — then deleted all of it and re-verified
    zero rows remained. `npx tsc --noEmit` clean. **This pass was also
    executed directly by the orchestrator rather than through the formal
    Investigator → Planner → Code Writer pipeline**, same deviation and same
    reasoning as #25's entry above — flagging it again rather than letting
    one disclosure quietly cover two passes. `app.json`/`package.json`
    bumped to `0.0.10` independently of PR #27's own bump to the same
    number from the same `0.0.9` base — whichever PR merges second will hit
    a trivial one-line conflict on that field — and it resolved exactly that
    way: both branches converged on `0.0.10` independently, so the merge
    needed no manual resolution at all.
  - **#23 (dashboard nearby-store nudge + pending corrections) — done,
    [PR #29](https://github.com/mp3anthony/cartel/pull/29), open, not yet
    merged.** Branched from `main` only after #22/#24 actually landed, per
    the plan below — this pass builds real widgets into the merged
    `DashboardScreen.tsx`, not a copy on a stale branch. The issue's own
    `ready-for-human` permission-prompt question was put to the user
    directly before any code: resolved as a passive "Check for nearby
    stores" button, never an automatic check on Dashboard mount/focus —
    Home is the one screen every session hits first, so it's the one screen
    an automatic permission prompt would be a surprise on every cold open.
    Both new widgets reuse #22's own `startOrContinueAtLocation()`
    unchanged for their tap-through behaviour. The pending-corrections
    widget's real constraint: `location_item_votes` has no household/user
    column at all (global table, same as `location_items` —
    `03-SPEC.md § 0`'s location-global/household-private split), so "this
    household's" pending corrections is scoped by the caller
    (`DashboardScreen` passes the union of its own lists' and shop
    history's location ids) rather than by a query the database could
    express directly — new `loadPendingCorrectionCounts()` in
    `locationItemVotes.ts` deliberately does not filter out the one documented
    rare race `pendingCorrectionsForItemName()` already tolerates, to avoid
    pulling in a second table's worth of data for a dashboard summary
    count. **Live-verified with seeded data**, same practice as #22: a
    location, an in-progress list, and a pending-correction vote row
    inserted via SQL (test user confirmed to own nothing first), the app's
    `navigator.geolocation`/`navigator.permissions.query` mocked per this
    file's own documented web-preview trap, both widgets confirmed working
    (right distance, right count, both tap-throughs landing on the seeded
    list) — then all of it deleted and re-verified at zero. `npx tsc
    --noEmit` clean. `app.json`/`package.json` bumped to `0.0.11`. Same
    orchestrator-executed-directly deviation as the two passes above,
    flagged the same way.
  - **#26 (in-app Light/Dark/System theme toggle) — design interview held
    and the palette approved by the user ("Looks beautiful") this session;
    zero code written. This is exactly the state a fresh session should
    pick up from — start at Investigator/Planner, not at another design
    round.** Two real decisions came out of the interview, both confirmed
    with the user directly, neither re-open questions:
    - **Toggle location: the Household screen.** The issue's own suggested
      candidate — already a per-user settings-ish destination reachable
      from the nav menu, no new screen/route needed. A standalone Settings
      screen and a Dashboard control were the two alternatives offered and
      not chosen.
    - **The dark palette itself**, proposed by the orchestrator and
      approved as-is, published as
      [this artifact](https://claude.ai/code/artifact/40d91372-2d63-48e7-8044-3bb28495d809)
      (token table with measured contrast ratios + a mocked screen shown
      light vs. dark side by side — not wired into the app anywhere, a
      pure design exhibit). The exact approved values, so the next session
      doesn't have to reopen the artifact or re-derive them:
      ```
      ground:         #15110D   (locked — same as the app icon's dark ground)
      surface:        #221B15
      surfaceSunken:  #0F0C09
      border:         #3D3226
      accent:         #C9A227   (locked — same as the app icon's dark glyph)
      accentPressed:  #E6BC3A   (brightens on press, not darkens — see below)
      accentWash:     #2E2612
      accentContrast: #15110D   (NOT white — see below)
      textPrimary:    #F2E9DC
      textSecondary:  #B7A996
      positive:       #6FBE8B
      negative:       #E28577
      ```
      Every value was measured with the real WCAG relative-luminance
      formula (a Node script in this session's scratchpad, not eyeballed),
      against the same "white/ground" — here, "surface/ground" — pairing
      `tokens.ts`'s own light-palette comments already use. All clear
      4.5:1 AA comfortably; most exceed the light palette's own ratios
      (`textPrimary` hits 14.13:1/15.62:1 against light's own 15.40:1/
      14.31:1). Two things worth knowing before implementing, both already
      reasoned through and NOT open questions:
      1. **`accentContrast` is `#15110D` (a dark ink), not white.** White
         text on the gold accent measures only 2.42:1 — fails AA outright.
         Light mode never had to think about this because its accent
         (`#C2410C`) is already dark enough for white text; the dark
         accent is a *light* gold, so the button-label color has to flip
         to dark. Don't copy light mode's `accentContrast: '#FFFFFF'`
         unchanged.
      2. **`accentPressed` is brighter than `accent`, not darker** — the
         opposite direction from light mode's `accentPressed` (which is
         deliberately darker, per its own token comment). Deliberate, not
         an inconsistency: darkening an already-dark-adjacent color loses
         legibility fast, so this follows Material's own dark-theme
         convention of lightening for pressed/state-layer feedback instead
         of darkening.
    - **What's still genuinely unbuilt, for the next session's
      Investigator/Planner to scope properly**: `ThemeProvider`
      (`mobile/src/theme/ThemeProvider.tsx`) supports exactly one theme
      today and needs real Light/Dark/System selection plus persistence
      (`useColorScheme()` for System, `AsyncStorage` is already a
      dependency for this); the toggle UI itself on `HouseholdScreen`;
      `App.tsx`'s hardcoded `<StatusBar style="dark" />` needs to follow
      the active theme; and — per the issue's own testing checklist —
      every existing screen (Lists, List Detail, Shopping, Locations,
      History, Household, Dashboard, plus the two newer additions from
      this session, `DonutChart` and `NavMenu`) needs re-verifying against
      the new dark values, not just the ones written after this lands.

- **2026-08-14 triage session — app icon, global nav menu, dashboard home
  screen, and in-app theming scoped into five issues. Nothing built yet.**
  None of these are in `03-SPEC.md`'s numbered slice list (which still ends
  at Slice 9) — all five are logged in `CHANGE-LOG.md` as out-of-spec, per
  Protocol Step 1, with links to the issues below. **Next session should
  start here, not by re-reading `03-SPEC.md` for a Slice 10 that doesn't
  exist.**
  - **App icon** ([#25](https://github.com/mp3anthony/cartel/issues/25),
    `ready-for-agent`) — `mobile/assets/icon.png` and its siblings were
    still the unmodified Expo template placeholders; there was no real app
    icon going into this session. Direction was worked out interactively
    over several passes — asked the user to pick a source/scope/style
    first via `AskUserQuestion` rather than guessing, then iterated two
    SVG concept directions live as a published artifact,
    [The Cartel File](https://claude.ai/code/artifact/3e49c565-69b7-433c-be28-9dcc4edf821b),
    rather than spending an image-gen call before the user had reacted to
    anything. Landed on: a shopping-cart glyph (basket outline, two solid
    wheels, a dotted route trailing off the front — the literal "cart that
    can tell your way," a deliberate nod to Slice 7's route-learning
    feature) with a bold monogram **C** stroked inside the basket, paired
    with a "Cartel" wordmark set in UnifrakturCook (a real Google Font,
    fetched and base64'd into the artifact as a `@font-face` data URI
    rather than linked — the Artifact CSP blocks external font hosts) for
    the splash screen / marketing lockup only. **The icon itself is
    glyph-only, no wordmark** — flagged early and never revisited: app
    icons render at 40-48px on a home screen, where a spelled-out "CARTEL"
    would not survive, the same reasoning real icon design already follows
    (Instagram's camera, not the word "Instagram"). Ships as a light/dark
    pair — `#C2410C`/`#F5ECDC` light (the app's own already-locked accent),
    `#15110D`/`#C9A227` dark — but **only iOS can actually switch between
    them**, confirmed against this project's real Expo version (`~57`,
    within `ios.icon.light`/`.dark` support). Android has no OS-level dark
    variant for the primary launcher icon at all; the issue routes
    Android's dark ambition into the adaptive icon's `monochromeImage`
    layer instead (Android 13+ Material You theming — a genuinely
    different mechanism, not a two-color dark icon). Web favicon is one
    static file, light colorway, no per-theme swap available through
    Expo's static export. All three constraints are written into the
    issue itself so whoever picks it up doesn't have to re-derive them.
  - **Global navigation menu** ([#24](https://github.com/mp3anthony/cartel/issues/24),
    `ready-for-agent`, depends on #22) — replaces `ListsScreen`'s current
    3-button header row (Locations/History/Household — the only
    navigation surface in the whole app today) with a hamburger icon in
    the header on **every** screen, opening a dropdown popover
    (explicitly not a slide-out drawer — asked and confirmed) listing
    Home/Lists/Locations/History/Household. Depends on #22 because "Home"
    only means something once Dashboard exists as a route distinct from
    Lists — building this first would mean guessing at an item list
    that's about to change underneath it.
  - **Dashboard home screen**, split into two issues after the user asked
    to brainstorm "what else could go on it" and then said yes to
    everything suggested:
    - **Core** ([#22](https://github.com/mp3anthony/cartel/issues/22),
      `ready-for-agent`) — `Lists` stops being the landing screen and
      becomes its own standalone page; a new `Dashboard` screen takes over
      as home with, in priority order: new-list action, continue-shopping
      (in-progress lists across every store), a store-frequency circular
      chart, household snapshot, and a recent-activity card teasing into
      the full History screen (History is explicitly **not** folded into
      the dashboard or replaced — keeps its own page and all of Slice 9's
      copy/reuse flow; the dashboard card is a summary, asked and
      confirmed rather than assumed). Two things worth knowing before
      touching this: (1) the store chart needs a **new uncapped aggregate
      query** — `shopSessions.ts`'s existing `loadShopSessions()` is
      capped at `SHOP_SESSION_HISTORY_CAP = 10` for "pick one to copy,"
      and reusing it for lifetime percentages would silently produce
      recency-skewed numbers; (2) "continue shopping" and the chart's
      tap-to-resume shortcut both lean on a proxy that isn't real schema —
      **`ListRow` has no status field at all**, so "in-progress" is
      defined as "has at least one unchecked item," proposed by the
      orchestrator and never explicitly re-confirmed by the user once the
      conversation moved on to the icon — flagging that soft spot rather
      than letting it read as settled.
    - **Stretch** ([#23](https://github.com/mp3anthony/cartel/issues/23),
      `ready-for-human`, depends on #22) — nearby-store nudge and a
      pending-corrections-to-confirm widget, split out as a fast-follow
      rather than launch scope specifically because the nearby-nudge means
      running a location check on dashboard load, a bigger lift and its
      own permission-prompt-on-open UX question than the one-off check
      `LocationsScreen` already does. The orchestrator recommended this
      split; the user didn't explicitly weigh back in before the
      conversation moved to the logo, so it was applied as the stated
      default rather than re-asked — worth a real confirm next session.
  - **In-app Light/Dark/System theme toggle**
    ([#26](https://github.com/mp3anthony/cartel/issues/26),
    `ready-for-human`) — genuinely separate from the app icon's light/dark
    pair above, and the user needed that distinction spelled out
    explicitly: the OS is the *only* thing that ever controls which icon
    variant shows on either platform, so "let users pick light/dark
    somewhere in the app" cannot mean the icon — it can only mean the
    app's own UI palette, a real, much bigger feature. Asked the user
    directly how to size it (fold into dashboard, make it a dashboard
    prerequisite, or its own issue) rather than assuming; **own issue**
    was the explicit answer, 2026-08-14. Today there is exactly one
    palette (`mobile/src/theme/tokens.ts`, called out further down this
    file as locked and contrast-measured) and zero theme-switching
    machinery — `ThemeProvider` supports one theme only, `App.tsx`
    hardcodes `<StatusBar style="dark" />`. This one needs a real
    dark-palette design pass before Investigator/Planner touches it, the
    same way the icon needed an interactive design pass before any code —
    don't send this straight to an agent expecting it to invent a dark
    palette unsupervised.
  - **Suggested execution order**, since the user asked for a next-session
    kickoff prompt that groups what can be grouped: **#25 (icon) solo
    first** — fully self-contained, no dependency on anything else, fast.
    **#22 + #24 together** in one pass — both rewrite the same navigation
    surface (`App.tsx`'s `Stack.Navigator`/`linking` config, the header),
    so doing them as two separate PRs back to back would mean touching
    that config twice for no reason, and #24's item list is downstream of
    #22 existing anyway. **#23 after #22 lands**, on its own, given the
    `ready-for-human` location-permission-on-load question. **#26 last, as
    its own pass**, starting with a design interview (dark palette + where
    the toggle lives) before any Investigator/Planner/Code Writer work —
    not folded into the same pass as the dashboard/menu work it will
    eventually have to retrofit against.
- **Slice 9 — Shop History & List Templates is done and merged.**
  [PR #21](https://github.com/mp3anthony/cartel/pull/21) merged to `main`
  (user gave the explicit go-ahead this session), closing issue #9. Feature
  branch deleted, both locally and on origin.
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
  - **Next up: Slice 9 completes the numbered slice list in
    `03-SPEC.md`.** Re-read `03-SPEC.md § 3`/`§ 4` and
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
