-- Slice 4 — Locations / Supermarkets.
--
-- `public.locations` is deliberately global: no household/owner predicate anywhere
-- in this table's RLS, unlike `lists`/`list_items`. 03-SPEC.md § 0 treats this as a
-- hard invariant — locations must never share an access-control path with
-- household-scoped data, because a supermarket's coordinates are not a private
-- fact about the household that visited it. Anyone authenticated may read every
-- row and insert new ones; there is no update or delete policy or grant, because
-- no edit/removal flow is in scope for this slice.
--
-- `created_by` is provenance metadata only. It is never selected back to a client
-- — the column-level SELECT grant below withholds it — so it cannot leak who
-- created a given location, while still letting the INSERT `with check` pin it to
-- the caller.

create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  -- Nullable, on delete set null (NOT lists.owner_id's cascade pattern) — a
  -- location is shared/global infrastructure; it must not disappear because its
  -- creator's (possibly anonymous, test-swept) auth.users row later does.
  -- created_by is provenance metadata only, never read back (see grants below).
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index locations_earth_idx on public.locations
  using gist (extensions.ll_to_earth(lat, lng));

alter table public.locations enable row level security;

create policy locations_select_all on public.locations
  for select to authenticated
  using (true);

create policy locations_insert_own on public.locations
  for insert to authenticated
  with check (created_by = (select auth.uid()));

-- No update, no delete policy or grant. No edit/removal flow is in scope for this
-- slice.

-- Supabase's default privileges grant ALL on new public-schema tables to anon and
-- authenticated, so without the blanket revoke the grants below would be additions
-- to an already-open door rather than the whole of the door. Same reasoning as
-- migration 20260810000003 applied to `lists`/`list_items`.
revoke all on table public.locations from anon, authenticated;

grant select (id, name, lat, lng, created_at) on table public.locations to authenticated;
grant insert on table public.locations to authenticated;

-- Nearby search. This project pins `set search_path = ''` on every function (see
-- the header of 20260810000000), so every extension call below is schema-qualified
-- against `extensions` rather than relying on search_path to find it. Parameter
-- names are prefixed (`p_lat`/`p_lng`/`p_radius_m`) to avoid ambiguity with
-- `locations.lat`/`locations.lng`.
--
-- The bounding-box containment check needs `OPERATOR(extensions.@>)`, not bare
-- `@>` — with search_path pinned to '', plain `@>` cannot be resolved at all (operator
-- names, unlike function calls, are not implicitly schema-qualifiable by writing
-- `extensions.` in front of the left-hand operand) and the migration fails to apply
-- with "operator does not exist: extensions.cube @> extensions.earth". Verified via
-- a throwaway `execute_sql` call before writing this into the migration.
--
-- No `security definer` — this function only touches columns already globally
-- SELECT-granted to `authenticated`, so invoker rights are simpler and sufficient.
create or replace function public.nearby_locations(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision
)
returns table (id uuid, name text, distance_m double precision)
language sql
stable
set search_path = ''
as $$
  select
    l.id,
    l.name,
    extensions.earth_distance(
      extensions.ll_to_earth(p_lat, p_lng),
      extensions.ll_to_earth(l.lat, l.lng)
    ) as distance_m
  from public.locations l
  where extensions.earth_box(extensions.ll_to_earth(p_lat, p_lng), p_radius_m)
          operator(extensions.@>) extensions.ll_to_earth(l.lat, l.lng)
    and extensions.earth_distance(
          extensions.ll_to_earth(p_lat, p_lng),
          extensions.ll_to_earth(l.lat, l.lng)
        ) <= p_radius_m
  order by distance_m asc;
$$;

-- A bare `create function` defaults EXECUTE to PUBLIC, which `anon` inherits — the
-- same trap 20260810000001 fixed for Slice 1's RPCs. Revoke first, then grant only
-- to `authenticated`, explicitly.
revoke execute on function public.nearby_locations(double precision, double precision, double precision) from public, anon;
grant execute on function public.nearby_locations(double precision, double precision, double precision) to authenticated;
