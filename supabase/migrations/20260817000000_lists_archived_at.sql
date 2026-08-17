-- Batch C — "Finish shopping lifecycle" (#33 + #35): archiving a finished list.
--
-- Adds a single nullable `archived_at` timestamp to `lists`, set the moment
-- `finishShopping()` succeeds. This is the one signal both halves of the batch need:
-- `ListsScreen`'s active view filters it out (#33 — a finished list leaves the active
-- Lists view), and `finishShopping()` treats a successful claim of this column
-- (`archived_at` going from null to non-null) as the atomic gate that stops the same
-- shop being recorded to history more than once (#35), racing devices included.
--
-- No new RLS policy. `lists_update_visible` (migration 20260810000003) already gates
-- every UPDATE on this table by "owner or household member", evaluated via its
-- `using`/`with check` pair — that predicate has no per-column awareness, so it
-- already covers `archived_at` exactly as it covers `name`/`location_id`. The one
-- thing a policy genuinely cannot do is what the column-level grant below does
-- instead: switching a column on or off.
--
-- `archived_at` must NEVER be added to `lists_select_visible`, even for something that
-- reads like "hide archived lists at the RLS layer instead of client-side." Realtime
-- authorises each event against the subscriber's SELECT policy evaluated on the row's
-- *new* values (Slice 2/3's own already-documented trap for `deleted_at`-style
-- columns) — a policy filtering on `archived_at is null` would suppress the very
-- UPDATE that performs the archiving, so no subscriber would ever see the row flip.
-- Filtering archived lists out of the active view stays a client-side concern
-- (`ListsScreen`/`DashboardScreen`), same as every other "which lists are these"
-- proxy this codebase already carries.
--
-- No FK/cascade concerns — a plain timestamp, nothing to reference. No realtime-
-- publication change needed either: `public.lists` is already published (migration
-- 20260810000004), and publication membership tracks rows, not columns — a new
-- column on an already-published table needs nothing further to propagate.
--
-- No RPC. Same precedent as `location_id` in 20260810000006: "may I write this list"
-- is exactly `lists_update_visible`'s existing predicate, and the atomicity
-- `finishShopping()` needs (claim the archive exactly once) comes from the
-- application's own `.is('archived_at', null)` conditional UPDATE, not from anything
-- only a `security definer` function could provide — a plain conditional UPDATE is
-- already atomic at the database level.

alter table public.lists
  add column archived_at timestamptz;

-- Same reasoning as every other column-level grant in this project (see
-- 20260810000003's header): the blanket `revoke all` already ran when `lists` was
-- created, so a newly added column starts with NO privilege, not an inherited one —
-- this grant is the only thing that makes it writable at all, not an addition to an
-- already-open door.
grant update (archived_at) on table public.lists to authenticated;
