-- Slice 5 — Shopping Mode: list ↔ location attachment.
--
-- Adds a single nullable FK from `lists` to `locations` so a list can be attached to
-- (and, by writing null, detached from) the supermarket it is shopped at. This is
-- deliberately the whole of this slice's schema change — no `shop_sessions` table,
-- no session-state column anywhere. The acceptance test only asks that check-off
-- state survive closing and reopening Shopping Mode, and that state already lives on
-- `list_items.checked_at` (Slice 2) and already persists: `useListItems` reloads
-- from the database on every mount, so "close and resume" falls out of existing
-- behaviour once a list can point at a location at all. A `shop_sessions` table is
-- real, later scope (03-SPEC.md § 1, § Slice 9 "feeds both history and route
-- learning") — building it now would be schema nobody reads yet.
--
-- `on delete set null`, not cascade: `locations` is shared/global infrastructure
-- (03-SPEC.md § 0) that must not carry knowledge of who has a list pointed at it, and
-- a location disappearing (no delete path exists yet, but one might later) must not
-- take a household's list down with it. Mirrors `locations.created_by`'s own
-- `on delete set null` in migration 20260810000005, for the same reason.
--
-- No new RLS policy. `lists_update_visible` (migration 20260810000003) already gates
-- every UPDATE on this table by "owner or household member", evaluated via its
-- `using`/`with check` pair — that predicate has no per-column awareness, so it
-- already covers `location_id` exactly as it covers `name`. The one thing a policy
-- genuinely cannot do is what the column-level grant below does instead: switching a
-- column on or off. This migration deliberately does NOT touch `lists_update_visible`.
--
-- No RPC. Per 03-SPEC.md's Slice 2 precedent (restated in HANDOFF.md): a plain
-- column UPDATE gets an RPC only when there's a real atomicity/authorization
-- invariant RLS can't express in a `with check`. Attaching a location has none —
-- "may I write this list" is exactly the existing row-level predicate, and "does
-- this location exist" is exactly what the FK constraint below already enforces (an
-- attach to a nonexistent location id fails with a foreign-key violation, not a
-- silent write). Any household member may attach/change/remove a location the same
-- way any of them may check off an item — 03-SPEC.md's "all members equal rank"
-- applies here with no special-casing to the list owner.

alter table public.lists
  add column location_id uuid references public.locations (id) on delete set null;

-- Same reasoning as every other column-level grant in this project (see
-- 20260810000003's header): the blanket `revoke all` already ran when `lists` was
-- created, so a newly added column starts with NO privilege, not an inherited one —
-- this grant is the only thing that makes it writable at all, not an addition to an
-- already-open door.
grant update (location_id) on table public.lists to authenticated;
