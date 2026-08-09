# 03-SPEC.md — Cartel

Generated from `01-CRD.md`. Sliced vertically — each slice below is a complete,
independently testable path (data + behavior + UI), not a horizontal layer. Build
order follows the numbering; a slice may assume prior slices exist, but never a
later one.

## 0. Locked Architecture Decisions

These are hard invariants per `PROTOCOL.md` Step 3 — changing any of them mid-build
is a mandatory escalation back to you, not something a subagent decides on its own.

- **Platform:** React Native (Expo, managed workflow). Chosen over a mobile-web/PWA
  shell because the CRD calls for drag-to-reorder and animated transitions as v1
  requirements — Expo gives native gesture handling (`react-native-gesture-handler`)
  and animation (`react-native-reanimated`) without a bespoke native build pipeline.
- **Backend:** Supabase (Postgres + Realtime + Auth + RLS). Chosen because the
  non-negotiables require real-time cross-household sync (not polling) and
  globally-shared, cross-household location data governed by row-level access rules
  — Postgres RLS plus Supabase Realtime covers both without a bespoke server.
- **Identity:** Anonymous auth by default (Supabase anonymous sign-in), upgradeable
  to a linked account later. No login wall before first use — matches "build a list
  throughout the week" as the first thing a user does.
- **v1 scope is supermarkets only.** No other store type, anywhere in the data model
  or UI, until a later phase.
- **Sync is real-time, not manual-refresh or eventual.** Any slice touching shared
  (household) data must use a live subscription, not a pull-to-refresh pattern.
- **Location data is global and anonymous; list data is household-private.** These
  two data classes must never share a access-control path — a bug that leaks list
  contents into the crowdsourced location layer (or vice versa) is a hard invariant
  violation, not a normal bug.

## 1. Data Model (overview)

Full column-level schema is a build-time (not spec-time) detail; this is the shape
each slice below assumes exists.

- `households`, `household_members` (user ↔ household, all members equal rank)
- `lists` (owner_id, household_id nullable — null means personal/private to owner,
  and is the *only* record of scope; `deleted_at` nullable)
- `list_items` (list_id, name, `checked_at` nullable, position, location_tag_id
  nullable, `deleted_at` nullable)
- `locations` (supermarket instances — name, lat/lng, created_by anonymized)
- `location_items` (per-location, crowdsourced: item name → shelf/section, vote
  state)
- `location_item_votes` (proposed correction → supporting user ids, until quorum)
- `shop_sessions` (completed shop record: location_id, list snapshot, checked
  order, completed_at) — feeds both history and route learning
- `list_templates` (derived view/copy of a past list or `shop_session`, not a
  distinct write path)

## 2. Vertical Slices

### Slice 0 — Project Scaffolding
**Depends on:** nothing (first slice).
**Scope:** Expo (managed workflow) app boots on iOS and Android and renders a
single placeholder screen. Supabase project exists and the client is configured
against it, with credentials supplied by environment and never committed.
Connectivity is proven by a trivial live call, not assumed from config alone. A
theme provider and design-token file exist and the placeholder screen consumes
tokens rather than hardcoded values — token *values* at this stage are provisional
(see `02-DESIGN-REFERENCE.md`; the real palette is chosen in Slice 1 against actual
screens).

Deliberately **not** in this slice: authentication of any kind (anonymous sign-in
belongs to Slice 1), any table in the data model, any navigation structure, and any
test or CI harness.

**Acceptance test:** A clean checkout with valid environment credentials boots on
both platforms and renders the placeholder screen; the live Supabase connectivity
check succeeds and fails loudly (not silently) when credentials are absent or
wrong; no secret appears anywhere in the repository.

*Why this slice exists:* Slices 1-9 are each specced as complete vertical paths,
which quietly assumes an app and a backend already exist. They don't. Rather than
inflate Slice 1 with everything that has to happen first, that setup is isolated
here — this is the one slice that is honestly horizontal, and it is the only one.

### Slice 1 — Household Identity & Pairing
**Depends on:** Slice 0.
**Scope:** App opens straight into anonymous session (no signup screen). User can
create a household, and generates an invite code another user redeems to join the
same household. All members of a household are equal rank — no owner/admin
distinction anywhere in permissions.
**Acceptance test:** Two separate devices/sessions, one creates a household and
shares an invite code, the second redeems it, both now see themselves as members of
the same household with identical permissions.

