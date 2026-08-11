-- Slice 7 — Route Learning & Auto-Ordering.
--
-- `public.location_checkoffs` is global and anonymous, exactly like
-- `public.location_items` (migration 20260811000000) and `public.locations`
-- (migration 20260810000005), and for the same reason: 03-SPEC.md § 0 treats
-- location data and household data as two classes that must never share an
-- access-control path. There is no household_id, no list_id, no owner_id, and
-- no creator column of any kind — a completed shop's checked-item order is a
-- fact about the *location*, never about who shopped it. This is the role
-- 03-SPEC.md § 1's aspirational `shop_sessions` sketch originally described,
-- deliberately split off it: a household-attributed shop-history table mixing
-- both classes is Slice 9's own `shop_sessions`, built there, whenever that
-- slice actually needs it — not built ahead of it here.
--
-- `item_names` is an ordered array, not a join table, because the array's own
-- element order IS the datum `computeRouteOrder`
-- (mobile/src/lib/locationCheckoffs.ts) reads — a join table would need its
-- own position column to recover an order Postgres arrays already carry for
-- free, for a table with no other reason to exist.
--
-- `on delete cascade` on `location_id` (NOT `lists.location_id`'s `on delete
-- set null`, migration 20260810000006) — matches `location_items.location_id`
-- (migration 20260811000000)'s own cascade, not `locations.created_by`'s
-- set-null. A checkoff row, like a tag, is meaningless once its location is
-- gone: its array only makes sense relative to *that* location's other shops,
-- so orphaning it would leave dead data nothing ever reads again.
--
-- No `unique` constraint, unlike `location_items`' `unique (location_id,
-- name)`. That constraint arbitrates a race for a single mutable fact — "what
-- section is this item in right now" — where two concurrent writers must not
-- both win. A checkoff row has no shared-key to race over: every completed
-- shop is its own independent historical fact, two shoppers finishing at the
-- same location around the same moment simply produce two rows, and neither
-- write ever reads shared state before writing. A bare, unconditional INSERT
-- is correct under arbitrary concurrency here.
--
-- No `deleted_at`, no update policy, no delete policy or grant — stronger
-- than `location_items`' "not built yet" stance (that table's own header
-- notes Slice 8 will add an UPDATE path for corrections). A checkoff row is
-- an immutable record of one completed shop; nothing in this slice or any
-- slice planned so far ever corrects or removes one after the fact.
--
-- No new row in `supabase_realtime`'s publication membership, matching
-- `location_items` and `locations` (only `lists`/`list_items` were ever
-- added, in migration 20260810000004). `ShoppingScreen` computes route order
-- from a fresh load via `useLocationCheckoffs`, load-on-mount, no
-- subscription — the acceptance test (03-SPEC.md § Slice 7 / issue #7) is
-- satisfied by a location accumulating history across separate completed
-- shops, never by a live push mid-shop.
--
-- No RPC for the write itself, same reasoning as 20260811000000's header:
-- "may I write this" is exactly "are you authenticated," a plain `with
-- check`, and there is no atomicity/authorization invariant beyond it. The
-- one function this migration adds (`item_names_are_normalized`, below)
-- exists only because Postgres forbids a subquery — including one only ever
-- reading the row's own column via `unnest()` — directly inside a `check`
-- expression; wrapping the per-element test in a function sidesteps that
-- restriction without touching RLS.
--
-- `item_names` elements are constrained to already be normalized
-- (`lower(btrim(...))`), mirroring `location_items.name`'s own check for the
-- same reason that migration gives: this column is a lookup key
-- `computeRouteOrder` joins against `location_items.name` and against every
-- other checkoff row's own entries, and normalization has to be enforced
-- once, at the schema, rather than trusted to every future insert to
-- remember — a silently-unnormalized entry wouldn't error, it would just
-- never match, and the item would quietly fall back to entry order forever.
-- Per-element *length* is deliberately left unbounded here (unlike
-- `location_items.name`'s `between 1 and 120`): every element already passed
-- that bound once, at `list_items.name`'s own check constraint, when it was
-- first typed in — re-bounding a value copied from an already-validated
-- column would only be defensive against Postgres itself.

create or replace function public.item_names_are_normalized(names text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from unnest(names) as raw_name
    where raw_name <> lower(btrim(raw_name))
  );
$$;

revoke execute on function public.item_names_are_normalized(text[]) from public, anon;
grant execute on function public.item_names_are_normalized(text[]) to authenticated;

create table public.location_checkoffs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  item_names text[] not null
    check (cardinality(item_names) > 0)
    check (public.item_names_are_normalized(item_names)),
  completed_at timestamptz not null default now()
);

create index location_checkoffs_location_id_idx
  on public.location_checkoffs (location_id);

alter table public.location_checkoffs enable row level security;

create policy location_checkoffs_select_all on public.location_checkoffs
  for select to authenticated
  using (true);

create policy location_checkoffs_insert_all on public.location_checkoffs
  for insert to authenticated
  with check (true);

-- No update, no delete policy or grant — see header: append-only by design,
-- not merely unfinished.

revoke all on table public.location_checkoffs from anon, authenticated;

grant select (id, location_id, item_names, completed_at) on table public.location_checkoffs to authenticated;
grant insert on table public.location_checkoffs to authenticated;
