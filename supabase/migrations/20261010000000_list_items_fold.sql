-- Issue #106 -- Slice 3 (Migration B, list side). One item per fold key per list.
--
-- THIS IS A PRODUCTION MIGRATION AND IS APPLIED BY HAND by Ant in the Supabase SQL
-- editor (project chacavfoewyiwrfgvxtj), not by CI. Runbook, in order:
--   PRE-1..PRE-4 (supabase/checks/106_slice3_preflight_and_postflight.sql), then a
--   DRY RUN of this file (uncomment the cartel.dry_run line right after `begin`;
--   the run must end with the error "DRY RUN OK, rolled back"), then the REAL RUN
--   (the same file with that line left commented), then POST-1 and POST-2, then
--   the iPhone checklist. Only apply once the Live footer shows 0.0.53 or higher.
-- The file is ASCII only on purpose: raw non-ASCII text is mangled by some
-- clipboard routes (docs/lessons.md). It calls public.fold_item_name and
-- public.capitalise_first from Migration A (20261008000000_item_name_fold.sql)
-- but never redefines them.
--
-- WHAT THIS DOES (all in one transaction; any failure rolls everything back)
--   1  Backs up the live list_items rows, every lists.last_activity_at and a
--      merge log into a new schema migration_106 (no access for API roles;
--      keep it 30 days after Migration C2, then drop it; decision D8).
--   2  Capitalises every live item name (capitalise_first).
--   3  Merges live rows that share a (list_id, fold_item_name(name)) key. The
--      survivor is the oldest row by (created_at, id); it keeps its id, position
--      and spelling. Its quantity becomes least(99, sum of the group). It is
--      ticked if ANY copy was ticked (earliest tick time) and keeps its own
--      recorded_at (D9 rule a). Losers are soft-deleted (deleted_at = the run
--      time). Items on removed lists are merged too (D7).
--   4  Creates the unique partial index list_items_live_name_key on
--      (list_id, fold_item_name(name)) where deleted_at is null.
--   5  Adds the BEFORE INSERT OR UPDATE OF name trigger list_items_tidy_name:
--      capitalises the stored name and refuses a name whose fold is empty.
--   6  Redefines add_list_item (fold-aware match) and finish_shopping (the
--      check-off array is the fold of each ticked name).
-- last_activity_at is NOT changed: the two activity triggers are paused around
-- the data changes and re-enabled before commit, and a post-check proves every
-- list kept its old value. Nothing references list_items.id (shop history holds
-- name arrays; votes and check-offs are location side, Migrations C1/C2), so
-- soft-deleting the losers orphans nothing.
--
-- NO RLS, POLICY OR GRANT CHANGE on any public table. The new schema is closed
-- to anon and authenticated.
--
-- OLD CLIENTS (D10): a cached pre-0.0.52 client that renames an item onto an
-- existing name, or copies a list into one that already has that item, gets the
-- raw Postgres unique-violation text once instead of the friendly note. The new
-- client already refuses these (slice 2b).
--
-- KNOWN GAP: add_list_item serialises concurrent adds with an advisory lock, but
-- a direct rename that lands between its select and its insert can still raise
-- 23505; the client shows "That item is already on this list.".
--
-- ICU upper() can lengthen a name (the sharp s becomes SS), so a 120-character
-- name starting with it can fail the 1..120 check as a raw 23514 after the
-- trigger capitalises it. PRE-1 asserts no existing row is affected.
--
-- After a Postgres MAJOR upgrade, `reindex index public.list_items_live_name_key`
-- and re-run scripts/check-item-name-parity.mjs (the fold is IMMUTABLE only as
-- far as the Unicode tables of the running server).

begin;

-- DRY RUN: uncomment the next line to run everything and roll back at the end.
-- set local cartel.dry_run = 'on';

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 0. Guards.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.fold_item_name(text)') is null
     or to_regprocedure('public.capitalise_first(text)') is null then
    raise exception 'FAIL: public.fold_item_name(text) or public.capitalise_first(text) is missing; apply 20261008000000_item_name_fold.sql (slice 1) first';
  end if;

  if exists (select 1 from pg_namespace where nspname = 'migration_106') then
    raise exception 'FAIL: migration_106 already applied (schema migration_106 exists)';
  end if;

  if to_regclass('public.list_items_live_name_key') is not null then
    raise exception 'FAIL: migration_106 already applied (index list_items_live_name_key exists)';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.list_items'::regclass
      and tgname = 'list_items_tidy_name'
      and not tgisinternal
  ) then
    raise exception 'FAIL: migration_106 already applied (trigger list_items_tidy_name exists)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Locks. Items first, then lists (the lock order used everywhere else).
-- Reads continue; writes to either table wait (or hit the 5s lock_timeout, in
-- which case nothing has changed: just run it again).
-- ---------------------------------------------------------------------------