*Agreed 2026-08-10, at Protocol Step 2 — none of this was settled by the CRD, and
each one shapes the schema:*
- **One household per user.** Matches the CRD's framing of a household as a couple.
  Redeeming a second invite is not a silent join — it is an explicit move, or it
  fails. Chosen over multi-household because every list query and RLS policy in
  slices 2, 3 and 9 would otherwise need a "which household am I acting as" concept.
- **A household is optional.** The app is fully usable solo; personal lists work
  with no household at all. Slice 2 already allows a null `household_id`, so
  requiring one here would contradict it and put a wall in front of the CRD's first
  flow. Household creation is a deliberate action taken when sharing is wanted.
- **Invite codes are single-use and expire.** A leaked or screenshotted code must
  not quietly admit a stranger to a household weeks later. The cost is one
  "generate a new code" action per person invited, which is accepted.
- **Session persistence is Slice 1 scope**, though the issue does not say so. Slice 0
  deliberately left `persistSession: false` because it had no storage adapter and no
  auth. Without one, every restart mints a fresh anonymous user and the household is
  lost — which would make this slice's acceptance test pass and the feature useless.

### Slice 2 — Lists & Items (single-user)
**Depends on:** Slice 1 (a list belongs to a user and optionally a household).
**Scope:** Create a list, mark it personal or household, add/edit/remove/check-off
items, freeform order (no route logic yet — this slice is plain CRUD). Personal
lists are visible only to their owner even inside a household.
**Acceptance test:** A user builds a list across multiple sessions (items added,
none removed by app restart), a personal list is invisible to a second household
member, a household list is visible to them (sync arrives in Slice 3 — visibility
after manual reload is enough to pass this slice). A user who has never joined a
household can build a personal list, and two such users cannot see each other's.

*Agreed 2026-08-10, at Protocol Step 2 — the issue was labelled "no open questions"
and had nine. Each of these shapes the schema or the acceptance test:*

- **Scope is `household_id` alone; there is no `type` column.** § 1 above lists both,
  which is one fact stored twice with two of its four states invalid. Nothing reads
  the second copy. The inverse (keep `type`, always store `household_id`) is
  unavailable, because a user with no household has no id to store.
- **The read policy compares with `=`, never `is not distinct from`.** For a user
  with no household `current_household_id()` is null, so `household_id = null` is
  null → false and personal lists match on ownership alone. Written with
  `is not distinct from`, `null = null` is *true* and every householdless user sees
  every other householdless user's lists. Same class as the § 0 invariant Slice 1
  guarded, so it gets a policy test rather than a comment.
- **A minimal policy-test harness is built in this slice** to make the line above
  true. Slice 0 deferred all test infrastructure and no later slice picks it up, so
  the promise of a test would otherwise cash out as a comment — on the one decision
  we called invariant-class. Scope is deliberately narrow: SQL-level assertions
  about RLS policies only (two householdless users cannot see each other; a
  non-member cannot see a household list), not app or component tests.
- **Personal → household is allowed; household → personal is not.** Slice 1 made
  households optional and created later, so fixing scope at creation would strand
  every list built before pairing. Demotion is the opposite: it removes a list from
  people who added items to it, which under Slice 3 is a list vanishing off someone's
  screen live. The want behind it is *copy*, which Slice 9 already builds.
  Promotion is one-way, publishes existing item text, and is confirmed before it runs.
- **`position` is manual order only. Slice 7 never writes it.** Route order is a
  property of list × location, computed as a sort at read time. Persisting it would
  rewrite every row on arrival at a shop, broadcast that rewrite to the whole
  household through Slice 3, and destroy the user's own order permanently.
- **Order is a fractional base-62 key, sorted `order by position, id`.** A move
  writes exactly one row and subdivision never exhausts, so no renumbering path
  exists. Contiguous integers make a move an N-row rewrite that races whole-list
  against whole-list under Slice 3; sparse integers and float midpoints only make
  that rare, and Slice 1 already rejected "rare" when it retried invite-code
  collisions. Two members moving into the same slot can compute the same key —
  `id` breaks the tie identically on every device. That also makes the append
  read-then-write race benign.
- **The `position` column is declared `collate "C"`.** Base-62 keys sort correctly
  only under byte order. This database is `en_US.UTF-8` under the ICU provider,
  where `'a1' < 'A1'` is *true* and byte order says the opposite — measured, not
  assumed. Left to the default collation the ordering is silently wrong, and only
  once mixed-case keys exist, which is around the sixty-third insert into one list.
  The key generator and the column must agree on collation or neither is correct.
