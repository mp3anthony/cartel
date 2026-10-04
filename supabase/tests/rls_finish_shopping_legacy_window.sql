-- Tests for the REDEFINED one-argument public.finish_shopping(uuid) during the
-- STOP-A to STOP-C window of issue #89 (cached 0.0.35 clients still call it).
--
-- HOW TO RUN: only between STOP-A (20261004000000_reusable_lists.sql applied)
-- and STOP-C (20261004000001_retire_archiving.sql, which drops the function).
-- Paste the whole file into the Supabase MCP server's `execute_sql` tool against
-- project chacavfoewyiwrfgvxtj. Success is silence: every assertion raises only
-- when it fails. The file is wrapped in `begin ... rollback` so it leaves
-- nothing behind. Never run it before STOP-A (it needs the new schema) or after
-- STOP-C (the function is gone). A test-only follow-up PR deletes this file once
-- STOP-C is applied and verified.
--
-- WHAT IT GUARDS. The old function must stay consistent with the new schema so
-- a 0.0.35 finish cannot double-record: it records only items that are checked
-- and not yet recorded (L1), raises nothing_checked when only recorded ticks
-- remain (L2), still archives on a full finish (the 0.0.35 contract) while
-- stamping recorded_at on what it recorded and leaving last_activity_at equal to
-- archived_at so STOP-C's sweep predicate treats an untouched window-archive as
-- sweepable (L3), still raises already_finished (L4), authorisation (L5), and
-- keeps its execute grants (L6).
--
-- Actors and fixtures are named LA / LB / LH / LL so they cannot be confused
-- with the main file's A / B / H / L. Fixtures are inserted as the owning role;
-- only the calls run as `authenticated`. State carries forward: do not reorder.

begin;

create temp table snap (k text primary key, v bigint);

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000f5c1', true),  -- LA: owns lists 5 and 6
  ('00000000-0000-4000-8000-00000000f5e1', true);  -- LB: stranger

insert into public.households (id, name) values
  ('50000000-0000-4000-8000-000000000059', 'Test Household (legacy window)');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-00000000f5c1', '50000000-0000-4000-8000-000000000059');

insert into public.locations (id, name, lat, lng, created_by) values
  ('81000000-0000-4000-8000-000000000059',
   'Test Supermarket (legacy window)', -36.8485, 174.7633,
   '00000000-0000-4000-8000-00000000f5c1');

insert into public.lists (id, owner_id, household_id, location_id, name) values
  ('70000000-0000-4000-8000-000000000595',
   '00000000-0000-4000-8000-00000000f5c1', '50000000-0000-4000-8000-000000000059',
   '81000000-0000-4000-8000-000000000059', 'List 5 (legacy partial)'),
  ('70000000-0000-4000-8000-000000000596',
   '00000000-0000-4000-8000-00000000f5c1', '50000000-0000-4000-8000-000000000059',
   '81000000-0000-4000-8000-000000000059', 'List 6 (legacy full)');

-- List 5: k1, k2 checked, k3 not. List 6: m1, m2 checked.
insert into public.list_items (id, list_id, name, position, checked_at) values
  ('90000000-0000-4000-8000-000000005951', '70000000-0000-4000-8000-000000000595', 'k1', 'a0', now()),
  ('90000000-0000-4000-8000-000000005952', '70000000-0000-4000-8000-000000000595', 'k2', 'a1', now()),
  ('90000000-0000-4000-8000-000000005953', '70000000-0000-4000-8000-000000000595', 'k3', 'a2', null),
  ('90000000-0000-4000-8000-000000005961', '70000000-0000-4000-8000-000000000596', 'm1', 'a0', now()),
  ('90000000-0000-4000-8000-000000005962', '70000000-0000-4000-8000-000000000596', 'm2', 'a1', now());

-- The BEFORE INSERT guard forces recorded_at null, so mark the "already
-- recorded under Continue" items by UPDATE (checked_at untouched, so the
-- clear-on-change trigger does not fire).
update public.list_items set recorded_at = now()
where id in ('90000000-0000-4000-8000-000000005951',
             '90000000-0000-4000-8000-000000005961');
update public.lists set last_activity_at = '2000-01-01'
where id = '70000000-0000-4000-8000-000000000596';

-- ---------------------------------------------------------------------------
-- L1 -- partial. As LA on list 5 (k1 recorded+checked, k2 new, k3 unticked) the
-- call returns (false, 1, 3). k2 is soft-deleted; k1 is NOT deleted and keeps
-- both marks; k3 is untouched. Exactly one session for list 5 with item_names
-- {k2,k3} (no k1) and checked_item_names {k2}; the location_checkoffs delta is
-- 1 row with 1 name.
-- ---------------------------------------------------------------------------

