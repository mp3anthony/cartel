-- Issue #111 -- Item quantity. A list item gets a whole-number quantity, 1..99,
-- default 1, no units.
--
-- This migration is ADDITIVE and safe for the deployed 0.0.43 frontend, so it can
-- be applied before the new frontend merges (docs/lessons.md: one shared Supabase
-- project, no staging). The 0.0.43 client never names `quantity`, so its inserts
-- take the default of 1; it never reads the two new shop_sessions columns; and
-- its finish_shopping(uuid, text) call is unchanged (same signature and return
-- type). Nothing is revoked and no policy changes.
--
-- WHAT IS ADDED
--   list_items.quantity            integer not null default 1, check 1..99
--                                  (constraint list_items_quantity_range). Column
--                                  UPDATE grant to authenticated; recorded_at stays
--                                  ungranted.
--   shop_sessions.item_quantities / checked_item_quantities
--                                  Nullable int[], index-aligned with item_names /
--                                  checked_item_names (see PARALLEL ARRAYS below).
--   adjust_item_quantity(uuid, int)   Relative +/- change, one atomic statement.
--   add_list_item(uuid, text, text)   Add an item, or bump the quantity of a live
--                                     item of the same name.
--   finish_shopping(uuid, text)       REDEFINED (create or replace, same
--                                     signature) to also write the two arrays.
--
-- WHY THE TWO NEW RPCs ARE SECURITY INVOKER: RLS already says exactly who may see
-- and change an item (list_items_select_visible and list_items_update_visible
-- delegate to the parent list's visibility), and the only columns written are
-- quantity and checked_at, both column-granted to authenticated. Running as the
-- caller means the existing policies do the authorisation and there is no second
-- copy of the predicate to keep in step. recorded_at is cleared by the existing
-- BEFORE UPDATE OF checked_at trigger, which also fires for these functions.
-- finish_shopping stays security definer (it writes location_checkoffs and
-- shop_sessions, which clients cannot).
--
-- DELTAS ARE NOT IDEMPOTENT. adjust_item_quantity(+1) twice is +2, and
-- add_list_item on an existing name bumps it every call. A client must never
-- retry either one automatically after an unknown outcome (a timeout, a dropped
-- connection): the first call may have committed. Surface the failure and let the
-- person re-tap.
--
-- LOCKING. adjust_item_quantity is a single UPDATE (atomic, no lock dance).
-- add_list_item must make "does this name already exist?" and "insert it"
-- one decision, so it takes a transaction-scoped advisory lock keyed on the list
-- and the normalised name before it looks (two members adding "milk" at once
-- cannot both insert), then locks the matching item row FOR UPDATE. Lock order is
-- the item row first; the statement-level activity trigger touches the lists row
-- afterwards, which matches the item-then-list order everywhere else
-- (docs/lessons.md).
--
-- PGRST203: neither new function has an argument default, and each name has one
-- overload only.
--
-- CHECK-OFF RECORD STAYS NAMES-ONLY. location_checkoffs is untouched and still
-- receives only normalised names plus a location id (03-SPEC section 0,
-- ADR 0002). Quantity is household-private shopping detail and must never reach
-- the location-global path.
--
-- PARALLEL ARRAYS (shop_sessions). item_quantities[i] is the quantity of
-- item_names[i], and checked_item_quantities[i] of checked_item_names[i]. The
-- alignment is an invariant: the cardinalities must match, no element may be
-- null, every value is 1..99 (table checks below), and finish_shopping builds
-- each pair with the SAME filter and the SAME ordering so the positions line up.
-- Rows written before this migration have null arrays; the app reads null as
-- "all 1s". The arrays are not normalised or deduplicated, like item_names.

-- ---------------------------------------------------------------------------
-- 1. Columns, constraints and grants.
-- ---------------------------------------------------------------------------

alter table public.list_items
  add column quantity integer not null default 1
  constraint list_items_quantity_range check (quantity between 1 and 99);

alter table public.shop_sessions
  add column item_quantities integer[],
  add column checked_item_quantities integer[];

alter table public.shop_sessions
  add constraint shop_sessions_item_quantities_check check (
    item_quantities is null
    or (
      cardinality(item_quantities) = cardinality(item_names)
      and array_position(item_quantities, null::integer) is null
      and 1 <= all (item_quantities)
      and 99 >= all (item_quantities)
    )
  );

alter table public.shop_sessions
  add constraint shop_sessions_checked_item_quantities_check check (
    checked_item_quantities is null
    or (
      cardinality(checked_item_quantities) = cardinality(checked_item_names)
      and array_position(checked_item_quantities, null::integer) is null
      and 1 <= all (checked_item_quantities)
      and 99 >= all (checked_item_quantities)
    )
  );

-- recorded_at is deliberately NOT granted (server-maintained).
grant update (quantity) on table public.list_items to authenticated;

-- ---------------------------------------------------------------------------
-- 2. adjust_item_quantity(p_item_id uuid, p_delta int) returns the new quantity.
-- One atomic statement; clamps to 1..99. RLS (as the caller) decides visibility,
-- so an item the caller cannot see is simply "not found".
-- ---------------------------------------------------------------------------

create or replace function public.adjust_item_quantity(p_item_id uuid, p_delta int)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quantity int;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;

  if p_delta is null or p_delta = 0 or p_delta not between -98 and 98 then
    raise exception 'invalid_delta';
  end if;

  update public.list_items li
  set quantity = least(99, greatest(1, li.quantity + p_delta))
  where li.id = p_item_id
    and li.deleted_at is null
  returning li.quantity into v_quantity;

  if not found then
    raise exception 'item_not_found';
  end if;

  return v_quantity;
end;
$$;

revoke execute on function public.adjust_item_quantity(uuid, int) from public, anon;
grant execute on function public.adjust_item_quantity(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. add_list_item(p_list_id uuid, p_name text, p_position text).
-- If a live item with the same normalised name (lower(btrim)) exists, bump its
-- quantity by one (capped at 99), untick it (its recorded_at is cleared by the
-- checked_at trigger) and return the EXISTING item with its own spelling.
-- Otherwise insert a new item at quantity 1. `capped` is true when the item was
-- already at 99 and so did not change. Output column names are qualified
-- everywhere below because they are also plpgsql variables.
-- ---------------------------------------------------------------------------

create or replace function public.add_list_item(p_list_id uuid, p_name text, p_position text)
returns table (item_id uuid, name text, quantity int, bumped boolean, capped boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_quantity int;
  v_bumped boolean;
  v_capped boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'invalid_name';
  end if;

  -- Visible to the caller (RLS) and not removed.
  perform 1
  from public.lists l
  where l.id = p_list_id
    and l.deleted_at is null;

  if not found then
    raise exception 'list_not_found';
  end if;

  -- Serialise concurrent adds of the same name to the same list.
  perform pg_advisory_xact_lock(hashtextextended(p_list_id::text || '|' || lower(btrim(p_name)), 0));

  select li.id, li.name, li.quantity
  into v_id, v_name, v_quantity
  from public.list_items li
  where li.list_id = p_list_id
    and li.deleted_at is null
    and lower(btrim(li.name)) = lower(btrim(p_name))
  order by li.position, li.id
  limit 1
  for update;

  if found then
    v_capped := v_quantity >= 99;
    v_bumped := true;

    update public.list_items li
    set quantity = least(99, li.quantity + 1),
        checked_at = null
    where li.id = v_id
    returning li.quantity into v_quantity;
  else
    -- The bump path ignores the position, so it is validated only here.
    if p_position is null or length(p_position) = 0 then
      raise exception 'invalid_position';
    end if;

    v_capped := false;
    v_bumped := false;

    insert into public.list_items as li (list_id, name, position)
    values (p_list_id, btrim(p_name), p_position)
    returning li.id, li.name, li.quantity into v_id, v_name, v_quantity;
  end if;

  return query select v_id, v_name, v_quantity, v_bumped, v_capped;
end;
$$;

revoke execute on function public.add_list_item(uuid, text, text) from public, anon;
grant execute on function public.add_list_item(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. finish_shopping(p_list_id uuid, p_ending text): body copied from
-- 20261004000000_reusable_lists.sql section 4, plus the two quantity arrays.
-- Each quantity aggregate uses the same filter and the same order by as its
-- names aggregate, so the arrays stay index-aligned. Same signature and return
-- type, so the existing grants persist. location_checkoffs still gets names only.
-- ---------------------------------------------------------------------------

create or replace function public.finish_shopping(p_list_id uuid, p_ending text)
returns table (checked_count integer, total_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_household_id uuid;
  v_location_id uuid;
  v_round_names text[];
  v_round_quantities int[];
  v_new_names text[];
  v_new_quantities int[];
  v_new_ids uuid[];
  v_new_count int;
  v_total_count int;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  if p_ending is null or p_ending not in ('done', 'continue') then
    raise exception 'invalid_ending';
  end if;

  -- Authorisation, no lock. Same predicate as lists_update_visible, because a
  -- security definer function is not subject to RLS.
  perform 1
  from public.lists l
  where l.id = p_list_id
    and l.deleted_at is null
    and (l.owner_id = caller or l.household_id = public.current_household_id());

  if not found then
    raise exception 'list_not_found';
  end if;

  -- Items first, then the list (lock order, see header). `for update` cannot be
  -- combined with aggregates, hence the separate perform.
  perform 1
  from public.list_items li
  where li.list_id = p_list_id
    and li.deleted_at is null
  for update;

  select l.household_id, l.location_id
  into v_household_id, v_location_id
  from public.lists l
  where l.id = p_list_id
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'list_not_found';
  end if;

  if v_location_id is null then
    raise exception 'no_location';
  end if;

  select
    coalesce(array_agg(li.name order by li.position, li.id)
      filter (where not (li.checked_at is not null and li.recorded_at is not null)), '{}'),
    coalesce(array_agg(li.quantity order by li.position, li.id)
      filter (where not (li.checked_at is not null and li.recorded_at is not null)), '{}'),
    coalesce(array_agg(li.name order by li.checked_at, li.id)
      filter (where li.checked_at is not null and li.recorded_at is null), '{}'),
    coalesce(array_agg(li.quantity order by li.checked_at, li.id)
      filter (where li.checked_at is not null and li.recorded_at is null), '{}'),
    coalesce(array_agg(li.id)
      filter (where li.checked_at is not null and li.recorded_at is null), '{}'),
    count(*) filter (where li.checked_at is not null and li.recorded_at is null),
    count(*)
  into v_round_names, v_round_quantities, v_new_names, v_new_quantities,
       v_new_ids, v_new_count, v_total_count
  from public.list_items li
  where li.list_id = p_list_id
    and li.deleted_at is null;

  if v_new_count = 0 then
    raise exception 'nothing_checked';
  end if;

  insert into public.location_checkoffs (location_id, item_names)
  values (
    v_location_id,
    (select array_agg(lower(btrim(name))) from unnest(v_new_names) as name)
  );

  insert into public.shop_sessions (
    owner_id, household_id, location_id, list_id,
    item_names, checked_item_names, item_quantities, checked_item_quantities
  )
  values (
    caller, v_household_id, v_location_id, p_list_id,
    v_round_names, v_new_names, v_round_quantities, v_new_quantities
  );

  -- The list_items update fires the statement-level activity trigger, which
  -- bumps lists.last_activity_at; no explicit lists update is needed.
  if p_ending = 'done' then
    update public.list_items
    set checked_at = null, recorded_at = null
    where list_id = p_list_id
      and deleted_at is null
      and (checked_at is not null or recorded_at is not null);
  else
    update public.list_items
    set recorded_at = now()
    where id = any(v_new_ids);
  end if;

  return query select v_new_count, v_total_count;
end;
$$;
