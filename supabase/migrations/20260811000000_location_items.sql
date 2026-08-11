-- Slice 6 — Crowdsourced Location Tagging.
--
-- `public.location_items` is global and anonymous, exactly like `public.locations`
-- (migration 20260810000005) and for the same reason: 03-SPEC.md § 0 treats
-- location data and household data as two classes that must never share an
-- access-control path. There is no household_id, no owner_id, and — unlike
-- `locations.created_by` — no creator column of any kind, not even one withheld
-- from the SELECT grant. Nothing in this slice, Slice 7 (route ordering reads
-- accumulated tags, never who left them), or Slice 8 (its own
-- `location_item_votes` table owns supporter-id tracking, a separate concern from
-- this one) ever reads a creator off this table. A stored-then-withheld column is
-- "we chose not to show this"; no column at all is "this was never collected" —
-- the stronger of the two claims the issue's "not attributable ... anywhere in ...
-- data" actually asks for, and this repo's stated philosophy (see HANDOFF's
-- `shop_sessions` reasoning, Slice 5) is no schema nobody reads.
--
-- `name` is the matching key: `list_items.name` as a shopper typed it, trimmed and
-- lowercased. `list_items.name` itself stays free-text and case-preserved (Slice
-- 2's choice, unchanged here) — normalization has to happen somewhere for two
-- shoppers' "Milk", "milk ", "MILK" to ever hit the same row, and it happens once,
-- here, enforced by a check constraint rather than trusted to every future insert
-- to remember. This is a stricter rule than `lists.name`/`locations.name` get
-- (which only bound trimmed *length*, not stored form — see migration
-- 20260810000003/000005) because those are display-only text; this column is a
-- lookup key whose entire job depends on two independently-normalized inputs
-- landing on the same string. `section`, by contrast, IS display-only (shown to a
-- shopper as-is), so it gets the ordinary trimmed-length check and nothing more —
-- same asymmetry as every other text column in this schema, just applied to two
-- columns with different jobs on one table.
--
-- `unique (location_id, name)` is the whole of this slice's concurrency story.
-- Two different households' shoppers can race to tag the same untagged item at
-- the same location with different section text; there is no correction/voting
-- mechanism yet (that's Slice 8's `location_item_votes`, not built here), so this
-- constraint is the only arbiter: first INSERT wins, the second fails with a
-- unique violation (23505) rather than silently overwriting the winner. The
-- client-side handling of that failure lives in `mobile/src/lib/locationItems.ts`
-- (`tagItemLocation`), not here — see that file's doc comment for why a bare
-- `INSERT` beats both `.upsert()` and an insert-then-select fallback.
--
-- No `deleted_at`. Same as `locations` (Slice 4): no removal flow is in scope for
-- this slice, so there is nothing to soft-delete. Slice 8's correction mechanism,
-- when it lands, will UPDATE this table's `section` column on an *existing* row in
-- place — this schema deliberately doesn't paint that into a corner (no
-- append-only/immutable constraint here), it just doesn't build the update path
-- yet.
--
-- No new row in `supabase_realtime`'s publication membership. `locations` itself
-- was never added to that publication either (only `lists`/`list_items` were, in
-- 20260810000004) — this isn't only `useLocations`'s hook-level choice to skip a
-- subscription, the table-level plumbing for this data class was never turned on
-- at all. Matched here for the same reason: 03-SPEC.md's acceptance test for this
-- slice reads as satisfied by a fresh load ("shopping the same location for the
-- first time"), not live mid-shop push.
--
-- No function, no RPC. Same reasoning as migration 20260810000006's header:
-- writes go direct to table under RLS `with check` unless there's a real
-- atomicity/authorization invariant RLS can't express. There isn't one here —
-- "may I insert a tag" is "are you authenticated," a plain check, and "does this
-- location exist" is exactly what the FK already enforces. The one thing that
-- looks like it needs a function — arbitrating a race — is instead handled
-- entirely by the UNIQUE constraint plus ordinary INSERT failure semantics, which
-- doesn't need RLS or a function to be involved.

create table public.location_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null
    check (length(name) between 1 and 120)
    check (name = lower(btrim(name))),
  section text not null check (length(trim(section)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

-- No separate index on location_id alone: the unique constraint above already
-- creates a composite index with location_id as its leading column, which serves
-- the "all tags for this location" query (`loadLocationItems`) exactly as well as
-- a dedicated single-column index would, for free.

alter table public.location_items enable row level security;

create policy location_items_select_all on public.location_items
  for select to authenticated
  using (true);

-- No creator-pinning check in this policy's `with check` — unlike
-- `locations_insert_own` (migration 20260810000005), there is no creator column
-- to pin, because this table doesn't have one. "May I tag an item" has no
-- predicate beyond "are you authenticated," which the `to authenticated` clause
-- already establishes.
create policy location_items_insert_all on public.location_items
  for insert to authenticated
  with check (true);

-- No update, no delete policy or grant. Slice 8 will add an UPDATE policy for its
-- correction mechanism; this slice deliberately doesn't build it early, matching
-- `locations`' own precedent of shipping with no update/delete story until a slice
-- actually needs one.

revoke all on table public.location_items from anon, authenticated;

grant select (id, location_id, name, section, created_at) on table public.location_items to authenticated;
grant insert on table public.location_items to authenticated;