lock table public.list_items in share row exclusive mode;
lock table public.lists in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 2. Backup schema. Closed to every API role.
-- ---------------------------------------------------------------------------

create schema migration_106;

create table migration_106.run (
  applied_at timestamptz not null
);
insert into migration_106.run (applied_at) values (now());

create table migration_106.list_items_before as
  select * from public.list_items where deleted_at is null;
alter table migration_106.list_items_before add primary key (id);

create table migration_106.lists_activity_before as
  select id, last_activity_at from public.lists;
alter table migration_106.lists_activity_before add primary key (id);

create table migration_106.list_item_merges (
  loser_id uuid primary key,
  survivor_id uuid not null,
  list_id uuid not null,
  fold_key text not null
);

revoke all on schema migration_106 from public, anon, authenticated;
revoke all on all tables in schema migration_106 from public, anon, authenticated;
alter table migration_106.run enable row level security;
alter table migration_106.list_items_before enable row level security;
alter table migration_106.lists_activity_before enable row level security;
alter table migration_106.list_item_merges enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Pause the two triggers that would otherwise bump lists.last_activity_at
-- (list_items_touch_list_on_update) or clear recorded_at on a changed tick
-- (list_items_clear_recorded). Both are re-enabled in step 10.
-- ---------------------------------------------------------------------------

alter table public.list_items disable trigger list_items_touch_list_on_update;
alter table public.list_items disable trigger list_items_clear_recorded;

-- ---------------------------------------------------------------------------
-- 4. Capitalise every live name.
-- ---------------------------------------------------------------------------

update public.list_items
set name = public.capitalise_first(name)
where deleted_at is null
  and name <> public.capitalise_first(name);

-- ---------------------------------------------------------------------------
-- 5. Merge live rows that share a fold key within a list. Survivor = oldest by
-- (created_at, id).
-- ---------------------------------------------------------------------------

insert into migration_106.list_item_merges (loser_id, survivor_id, list_id, fold_key)
select r.id, r.survivor_id, r.list_id, r.f
from (
  select li.id,
         li.list_id,
         public.fold_item_name(li.name) as f,
         row_number() over w as rn,
         first_value(li.id) over w as survivor_id
  from public.list_items li
  where li.deleted_at is null
  window w as (
    partition by li.list_id, public.fold_item_name(li.name)
    order by li.created_at, li.id
  )
) r
where r.rn > 1;

-- Survivors absorb the losers: summed quantity (capped), ticked if any copy was
-- ticked (earliest tick), recorded_at untouched.
update public.list_items s
set quantity = least(99, s.quantity + g.qty)::int,
    checked_at = coalesce(s.checked_at, g.first_tick)
from (
  select m.survivor_id,
         sum(l.quantity) as qty,
         min(l.checked_at) as first_tick
  from migration_106.list_item_merges m
  join public.list_items l on l.id = m.loser_id
  group by m.survivor_id
) g
where s.id = g.survivor_id;

update public.list_items
set deleted_at = (select applied_at from migration_106.run)
where id in (select loser_id from migration_106.list_item_merges);

-- ---------------------------------------------------------------------------
-- 6. The index. Exactly this name: the client recognises the 23505 by it.
-- ---------------------------------------------------------------------------

create unique index list_items_live_name_key
  on public.list_items (list_id, public.fold_item_name(name))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 7. Tidy trigger: the stored spelling is always capitalise_first(name), and a
-- name whose fold is empty (only combining marks, say) is refused.
-- ---------------------------------------------------------------------------

create function public.list_items_tidy_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := public.capitalise_first(new.name);
  if public.fold_item_name(new.name) = '' then
    raise exception 'invalid_name';
  end if;
  return new;
end;
$$;

create trigger list_items_tidy_name
  before insert or update of name on public.list_items
  for each row
  execute function public.list_items_tidy_name();

revoke execute on function public.list_items_tidy_name() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. add_list_item(p_list_id uuid, p_name text, p_position text): body from
-- 20261006000000_item_quantity.sql section 3, with the match and the advisory
-- lock keyed on fold_item_name instead of lower(btrim), and an empty-fold name
-- refused. The insert still passes btrim(p_name); the tidy trigger capitalises
-- it and `returning` hands back the stored spelling.
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
  v_key text;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'invalid_name';
  end if;

  v_key := public.fold_item_name(p_name);
  if v_key = '' then
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
  perform pg_advisory_xact_lock(hashtextextended(p_list_id::text || '|' || v_key, 0));

  select li.id, li.name, li.quantity
  into v_id, v_name, v_quantity
  from public.list_items li
  where li.list_id = p_list_id
    and li.deleted_at is null
    and public.fold_item_name(li.name) = v_key
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
-- 9. finish_shopping(p_list_id uuid, p_ending text): body copied verbatim from
-- 20261006000000_item_quantity.sql section 4. The ONE change: the check-off
-- array is lower(btrim(fold_item_name(name))), the fold of each ticked name
-- (location_checkoffs.item_names must satisfy item_names_are_normalized, and
-- lower(btrim(fold(x))) = fold(x) is asserted in item_name_fold.sql). The
-- shop_sessions arrays keep the names as stored.
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
    (select array_agg(lower(btrim(public.fold_item_name(n.item)))) from unnest(v_new_names) as n(item))
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

