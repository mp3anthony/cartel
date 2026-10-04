-- Issue #89 -- Reusable lists (STOP-A). Lists are no longer archived by a full
-- finish: a finished list is unticked ("Done") or kept ticked ("Continue at
-- another store"), and a list whose ticks are all recorded can be reset.
--
-- This migration is ADDITIVE for the deployed 0.0.35 frontend and is applied
-- BEFORE the 0.0.36 frontend merges (docs/lessons.md: one shared Supabase
-- project, no staging). The follow-up 20261004000001_retire_archiving.sql runs
-- only after 0.0.36 is Live.
--
-- WHAT IS ADDED
--   list_items.recorded_at   A tick that a Continue finish has already recorded
--                            as a shop. "New since last finish" is
--                            checked_at is not null and recorded_at is null.
--                            Server-maintained: a BEFORE UPDATE OF checked_at
--                            trigger clears it whenever checked_at changes
--                            (untick, then retick, is new again) and a BEFORE
--                            INSERT trigger forces it null, so the client can
--                            never set it. There is no column grant for it.
--   lists.last_activity_at   Server-maintained "last touched" time, used to
--                            order the Lists screen. Bumped by statement-level
--                            triggers on list_items (insert and update, so a
--                            30-item reset is one list write, not 30) and by a
--                            BEFORE UPDATE trigger on lists when name,
--                            location_id or household_id changes. The client
--                            never writes it; there is no column grant.
--   finish_shopping(uuid, text)  New overload. p_ending is 'done' or 'continue'.
--   reset_list(uuid)             Untick a list whose every tick is already
--                                recorded; records no shop.
--   finish_shopping(uuid)        REDEFINED, not dropped. See "WINDOW" below.
--
-- LOCK ORDER (every function and trigger here): list_items rows first, then the
-- lists row. setChecked() locks the item row, and the activity trigger then
-- locks the list row, so the RPCs must take items before the list or a finish
-- racing a tick can deadlock. The original finish_shopping locked the list
-- first; that order is reversed on purpose.
--
-- WHY recorded_at IS CLEARED BY A TRIGGER AND NEVER WRITTEN BY THE CLIENT: the
-- client writes checked_at from its own clock and cannot be trusted to also
-- clear recorded_at in the same statement. A trigger keeps the pair consistent
-- for every writer, including an old 0.0.35 client.
--
-- WHY INSERT GUARDS ARE TRIGGERS, NOT COLUMN GRANTS: table-level INSERT on
-- lists and list_items is granted to authenticated and the live frontend
-- relies on it. Revoking it (or any column) would break production the moment
-- this applies (the 2026-09-06 lesson), so BEFORE INSERT triggers null or
-- overwrite the server-maintained columns instead: lists.last_activity_at,
-- lists.archived_at and list_items.recorded_at.
--
-- RLS: no policy changes and no new client grants. `deleted_at`, `archived_at`
-- and `recorded_at` stay out of RLS (a policy mentioning them would hide the
-- very UPDATE that changes them from Realtime). location_checkoffs still gets
-- only normalised names plus a location id (03-SPEC section 0, ADR 0002). The
-- trigger functions are security definer only so they can write
-- lists.last_activity_at, which clients cannot.
--
-- WINDOW (STOP-A to STOP-C). Cached 0.0.35 clients still call
-- finish_shopping(uuid) until STOP-C drops it. The original body would
-- double-record items that a 0.0.36 Continue already recorded, so it is
-- redefined here to be consistent with the new schema: it records only items
-- that are checked and not yet recorded; a full finish still archives the list
-- (the 0.0.35 contract) and stamps recorded_at on what it recorded, so 0.0.36
-- sees an all-ticked list and offers only Reset list; a partial finish
-- soft-deletes only the items it recorded. The return type must stay exactly
-- (archived, checked_count, total_count) because 0.0.35 reads `archived` and
-- `create or replace` cannot change it. STOP-C drops this function.
--
-- PGRST203: neither finish_shopping overload may ever gain a default. With a
-- default on p_ending, a call with only {p_list_id} would match both overloads
-- and PostgREST would refuse it, breaking the live 1-argument call.
--
-- LAST DATA STEP: the archived-list sweep. Lists archived by the old behaviour
-- are soft-deleted (hidden) so the new app does not surface a list that is
-- all-ticked with no recorded marks. shop_sessions are untouched: History keeps
-- their entries. archived_at is kept as the reversal key. Every swept row gets
-- the same deleted_at (now() is fixed inside this transaction), so the swept
-- ids are recorded from that one group at deploy time.
--
-- Reversal: see issue #89 amendments A2-2 and A3-2. A reversal migration is
-- written only if one is needed.

-- ---------------------------------------------------------------------------
-- 1. Columns.
-- ---------------------------------------------------------------------------

alter table public.list_items add column recorded_at timestamptz;

alter table public.lists add column last_activity_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. Backfill (production write). Runs BEFORE any trigger exists so it cannot
-- be disturbed by them. A list's last activity is the latest of: its creation,
-- any of its items' created / checked / deleted times, and its latest shop.
-- ---------------------------------------------------------------------------

update public.lists l
set last_activity_at = greatest(
  l.created_at,
  coalesce((
    select max(greatest(
      li.created_at,
      coalesce(li.checked_at, li.created_at),
      coalesce(li.deleted_at, li.created_at)))
    from public.list_items li
    where li.list_id = l.id
  ), l.created_at),
  coalesce((
    select max(s.completed_at)
    from public.shop_sessions s
    where s.list_id = l.id
  ), l.created_at)
);

-- ---------------------------------------------------------------------------
-- 3. Triggers and their functions. All plain or definer functions pin
-- search_path = '' and use public.* names.
-- ---------------------------------------------------------------------------

-- Untick or retick makes a tick "new" again: any change of checked_at clears
-- recorded_at. (BEFORE UPDATE OF checked_at fires when checked_at is in the SET
-- list even if the value is unchanged, hence the distinct-from guard.)
create or replace function public.list_items_clear_recorded()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.checked_at is distinct from old.checked_at then
    new.recorded_at := null;
  end if;
  return new;
end;
$$;

create trigger list_items_clear_recorded
  before update of checked_at on public.list_items
  for each row
  execute function public.list_items_clear_recorded();

-- Bumps the parent list of every item row touched by a statement. Statement
-- level with a transition table: one lists UPDATE per statement however many
-- items it touched. security definer because clients have no UPDATE grant on
-- lists.last_activity_at. Two triggers share this function (a transition table
-- trigger is one event each).
create or replace function public.list_items_touch_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lists
  set last_activity_at = now()
  where id in (select distinct list_id from new_rows);
  return null;
end;
$$;

create trigger list_items_touch_list_on_insert
  after insert on public.list_items
  referencing new table as new_rows
  for each statement
  execute function public.list_items_touch_list();

create trigger list_items_touch_list_on_update
  after update on public.list_items
  referencing new table as new_rows
  for each statement
  execute function public.list_items_touch_list();

-- A rename, a store change or a promotion counts as activity.
create or replace function public.lists_touch_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name
     or new.location_id is distinct from old.location_id
     or new.household_id is distinct from old.household_id then
    new.last_activity_at := now();
  end if;
  return new;
end;
$$;

create trigger lists_touch_activity
  before update on public.lists
  for each row
  execute function public.lists_touch_activity();

revoke execute on function public.list_items_clear_recorded() from public, anon, authenticated;
revoke execute on function public.list_items_touch_list() from public, anon, authenticated;
revoke execute on function public.lists_touch_activity() from public, anon, authenticated;

-- Insert guards. Created after the backfill and before the sweep.
-- lists_force_server_columns_on_insert: a client may not choose a list's
-- last_activity_at or insert it already archived (archived_at has no UPDATE
-- grant for clients; this closes the INSERT path).
create or replace function public.lists_force_server_columns_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.last_activity_at := now();
  new.archived_at := null;
  return new;
end;
$$;

create trigger lists_force_server_columns_on_insert
  before insert on public.lists
  for each row
  execute function public.lists_force_server_columns_on_insert();

create or replace function public.list_items_force_unrecorded_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.recorded_at := null;
  return new;
end;
$$;

create trigger list_items_force_unrecorded_on_insert
  before insert on public.list_items
  for each row
  execute function public.list_items_force_unrecorded_on_insert();

revoke execute on function public.lists_force_server_columns_on_insert() from public, anon, authenticated;
revoke execute on function public.list_items_force_unrecorded_on_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. finish_shopping(p_list_id uuid, p_ending text). NO DEFAULT on p_ending
-- (PGRST203, see header). Records a shop from the items checked since the last
-- finish. 'done' unticks every item (nothing is removed); 'continue' keeps the
-- ticks and stamps them recorded so the next store records only new ticks.
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
  v_new_names text[];
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
    coalesce(array_agg(li.name order by li.checked_at, li.id)
      filter (where li.checked_at is not null and li.recorded_at is null), '{}'),
    coalesce(array_agg(li.id)
      filter (where li.checked_at is not null and li.recorded_at is null), '{}'),
    count(*) filter (where li.checked_at is not null and li.recorded_at is null),
    count(*)
  into v_round_names, v_new_names, v_new_ids, v_new_count, v_total_count
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

  insert into public.shop_sessions (owner_id, household_id, location_id, list_id, item_names, checked_item_names)
  values (caller, v_household_id, v_location_id, p_list_id, v_round_names, v_new_names);

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
-- 5. reset_list(p_list_id uuid). Unticks a list whose every tick is already
-- recorded, recording nothing. An RPC (not a direct update) because it must
-- check under lock that no NEW tick exists, so it never wipes a household
-- member's fresh tick; RLS cannot express that.
-- ---------------------------------------------------------------------------

create or replace function public.reset_list(p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  perform 1
  from public.lists l
  where l.id = p_list_id
    and l.deleted_at is null
    and (l.owner_id = caller or l.household_id = public.current_household_id());

  if not found then
    raise exception 'list_not_found';
  end if;

  -- Items first, then the list (lock order, see header).
  perform 1
  from public.list_items li
  where li.list_id = p_list_id
    and li.deleted_at is null
  for update;

  perform 1
  from public.lists l
  where l.id = p_list_id
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'list_not_found';
  end if;

  if not exists (
    select 1 from public.list_items li
    where li.list_id = p_list_id and li.deleted_at is null and li.checked_at is not null
  ) then
    raise exception 'nothing_to_reset';
  end if;

  if exists (
    select 1 from public.list_items li
    where li.list_id = p_list_id and li.deleted_at is null
      and li.checked_at is not null and li.recorded_at is null
  ) then
    raise exception 'has_new_checks';
  end if;

  -- Touches at least one row (nothing_to_reset above), so the statement-level
  -- activity trigger bumps the list; no explicit lists update.
  update public.list_items
  set checked_at = null, recorded_at = null
  where list_id = p_list_id
    and deleted_at is null
    and (checked_at is not null or recorded_at is not null);
end;
$$;

revoke execute on function public.reset_list(uuid) from public, anon;
grant execute on function public.reset_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. finish_shopping(p_list_id uuid): redefined for the STOP-A to STOP-C window
-- (see WINDOW in the header). Same return type as before. Dropped by STOP-C.
-- ---------------------------------------------------------------------------

create or replace function public.finish_shopping(p_list_id uuid)
returns table (archived boolean, checked_count integer, total_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_household_id uuid;
  v_location_id uuid;
  v_archived_at timestamptz;
  v_round_names text[];
  v_new_names text[];
  v_new_ids uuid[];
  v_new_count int;
  v_all_checked_count int;
  v_total_count int;
  v_all_checked boolean;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  perform 1
  from public.lists l
  where l.id = p_list_id
    and l.deleted_at is null
    and (l.owner_id = caller or l.household_id = public.current_household_id());

  if not found then
    raise exception 'list_not_found';
  end if;

  -- Items first, then the list (lock order, see header).
  perform 1
  from public.list_items li
  where li.list_id = p_list_id
    and li.deleted_at is null
  for update;

  select l.household_id, l.location_id, l.archived_at
  into v_household_id, v_location_id, v_archived_at
  from public.lists l
  where l.id = p_list_id
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'list_not_found';
  end if;

  if v_archived_at is not null then
    raise exception 'already_finished';
  end if;

  if v_location_id is null then
    raise exception 'no_location';
  end if;

  select
    coalesce(array_agg(li.name order by li.position, li.id)
      filter (where not (li.checked_at is not null and li.recorded_at is not null)), '{}'),
    coalesce(array_agg(li.name order by li.checked_at, li.id)
      filter (where li.checked_at is not null and li.recorded_at is null), '{}'),
    coalesce(array_agg(li.id)
      filter (where li.checked_at is not null and li.recorded_at is null), '{}'),
    count(*) filter (where li.checked_at is not null and li.recorded_at is null),
    count(*) filter (where li.checked_at is not null),
    count(*)
  into v_round_names, v_new_names, v_new_ids, v_new_count, v_all_checked_count, v_total_count
  from public.list_items li
  where li.list_id = p_list_id
    and li.deleted_at is null;

  if v_new_count = 0 then
    raise exception 'nothing_checked';
  end if;

  v_all_checked := v_all_checked_count = v_total_count;

  insert into public.location_checkoffs (location_id, item_names)
  values (
    v_location_id,
    (select array_agg(lower(btrim(name))) from unnest(v_new_names) as name)
  );

  insert into public.shop_sessions (owner_id, household_id, location_id, list_id, item_names, checked_item_names)
  values (caller, v_household_id, v_location_id, p_list_id, v_round_names, v_new_names);

  if v_all_checked then
    update public.list_items set recorded_at = now() where id = any(v_new_ids);
    update public.lists set archived_at = now() where id = p_list_id;
  else
    update public.list_items set deleted_at = now() where id = any(v_new_ids);
  end if;

  return query select v_all_checked, v_new_count, v_total_count;
end;
$$;

revoke execute on function public.finish_shopping(uuid) from public, anon;
grant execute on function public.finish_shopping(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. LAST DATA STEP: hide lists archived by the old behaviour. After the
-- backfill and the triggers; does not touch last_activity_at (lists_touch_
-- activity reacts only to name, location_id and household_id); shop_sessions
-- are untouched, so History keeps their entries.
-- ---------------------------------------------------------------------------

update public.lists
set deleted_at = now()
where archived_at is not null
  and deleted_at is null;
