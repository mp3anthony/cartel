-- Issue #112 revert: undoes 20261114000000_item_location_standard_labels.sql.
-- DRAFTED, NEVER APPLIED, and kept outside supabase/migrations on purpose (the CLI
-- ignores this folder). Send it through the MCP (or paste it into the Supabase SQL
-- editor) only if the #112 guard must be undone. The 0.0.76 app needs no revert: it
-- sends only standard labels, so it works with or without the guard.
--
-- What it does, in one transaction:
--   1  takes ACCESS EXCLUSIVE on location_items and location_item_votes;
--   2  drops the two CHECK constraints FIRST (they depend on is_item_location_label),
--      then the trigger location_items_standard_section;
--   3  puts vote_location_item_correction back to the C2 body (20261012000000),
--      copied verbatim below (NOT read from schema migration_106, which is dropped
--      later), with EXECUTE re-granted as before (authenticated only);
--   4  drops the trigger function and the three label helpers;
--   5  checks the result; on a dry run ends with "DRY RUN OK, rolled back".
-- No data changes: every label stored under #112 is a standard label, which C2 also
-- accepts. The old length checks were never touched, so they stay.
--
-- CAVEAT: supabase/rollback/106_c2_revert.sql must NOT run while #112 is applied (it
-- re-inserts non-standard labels the #112 trigger and CHECKs refuse). Run this file
-- first if both ever need undoing.
--
-- DRY RUN: uncomment the cartel.dry_run line below. Dry-run it once right after the
-- real migration, so the revert is known to work before it is needed.
-- ASCII only (clipboard mangling lesson in docs/lessons.md).

begin;

-- set local cartel.dry_run = 'on';

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if to_regprocedure('public.item_location_label(text)') is null
     or to_regprocedure('public.location_items_standard_section()') is null then
    raise exception 'FAIL: #112 is not applied (item_location_label or the trigger function is missing), nothing to revert';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Locks.
-- ---------------------------------------------------------------------------

lock table public.location_items, public.location_item_votes in access exclusive mode;

-- ---------------------------------------------------------------------------
-- 2. Constraints first (they depend on is_item_location_label), then the trigger.
-- ---------------------------------------------------------------------------

alter table public.location_items
  drop constraint if exists location_items_section_standard;
alter table public.location_item_votes
  drop constraint if exists location_item_votes_proposed_section_standard;

drop trigger if exists location_items_standard_section on public.location_items;

-- ---------------------------------------------------------------------------
-- 3. vote_location_item_correction as C2 left it (20261012000000, section 5),
-- verbatim.
-- ---------------------------------------------------------------------------

create or replace function public.vote_location_item_correction(
  p_location_id uuid,
  p_item_name text,
  p_proposed_section text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_item_name text := public.fold_item_name(p_item_name);
  v_proposed_section text := public.capitalise_first(p_proposed_section);
  v_current_section text;
  v_vote_count int;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  -- The tag row is locked for the rest of the call, so a case-only apply and a
  -- quorum apply on one item cannot interleave.
  select section into v_current_section
  from public.location_items
  where location_id = p_location_id
    and name = v_item_name
  for update;

  if v_current_section is null then
    raise exception 'item_not_tagged';
  end if;

  if v_current_section = v_proposed_section then
    raise exception 'correction_matches_current';
  end if;

  -- A change of case or spacing only needs no second opinion: apply it at once and
  -- clear this item's pending votes, as a quorum apply does.
  if lower(btrim(regexp_replace(v_current_section, '\s+', ' ', 'g')))
     = lower(btrim(regexp_replace(v_proposed_section, '\s+', ' ', 'g'))) then
    update public.location_items
    set section = v_proposed_section
    where location_id = p_location_id
      and name = v_item_name;

    delete from public.location_item_votes
    where location_id = p_location_id
      and item_name = v_item_name;

    return;
  end if;

  -- The insert attempt IS the independence check - see the header of
  -- 20260811000002. Splitting a pre-check from the write would let two truly
  -- concurrent identical requests both pass the check before either wrote, the
  -- same race redeem_invite (migration 20260810000000) already avoids by making
  -- its claiming UPDATE the validation.
  begin
    insert into public.location_item_votes
      (location_id, item_name, proposed_section, voter_id)
    values
      (p_location_id, v_item_name, v_proposed_section, caller);
  exception when unique_violation then
    raise exception 'already_voted';
  end;

  select count(*) into v_vote_count
  from public.location_item_votes
  where location_id = p_location_id
    and item_name = v_item_name
    and proposed_section = v_proposed_section;

  if v_vote_count >= 2 then
    update public.location_items
    set section = v_proposed_section
    where location_id = p_location_id
      and name = v_item_name;

    -- Every pending vote for this item, not only this tuple's own two: applying
    -- one correction moots the others (see the header of 20260811000002).
    delete from public.location_item_votes
    where location_id = p_location_id
      and item_name = v_item_name;
  end if;
end;
$$;

revoke execute on function public.vote_location_item_correction(uuid, text, text)
  from public, anon;
grant execute on function public.vote_location_item_correction(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The functions: the trigger function, then the helpers. The order is cosmetic:
-- Postgres does not track dependencies inside function bodies.
-- ---------------------------------------------------------------------------

drop function if exists public.location_items_standard_section();
drop function if exists public.item_location_label(text);
drop function if exists public.is_item_location_label(text);
drop function if exists public.item_location_departments();

-- ---------------------------------------------------------------------------
-- 5. Checks.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text := pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure);
begin
  if v_def not like '%public.capitalise_first(p_proposed_section)%'
     or v_def like '%item_location_label%'
     or v_def not ilike '%for update%' then
    raise exception 'FAIL: vote_location_item_correction is not the C2 body';
  end if;

  if not (select p.prosecdef from pg_proc p
          where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure) then
    raise exception 'FAIL: vote_location_item_correction is not security definer';
  end if;

  if (select array_to_string(p.proconfig, ',') from pg_proc p
      where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure)
     not like '%search_path=""%' then
    raise exception 'FAIL: vote_location_item_correction does not have search_path = ''''';
  end if;

  if has_function_privilege('anon', 'public.vote_location_item_correction(uuid, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.vote_location_item_correction(uuid, text, text)', 'execute') then
    raise exception 'FAIL: vote_location_item_correction must be executable by authenticated only';
  end if;

  if to_regprocedure('public.item_location_departments()') is not null
     or to_regprocedure('public.is_item_location_label(text)') is not null
     or to_regprocedure('public.item_location_label(text)') is not null
     or to_regprocedure('public.location_items_standard_section()') is not null
     or exists (select 1 from pg_trigger
                where tgrelid = 'public.location_items'::regclass
                  and tgname = 'location_items_standard_section')
     or exists (select 1 from pg_constraint
                where conname in ('location_items_section_standard',
                                  'location_item_votes_proposed_section_standard')) then
    raise exception 'FAIL: a #112 object is still there';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_tidy'
      and not tgisinternal
      and tgenabled = 'O'
  ) then
    raise exception 'FAIL: trigger location_items_tidy is missing or not enabled';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid in ('public.location_items'::regclass,
                      'public.location_item_votes'::regclass,
                      'public.location_checkoffs'::regclass)
      and not tgisinternal
      and tgenabled <> 'O'
  ) then
    raise exception 'FAIL: a trigger on a location table is not enabled';
  end if;

  if current_setting('cartel.dry_run', true) = 'on' then
    raise exception 'DRY RUN OK, rolled back: revert would succeed';
  end if;
end $$;

commit;
