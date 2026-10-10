-- Issue #106, Slice 3 revert. DRAFTED, NEVER APPLIED, and kept outside
-- supabase/migrations on purpose (the CLI ignores this folder). Paste it into the
-- Supabase SQL editor only if the slice 3 production run must be undone.
--
-- It undoes 20261010000000_list_items_fold.sql using the backup schema
-- migration_106 that migration created:
--   * drops the list_items_tidy_name trigger and function and the
--     list_items_live_name_key index;
--   * restores the spelling of every item the migration only re-capitalised
--     (a row renamed by a person since is left alone: the name is restored only
--     where it still equals capitalise_first(old name));
--   * restores each survivor's quantity and checked_at to the backed-up values
--     and brings the merge losers back (deleted_at cleared). This OVERWRITES
--     any quantity or tick change made to a survivor since the run, so use it
--     soon after the run;
--   * puts back the old add_list_item and finish_shopping bodies, copied
--     verbatim from 20261006000000_item_quantity.sql.
-- It does NOT restore lists.last_activity_at: the migration never changed it,
-- and restoring would undo real activity since. It leaves schema migration_106
-- in place (drop it by hand when you are sure).
--
-- DRY RUN: uncomment the cartel.dry_run line below; the run then ends with the
-- error "DRY RUN OK, rolled back" instead of committing. Dry-run it once right
-- after the real migration, so the revert is known to work before it is needed.
-- ASCII only (clipboard mangling lesson in docs/lessons.md).

begin;

-- set local cartel.dry_run = 'on';

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'migration_106')
     or to_regclass('migration_106.run') is null then
    raise exception 'FAIL: migration_106 is missing, nothing to revert from';
  end if;
end $$;

lock table public.list_items in share row exclusive mode;
lock table public.lists in share row exclusive mode;

drop trigger if exists list_items_tidy_name on public.list_items;
drop function if exists public.list_items_tidy_name();
drop index if exists public.list_items_live_name_key;

alter table public.list_items disable trigger list_items_touch_list_on_update;
alter table public.list_items disable trigger list_items_clear_recorded;

-- Spelling back, only where nobody has renamed the row since.
update public.list_items li
set name = b.name
from migration_106.list_items_before b
where li.id = b.id
  and li.name <> b.name
  and li.name = public.capitalise_first(b.name);

-- Survivors back to their pre-merge quantity and tick (recorded_at was never
-- changed).
update public.list_items li
set quantity = b.quantity,
    checked_at = b.checked_at
from migration_106.list_items_before b
where li.id = b.id
  and li.id in (select survivor_id from migration_106.list_item_merges);

-- Losers back.
update public.list_items
set deleted_at = null
where id in (select loser_id from migration_106.list_item_merges)
  and deleted_at = (select applied_at from migration_106.run);

alter table public.list_items enable trigger list_items_touch_list_on_update;
alter table public.list_items enable trigger list_items_clear_recorded;

-- ---------------------------------------------------------------------------
-- Old function bodies, verbatim from 20261006000000_item_quantity.sql.
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

revoke execute on function public.finish_shopping(uuid, text) from public, anon;
grant execute on function public.finish_shopping(uuid, text) to authenticated;

do $$
begin

  if current_setting('cartel.dry_run', true) = 'on' then
    raise exception 'DRY RUN OK, rolled back: revert would succeed';
  end if;
end $$;

commit;