insert into snap values
  ('checkoffs', (select count(*) from public.location_checkoffs
                 where location_id = '81000000-0000-4000-8000-000000000059'));

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5c1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000000595'::uuid);

  if r.archived <> false or r.checked_count <> 1 or r.total_count <> 3 then
    raise exception 'FAIL: L1 legacy partial finish returned (archived=%, checked_count=%, total_count=%), expected (false, 1, 3)',
      r.archived, r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
declare
  s record;
begin
  if (select deleted_at from public.list_items
      where id = '90000000-0000-4000-8000-000000005952') is null then
    raise exception 'FAIL: L1 k2 (the new tick) was not soft-deleted';
  end if;

  if (select deleted_at is null and checked_at is not null and recorded_at is not null
      from public.list_items where id = '90000000-0000-4000-8000-000000005951') is not true then
    raise exception 'FAIL: L1 k1 (already recorded) must stay present, ticked and recorded';
  end if;

  if (select deleted_at is null and checked_at is null
      from public.list_items where id = '90000000-0000-4000-8000-000000005953') is not true then
    raise exception 'FAIL: L1 k3 (unticked) must be untouched';
  end if;

  if (select count(*) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000000595') <> 1 then
    raise exception 'FAIL: L1 expected exactly 1 shop_sessions row for list 5';
  end if;

  select * into s from public.shop_sessions
  where list_id = '70000000-0000-4000-8000-000000000595';

  if s.item_names <> array['k2', 'k3'] then
    raise exception 'FAIL: L1 session item_names is %, expected {k2,k3} (k1 was already recorded)', s.item_names;
  end if;

  if s.checked_item_names <> array['k2'] then
    raise exception 'FAIL: L1 session checked_item_names is %, expected {k2}', s.checked_item_names;
  end if;

  if (select count(*) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000059')
     - (select v from snap where k = 'checkoffs') <> 1 then
    raise exception 'FAIL: L1 expected exactly 1 new location_checkoffs row';
  end if;

  if (select array_length(item_names, 1) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000059') <> 1 then
    raise exception 'FAIL: L1 location_checkoffs.item_names must have exactly 1 name';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- L2 -- again. Only the recorded k1 is still ticked, so list 5 raises
-- nothing_checked and the session count is unchanged.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5c1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000595'::uuid);
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'nothing_checked' then
    raise exception 'FAIL: L2 legacy re-finish of list 5 raised % (null = no error), expected nothing_checked', msg;
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000000595') <> 1 then
    raise exception 'FAIL: L2 the rejected call created a shop_sessions row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- L3 -- full. As LA on list 6 (m1 recorded+checked, m2 new) the call returns
-- (true, 1, 2). The list is archived; m2 is ticked AND recorded; nothing is
-- removed; the session has checked_item_names {m2} and item_names {m2};
-- last_activity_at = archived_at (so STOP-C's predicate sweeps an untouched
-- window-archive).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5c1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000000596'::uuid);

  if r.archived <> true or r.checked_count <> 1 or r.total_count <> 2 then
    raise exception 'FAIL: L3 legacy full finish returned (archived=%, checked_count=%, total_count=%), expected (true, 1, 2)',
      r.archived, r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
declare
  s record;
begin
  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000596') is null then
    raise exception 'FAIL: L3 a legacy full finish did not archive list 6';
  end if;

  if (select checked_at is not null and recorded_at is not null
      from public.list_items where id = '90000000-0000-4000-8000-000000005962') is not true then
    raise exception 'FAIL: L3 m2 must be ticked and recorded after the legacy full finish';
  end if;

  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000000596'
        and deleted_at is not null) <> 0 then
    raise exception 'FAIL: L3 a legacy full finish removed items';
  end if;

  select * into s from public.shop_sessions
  where list_id = '70000000-0000-4000-8000-000000000596';

  if s.checked_item_names <> array['m2'] or s.item_names <> array['m2'] then
    raise exception 'FAIL: L3 session is (%, %), expected item_names {m2} and checked_item_names {m2}',
      s.item_names, s.checked_item_names;
  end if;

  if (select last_activity_at <> archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000596') then
    raise exception 'FAIL: L3 last_activity_at must equal archived_at after a legacy full finish';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- L4 -- list 6 again raises already_finished.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5c1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000596'::uuid);
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'already_finished' then
    raise exception 'FAIL: L4 legacy re-finish of archived list 6 raised % (null = no error), expected already_finished', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- L5 -- LB (stranger) on list 5 raises list_not_found.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000595'::uuid);
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'list_not_found' then
    raise exception 'FAIL: L5 stranger LB''s legacy finish raised % (null = no error), expected list_not_found', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- L6 -- grants. anon may not execute the one-argument function; authenticated
-- may.
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('anon', 'public.finish_shopping(uuid)', 'execute') then
    raise exception 'FAIL: L6 anon can execute finish_shopping(uuid)';
  end if;
  if not has_function_privilege('authenticated', 'public.finish_shopping(uuid)', 'execute') then
    raise exception 'FAIL: L6 authenticated cannot execute finish_shopping(uuid)';
  end if;
end $$;

rollback;