-- ---------------------------------------------------------------------------
-- 10. Re-enable the paused triggers.
-- ---------------------------------------------------------------------------

alter table public.list_items enable trigger list_items_touch_list_on_update;
alter table public.list_items enable trigger list_items_clear_recorded;

-- ---------------------------------------------------------------------------
-- 11. Post-assertions. Any FAIL rolls the whole migration back. On a dry run
-- (cartel.dry_run = 'on') the last act is a deliberate error that also rolls
-- back and carries a JSON summary to read.
-- ---------------------------------------------------------------------------

do $$
declare
  v_applied timestamptz := (select applied_at from migration_106.run);
  v_before bigint := (select count(*) from migration_106.list_items_before);
  v_merges bigint := (select count(*) from migration_106.list_item_merges);
  v_after bigint := (select count(*) from public.list_items where deleted_at is null);
  v_summary text;
begin
  if exists (
    select 1 from public.list_items
    where deleted_at is null
      and (public.fold_item_name(name) = '' or name <> public.capitalise_first(name))
  ) then
    raise exception 'FAIL: a live item has an empty fold or is not capitalised';
  end if;

  if exists (
    select 1 from public.list_items
    where deleted_at is null
    group by list_id, public.fold_item_name(name)
    having count(*) > 1
  ) then
    raise exception 'FAIL: two live items on one list still share a fold key';
  end if;

  if v_after <> v_before - v_merges then
    raise exception 'FAIL: live count % is not backup count % minus merges %', v_after, v_before, v_merges;
  end if;

  if exists (
    select 1
    from migration_106.list_item_merges m
    join public.list_items l on l.id = m.loser_id
    where l.deleted_at is distinct from v_applied
  ) then
    raise exception 'FAIL: a merge loser is not soft-deleted at the run time';
  end if;

  if exists (
    select 1
    from migration_106.list_item_merges m
    join public.list_items s on s.id = m.survivor_id
    where s.deleted_at is not null
  ) then
    raise exception 'FAIL: a merge survivor is not live';
  end if;

  if exists (
    select 1
    from migration_106.lists_activity_before b
    join public.lists l on l.id = b.id
    where l.last_activity_at is distinct from b.last_activity_at
  ) then
    raise exception 'FAIL: a list last_activity_at changed';
  end if;

  if exists (
    select 1
    from migration_106.list_items_before b
    join public.list_items l on l.id = b.id
    where l.recorded_at is distinct from b.recorded_at
       or l.position is distinct from b.position
       or l.list_id is distinct from b.list_id
       or l.created_at is distinct from b.created_at
  ) then
    raise exception 'FAIL: a backed-up item changed recorded_at, position, list or created_at';
  end if;

  -- Survivor quantity = least(99, own + losers); ticked if any copy ticked.
  if exists (
    select 1
    from (select distinct survivor_id from migration_106.list_item_merges) sv
    join migration_106.list_items_before sb on sb.id = sv.survivor_id
    join public.list_items s on s.id = sv.survivor_id
    where s.quantity <> least(99, sb.quantity + coalesce((
            select sum(lb.quantity)
            from migration_106.list_item_merges m2
            join migration_106.list_items_before lb on lb.id = m2.loser_id
            where m2.survivor_id = sv.survivor_id), 0))
       or (s.checked_at is null and (sb.checked_at is not null or exists (
            select 1
            from migration_106.list_item_merges m3
            join migration_106.list_items_before lb2 on lb2.id = m3.loser_id
            where m3.survivor_id = sv.survivor_id and lb2.checked_at is not null)))
  ) then
    raise exception 'FAIL: a survivor has the wrong quantity or lost a tick';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.list_items'::regclass
      and not tgisinternal
      and tgenabled <> 'O'
  ) then
    raise exception 'FAIL: a trigger on list_items is not enabled';
  end if;

  if has_schema_privilege('anon', 'migration_106', 'usage')
     or has_schema_privilege('authenticated', 'migration_106', 'usage') then
    raise exception 'FAIL: anon or authenticated can use schema migration_106';
  end if;

  select json_build_object(
    'live_before', v_before,
    'live_after', v_after,
    'merged_away', v_merges,
    'renamed', (
      select count(*)
      from migration_106.list_items_before b
      join public.list_items l on l.id = b.id
      where l.name <> b.name
    ),
    'lists_with_merges', (select count(distinct list_id) from migration_106.list_item_merges)
  )::text into v_summary;

  if current_setting('cartel.dry_run', true) = 'on' then
    raise exception 'DRY RUN OK, rolled back: %', v_summary;
  end if;
end $$;

commit;