- **Key generation is the `fractional-indexing` package, not hand-rolled.** CC0,
  zero dependencies. It already handles the cases a 50-line version gets subtly
  wrong — prepending with no lower bound, appending without unbounded string
  growth, subdividing adjacent keys, and the trailing-zero invariant that keeps
  value and string representation one-to-one. Its failure mode is not a crash but
  items quietly out of order weeks later on a shared list, which is the worst kind
  of thing to own untested. **`digits` is never passed to `generateKeyBetween`,
  anywhere, permanently.** Calling it with no third argument is not "base-62 by
  default" as loosely stated elsewhere — the package's *value* digits default to
  base 62, but its *integer-head* alphabet (`intDigits`) defaults to base 52 only
  when `digits` is omitted, and to a different, self-headed base-62 scheme when
  `digits` is passed explicitly. The two are incompatible keyspaces. Whichever one
  a first insert uses is the stored-data format forever; the only safe rule is
  "never pass it," not "pass base 62," because the obvious-looking fix corrupts
  every existing key's ordering against new ones.
- **New items append to the end, and check-off never writes `position`.** One
  gesture, one fact. Checked items stay where they are; grouping them is a UI concern.
- **Removal is a soft delete on both `lists` and `list_items`.** Supabase does not
  apply RLS to `DELETE` statements ("there is no way for Postgres to verify that a
  user has access to a deleted record"), so a hard delete broadcasts to every
  subscriber of the table regardless of household. Only primary keys travel, but § 0
  makes list data household-private a hard invariant, so that is not a judgement call
  to make quietly. Soft delete makes removal an `UPDATE`, which *is* filtered — and
  additionally gives Slice 3 one mechanism instead of two, makes undo possible, and
  keeps Slice 9's history resolvable. Hard-deleting a list would cascade into exactly
  the `list_items` delete storm this avoids.
- **`deleted_at` is filtered in the client query, never in the RLS policy.** Realtime
  authorises each event against the subscriber's SELECT policy evaluated on the *new*
  row. A policy saying `deleted_at is null` would therefore filter out the very
  UPDATE that sets it, the deletion would never reach other members, and soft delete
  would have bought nothing — the same failure it was adopted to prevent, one layer
  along. Filtering client-side is also correct whichever way that Realtime behaviour
  turns out to go: Supabase documents the DELETE gap verbatim but never states the
  UPDATE case, and confirming it needs two live subscribers, which is Slice 3's work.
  The accepted consequence is that soft-deleted rows stay *readable* by household
  members. That is still household-scoped so § 0 holds, but "deleted" here means
  hidden by the client, which is a weaker claim than the word suggests.
- **Writes go direct to table under RLS `with check`; only promote-to-household is an
  RPC.** This deviates from Slice 1's write-through-RPC split deliberately. That
  split exists for invariants RLS cannot express atomically, and Slice 2 has none —
  "you may only write a list you can see" and "you may only create a household list
  in *your* household" are both plain check expressions. Promotion has real
  conditions (owner only, own household only, must be a member) and keeps its RPC.
- **`checked_at timestamptz null` replaces the `checked` boolean** listed in § 1.
  Strictly more information for one column; storing both would repeat the mistake
  the first decision above corrects.
- **Reorder ships as a plain control (move up/down), not a drag gesture.** The
  fractional-key decision still gets exercised and tested. Real drag needs
  `react-native-gesture-handler` and `react-native-reanimated`, neither installed,
  and it is the first gesture code in a project where native has never been run and
  where web drag is a different input model. Polished drag lands where it can be
  verified on a device.
- **Item quantities are out of spec and stay out.** `list_items` has no quantity
  field and the CRD never asks for one. Logged in `CHANGE-LOG.md` as pending.
- **A navigation library is adopted before any feature work in this slice** — see
  the note below.

*Navigation, revisited at Protocol Step 2 as planned:* Slice 1's branches were
states (booting, signed out, in a household, not). Slice 2 adds a list index and a
list detail, and detail is the first screen taking a parameter and the first with a
real back relationship — places, not states. Hand-rolling that is genuinely small,
but on web it means no URL, and the Vercel link is the agreed review surface: a
tester in a list detail presses browser Back and falls out of the app. Android's
hardware back does the same. Slices 4, 5 and 9 each add screens, so the refactor
only gets more expensive and would otherwise land tangled in Slice 5's acceptance
test. React Navigation (`native-stack`) is chosen over Expo Router because Expo
Router would move the entry point and change `vercel.json`'s output config, which is
a large blast radius on a working deploy. It lands as its own commit before any
feature work, so a web-export break on Expo 57 / RN 0.86 / React 19.2 is isolated
and revertable.

### Slice 3 — Real-Time Household Sync
**Depends on:** Slice 2.
**Scope:** Household list changes (add/edit/check/reorder/remove) propagate live to
every other household member's open session, no refresh action required.
**Acceptance test:** Two household members have the same household list open
simultaneously; an edit on one device appears on the other within a few seconds
with no manual refresh. Personal lists are confirmed to never propagate to anyone
but their owner.

### Slice 4 — Locations (Supermarkets)
**Depends on:** Slice 1.
**Scope:** User creates a location (e.g. "Papanui PakNSave"); app requests location
permission and geotags it on creation. Creating a new location checks existing ones
within ~100-150m and prompts to confirm/merge into the existing one instead of
duplicating. If permission is denied, fall back to manual search/select from
existing locations by name.
**Acceptance test:** Creating a location within the merge radius of an existing one
prompts to merge rather than silently duplicating; denying location permission
still allows attaching a list to an existing location via manual search.

### Slice 5 — Shopping Mode
**Depends on:** Slice 2, Slice 4.
**Scope:** Attach a list to a location and enter a shopping view: items ticked off
one at a time while walking the store. No ordering logic yet — this slice proves
the shop-in-progress flow (list ↔ location association, live check-off) end to end.
**Acceptance test:** A list attached to a location can be opened in shopping mode,
items checked off persist immediately, and the session can be closed/resumed
without losing check-off state.

### Slice 6 — Crowdsourced Location Tagging
**Depends on:** Slice 5.
**Scope:** While shopping, a user can tag an item with its shelf/section at the
current location if it isn't tagged yet. Tags are anonymous (not attributable to
the contributing user) and attach to the location, not the household — any other
household shopping there sees the same tag immediately.
**Acceptance test:** User A tags an item's location during a shop; a completely
unrelated household (no shared membership with A) shopping the same location for
the first time sees that tag on their own list.

### Slice 7 — Route Learning & Auto-Ordering
**Depends on:** Slice 6.
**Scope:** New lists opened at a location are ordered using that location's
accumulated item-location tags and observed check-off order from prior shops
(`shop_sessions`). Ordering quality is expected to improve as a location accumulates
more tags/history — no fixed accuracy target, but the ordering must visibly change
(not stay randomized) once meaningful data exists for that location.
**Acceptance test:** A location with zero prior data orders a new list in
entry/arbitrary order; the same location after several shops with location tags
present produces a stable, repeatable non-arbitrary order for the same item set.

### Slice 8 — Location Correction Voting
**Depends on:** Slice 6.
**Scope:** A user can propose a correction to an existing item-location tag (item
moved shelves). The correction does not take effect until a second, independent
user also confirms it at that location — single-user edits stay pending.
**Acceptance test:** User A proposes a correction; the tag other users see is
unchanged. User B (different household) confirms the same correction; the tag now
reflects the new location for all users at that location.

### Slice 9 — Shop History & List Templates
**Depends on:** Slice 5.
**Scope:** Household can view its last 5-10 completed shops. Any past or current
list (own history or an existing list) can be used as the starting point for a new
list (copy items in, do not mutate the source).
**Acceptance test:** After completing several shops, the household sees a bounded
history (oldest beyond the cap drops off), and starting a new list "from" a past one
produces an editable copy without altering the original.

## 3. Explicitly Deferred (not this build)

- Non-supermarket store types.
- Any official supermarket API/directory integration — locations stay entirely
  user-created.
- Offline mode (viewing/ticking without connectivity, sync-on-reconnect) — lined up
  for a later phase per the CRD, not part of any slice above.

## 4. Definition of Done (whole build)

Matches the CRD verbatim: a household can shop at a supermarket using a shared list
without missing items, with real-time updates across household members, and the
list reflects a learned route for that location. Slices 1-7 are the minimum path to
this; 8-9 round out the non-negotiables (correction integrity, history/templates).
