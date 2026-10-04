-- RLS/grant/behaviour tests for public.finish_shopping(uuid, text) and
-- public.reset_list(uuid) (issue #89 -- reusable lists; supersedes the #58
-- version of this file, which tested the one-argument archive-or-soft-delete
-- finish).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as
-- a fallback. It needs STOP-A's schema (20261004000000_reusable_lists.sql), so
-- run it only AFTER STOP-A is applied, never before. Success is silence: every
-- assertion raises only when it fails, so a run that returns without a `FAIL:`
-- exception is a pass. The whole file is wrapped in `begin ... rollback`, so it
-- leaves nothing behind whether it passes or fails.
--
-- `now()` is fixed for the whole transaction. So before each activity-bump
-- assertion the owning role sets the list's last_activity_at to '2000-01-01',
-- the actor acts, and the assertion is `> '2000-01-01'`.
--
-- WHAT IT GUARDS. Assertions 1-10 are the finish contract: Done records the
-- ticks since the last finish, unticks everything and removes nothing;
-- Continue keeps ticks and stamps them recorded so a second finish records
-- only new ticks; nothing-new, stranger, bad ending and no-location raise the
-- documented codes; equal rank (a household member who does not own the list
-- may finish it). Assertion 11 checks recorded_at and last_activity_at have no
-- client write path. 12-14 check the activity triggers and the INSERT guards.
-- 15-18 are reset_list. 19 checks the function catalogue: no defaults on any
-- finish_shopping overload (PGRST203) and the execute grants.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as
-- the owning role, which bypasses RLS (the INSERT guard triggers still fire
-- for it, so recorded_at is set afterwards by UPDATE). Only the assertions run
-- as `authenticated`. `request.jwt.claims` must be set *before* the role
-- switch. State carries forward between assertions: they are not independent
-- and must not be reordered.

begin;

create temp table snap (k text primary key, v bigint);

-- ---------------------------------------------------------------------------
-- Fixtures. Household H has members A (owner of every list below) and D (same
-- household, owns none). Stranger B shares nothing. One location L.
--
-- List 1: item1, item2 checked, item3 not.            (Done target)
-- List 2: item4 checked, item5, item6 not.            (Continue + equal rank)
-- List 3: no location; one checked item.              (no_location)
-- List 4: r1, r2 both checked.                        (reset_list)
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000f5a1', true),  -- A: owns lists 1-4
  ('00000000-0000-4000-8000-00000000f5d1', true),  -- D: same household as A
  ('00000000-0000-4000-8000-00000000f5b1', true);  -- B: stranger

insert into public.households (id, name) values
  ('50000000-0000-4000-8000-000000000058', 'Test Household (finish_shopping)');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-00000000f5a1', '50000000-0000-4000-8000-000000000058'),
  ('00000000-0000-4000-8000-00000000f5d1', '50000000-0000-4000-8000-000000000058');

insert into public.locations (id, name, lat, lng, created_by) values
  ('81000000-0000-4000-8000-000000000058',
   'Test Supermarket (finish_shopping)', -36.8485, 174.7633,
   '00000000-0000-4000-8000-00000000f5a1');

insert into public.lists (id, owner_id, household_id, location_id, name) values
  ('70000000-0000-4000-8000-000000000581',
   '00000000-0000-4000-8000-00000000f5a1', '50000000-0000-4000-8000-000000000058',
   '81000000-0000-4000-8000-000000000058', 'List 1 (done)'),
  ('70000000-0000-4000-8000-000000000582',
   '00000000-0000-4000-8000-00000000f5a1', '50000000-0000-4000-8000-000000000058',
   '81000000-0000-4000-8000-000000000058', 'List 2 (continue)'),
  ('70000000-0000-4000-8000-000000000583',
   '00000000-0000-4000-8000-00000000f5a1', '50000000-0000-4000-8000-000000000058',
   null, 'List 3 (no location)'),
  ('70000000-0000-4000-8000-000000000584',
   '00000000-0000-4000-8000-00000000f5a1', '50000000-0000-4000-8000-000000000058',
   '81000000-0000-4000-8000-000000000058', 'List 4 (reset)');

insert into public.list_items (id, list_id, name, position, checked_at) values
  ('90000000-0000-4000-8000-000000005811', '70000000-0000-4000-8000-000000000581',
   'item1', 'a0', now()),
  ('90000000-0000-4000-8000-000000005812', '70000000-0000-4000-8000-000000000581',
   'item2', 'a1', now()),
  ('90000000-0000-4000-8000-000000005813', '70000000-0000-4000-8000-000000000581',
   'item3', 'a2', null),
  ('90000000-0000-4000-8000-000000005821', '70000000-0000-4000-8000-000000000582',
   'item4', 'a0', now()),
  ('90000000-0000-4000-8000-000000005822', '70000000-0000-4000-8000-000000000582',
   'item5', 'a1', null),
  ('90000000-0000-4000-8000-000000005823', '70000000-0000-4000-8000-000000000582',
   'item6', 'a2', null),
  ('90000000-0000-4000-8000-000000005831', '70000000-0000-4000-8000-000000000583',
   'item7', 'a0', now()),
  ('90000000-0000-4000-8000-000000005841', '70000000-0000-4000-8000-000000000584',
   'r1', 'a0', now()),
  ('90000000-0000-4000-8000-000000005842', '70000000-0000-4000-8000-000000000584',
   'r2', 'a1', now());

-- The BEFORE INSERT guard nulled recorded_at on every fixture row (it fires for
-- every role). Fixture-level sanity: that is what we expect.
do $$
begin
  if (select count(*) from public.list_items where recorded_at is not null) <> 0 then
    raise exception 'FAIL: the BEFORE INSERT guard let a recorded_at through on a fixture insert';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 1 -- Done. As A, finish list 1 (2 of 3 checked) with 'done'. Must
-- return (2, 3); write one shop_sessions row (item_names all 3 in position
-- order, checked_item_names the 2 checked) and one location_checkoffs row (2
-- names); leave ALL 3 items present and unticked with recorded_at null; leave
-- the list unarchived and bump its last_activity_at.
-- ---------------------------------------------------------------------------

update public.lists set last_activity_at = '2000-01-01'
where id = '70000000-0000-4000-8000-000000000581';
insert into snap values
  ('checkoffs', (select count(*) from public.location_checkoffs
                 where location_id = '81000000-0000-4000-8000-000000000058')),
  ('sessions1', (select count(*) from public.shop_sessions
                 where list_id = '70000000-0000-4000-8000-000000000581'));

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000000581', 'done');

  if r.checked_count <> 2 or r.total_count <> 3 then
    raise exception 'FAIL: done on list 1 returned (checked_count=%, total_count=%), expected (2, 3)',
      r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
declare
  s record;
begin
  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000581') is not null then
    raise exception 'FAIL: a Done finish archived the list';
  end if;

  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000000581'
        and deleted_at is null and checked_at is null and recorded_at is null) <> 3 then
    raise exception 'FAIL: after Done, all 3 items of list 1 must be present, unticked and unrecorded';
  end if;

  if (select count(*) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000000581')
     - (select v from snap where k = 'sessions1') <> 1 then
    raise exception 'FAIL: expected exactly 1 new shop_sessions row for list 1';
  end if;

  select * into s from public.shop_sessions
  where list_id = '70000000-0000-4000-8000-000000000581';

  if s.item_names <> array['item1', 'item2', 'item3'] then
    raise exception 'FAIL: list 1 session item_names is %, expected {item1,item2,item3}', s.item_names;
  end if;

  if s.checked_item_names <> array['item1', 'item2'] then
    raise exception 'FAIL: list 1 session checked_item_names is %, expected {item1,item2}', s.checked_item_names;
  end if;

  if (select count(*) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000058')
     - (select v from snap where k = 'checkoffs') <> 1 then
    raise exception 'FAIL: expected exactly 1 new location_checkoffs row after the Done finish';
  end if;

  if (select array_length(item_names, 1) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000058') <> 2 then
    raise exception 'FAIL: location_checkoffs.item_names does not have cardinality 2';
  end if;

  if (select last_activity_at from public.lists
      where id = '70000000-0000-4000-8000-000000000581') <= '2000-01-01' then
    raise exception 'FAIL: a Done finish did not bump lists.last_activity_at';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 2 -- Done again. Everything on list 1 is now unticked, so a second
-- call as A must raise nothing_checked and write nothing.
-- ---------------------------------------------------------------------------

insert into snap values
  ('checkoffs2', (select count(*) from public.location_checkoffs
                  where location_id = '81000000-0000-4000-8000-000000000058')),
  ('sessions1b', (select count(*) from public.shop_sessions
                  where list_id = '70000000-0000-4000-8000-000000000581'));

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000581', 'done');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'nothing_checked' then
    raise exception 'FAIL: re-running Done on list 1 raised % (null = no error), expected nothing_checked', msg;
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000000581')
     <> (select v from snap where k = 'sessions1b') then
    raise exception 'FAIL: the rejected re-invocation created a shop_sessions row';
  end if;

  if (select count(*) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000058')
     <> (select v from snap where k = 'checkoffs2') then
    raise exception 'FAIL: the rejected re-invocation created a location_checkoffs row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 3 -- Continue. As A, continue list 2 (1 of 3 checked: item4). Must
-- return (1, 3); item4 stays ticked and gets recorded_at set; the session has
-- 3 item_names and 1 checked.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000000582', 'continue');

  if r.checked_count <> 1 or r.total_count <> 3 then
    raise exception 'FAIL: continue on list 2 returned (checked_count=%, total_count=%), expected (1, 3)',
      r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
declare
  s record;
begin
  if (select checked_at is not null and recorded_at is not null from public.list_items
      where id = '90000000-0000-4000-8000-000000005821') is not true then
    raise exception 'FAIL: after Continue, item4 must stay ticked and have recorded_at set';
  end if;

  if (select deleted_at from public.list_items
      where id = '90000000-0000-4000-8000-000000005821') is not null then
    raise exception 'FAIL: Continue removed item4';
  end if;

  select * into s from public.shop_sessions
  where list_id = '70000000-0000-4000-8000-000000000582';

  if s.item_names <> array['item4', 'item5', 'item6'] or s.checked_item_names <> array['item4'] then
    raise exception 'FAIL: list 2 first session is (%, %), expected ({item4,item5,item6}, {item4})',
      s.item_names, s.checked_item_names;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 4 -- second round. As A tick item5; item4's recorded_at must stay
-- intact. Continue again: the session's item_names must be {item5,item6}
-- (cardinality 2; the recorded item4 is not a "not bought" candidate) and its
-- checked_item_names {item5}.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

update public.list_items set checked_at = now()
where id = '90000000-0000-4000-8000-000000005822';

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000000582', 'continue');

  if r.checked_count <> 1 or r.total_count <> 3 then
    raise exception 'FAIL: second continue on list 2 returned (checked_count=%, total_count=%), expected (1, 3)',
      r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
declare
  s record;
begin
  if (select recorded_at from public.list_items
      where id = '90000000-0000-4000-8000-000000005821') is null then
    raise exception 'FAIL: ticking item5 cleared item4''s recorded_at';
  end if;

  -- Both list 2 sessions share this transaction's now(), so pick the second one
  -- by content rather than by time.
  select * into s from public.shop_sessions
  where list_id = '70000000-0000-4000-8000-000000000582'
    and checked_item_names = array['item5'];

  if not found then
    raise exception 'FAIL: no list 2 session with checked_item_names {item5}';
  end if;

  if s.item_names <> array['item5', 'item6'] then
    raise exception 'FAIL: second Continue item_names is %, expected {item5,item6} (store 2''s "Not bought" must not list store 1''s purchases)',
      s.item_names;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 5 -- Continue with nothing new (item4, item5 recorded; item6
-- unticked) must raise nothing_checked.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000582', 'continue');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'nothing_checked' then
    raise exception 'FAIL: Continue with nothing new raised % (null = no error), expected nothing_checked', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 -- untick clears recorded_at. As A untick the recorded item4:
-- checked_at and recorded_at both null. Then retick it: recorded_at stays null
-- (a retick is a new tick).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

update public.list_items set checked_at = null
where id = '90000000-0000-4000-8000-000000005821';

reset role;

do $$
begin
  if (select checked_at is null and recorded_at is null from public.list_items
      where id = '90000000-0000-4000-8000-000000005821') is not true then
    raise exception 'FAIL: unticking a recorded item must clear both checked_at and recorded_at';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

update public.list_items set checked_at = now()
where id = '90000000-0000-4000-8000-000000005821';

reset role;

do $$
begin
  if (select checked_at is not null and recorded_at is null from public.list_items
      where id = '90000000-0000-4000-8000-000000005821') is not true then
    raise exception 'FAIL: reticking an item must leave it ticked and unrecorded (a new tick)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 7 -- equal rank. D (household member, not owner) finishes list 2
-- with 'done'. State: item4 new tick, item5 ticked+recorded, item6 unticked.
-- Must return (1, 3) and leave every item unticked, unrecorded and present.
-- The session's item_names must be {item4,item6} (item5 was already recorded).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000000582', 'done');

  if r.checked_count <> 1 or r.total_count <> 3 then
    raise exception 'FAIL: D (household member, not owner) finishing list 2 returned (checked_count=%, total_count=%), expected (1, 3) -- equal-rank invariant broken',
      r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000000582'
        and deleted_at is null and checked_at is null and recorded_at is null) <> 3 then
    raise exception 'FAIL: after D''s Done, all 3 items of list 2 must be present, unticked and unrecorded';
  end if;

  if (select count(*) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000000582'
        and item_names = array['item4', 'item6']
        and checked_item_names = array['item4']) <> 1 then
    raise exception 'FAIL: D''s Done session must have item_names {item4,item6} and checked_item_names {item4}';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 8 -- stranger. B calls finish_shopping on A's list 2 (state does
-- not matter: authorisation comes first). Must raise list_not_found.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5b1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000582', 'done');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'list_not_found' then
    raise exception 'FAIL: stranger B''s finish_shopping raised % (null = no error), expected list_not_found', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 9 -- bad ending. As A, p_ending 'bogus' must raise invalid_ending.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000581', 'bogus');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'invalid_ending' then
    raise exception 'FAIL: p_ending ''bogus'' raised % (null = no error), expected invalid_ending', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 10 -- no location. List 3 has a checked item but no store: A's
-- finish must raise no_location.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000583', 'done');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'no_location' then
    raise exception 'FAIL: finishing list 3 (no store) raised % (null = no error), expected no_location', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 11 -- no client write path. As A, a direct UPDATE of
-- list_items.recorded_at and of lists.last_activity_at must each fail
-- (permission denied: neither column is granted).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean;
begin
  raised := false;
  begin
    update public.list_items set recorded_at = now()
    where id = '90000000-0000-4000-8000-000000005811';
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'FAIL: A could directly UPDATE list_items.recorded_at';
  end if;

  raised := false;
  begin
    update public.lists set last_activity_at = now()
    where id = '70000000-0000-4000-8000-000000000581';
  exception when others then
    raised := true;
  end;
  if not raised then
    raise exception 'FAIL: A could directly UPDATE lists.last_activity_at';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 12 -- activity triggers. As A (a) rename list 1 and (b) insert an
-- item into it: each must bump the list's last_activity_at (reset to 2000-01-01
-- before each).
-- ---------------------------------------------------------------------------

update public.lists set last_activity_at = '2000-01-01'
where id = '70000000-0000-4000-8000-000000000581';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

update public.lists set name = 'List 1 (renamed)'
where id = '70000000-0000-4000-8000-000000000581';

reset role;

do $$
begin
  if (select last_activity_at from public.lists
      where id = '70000000-0000-4000-8000-000000000581') <= '2000-01-01' then
    raise exception 'FAIL: renaming a list did not bump last_activity_at';
  end if;
end $$;

update public.lists set last_activity_at = '2000-01-01'
where id = '70000000-0000-4000-8000-000000000581';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

insert into public.list_items (list_id, name, position)
values ('70000000-0000-4000-8000-000000000581', 'item8', 'a3');

reset role;

do $$
begin
  if (select last_activity_at from public.lists
      where id = '70000000-0000-4000-8000-000000000581') <= '2000-01-01' then
    raise exception 'FAIL: inserting an item did not bump the parent list''s last_activity_at';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 13 -- INSERT guard on lists. As A insert a list that supplies
-- last_activity_at => 2000-01-01 and archived_at => now(): the stored
-- last_activity_at must be now() (> 2000-01-01) and archived_at must be null.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

insert into public.lists (id, owner_id, name, last_activity_at, archived_at)
values ('70000000-0000-4000-8000-000000000585',
        '00000000-0000-4000-8000-00000000f5a1', 'List 5 (insert guard)',
        '2000-01-01', now());

reset role;

do $$
begin
  if (select last_activity_at from public.lists
      where id = '70000000-0000-4000-8000-000000000585') <= '2000-01-01' then
    raise exception 'FAIL: a client-supplied lists.last_activity_at survived INSERT';
  end if;

  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000585') is not null then
    raise exception 'FAIL: a client-supplied lists.archived_at survived INSERT';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 14 -- INSERT guard on list_items. As A insert an item that supplies
-- recorded_at => now(): stored null; the parent list's activity is bumped.
-- ---------------------------------------------------------------------------

update public.lists set last_activity_at = '2000-01-01'
where id = '70000000-0000-4000-8000-000000000581';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

insert into public.list_items (id, list_id, name, position, checked_at, recorded_at)
values ('90000000-0000-4000-8000-000000005814', '70000000-0000-4000-8000-000000000581',
        'item9', 'a4', now(), now());

reset role;

do $$
begin
  if (select recorded_at from public.list_items
      where id = '90000000-0000-4000-8000-000000005814') is not null then
    raise exception 'FAIL: a client-supplied list_items.recorded_at survived INSERT';
  end if;

  if (select last_activity_at from public.lists
      where id = '70000000-0000-4000-8000-000000000581') <= '2000-01-01' then
    raise exception 'FAIL: inserting an item with recorded_at did not bump the parent list''s activity';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 15 -- reset_list refuses new ticks. List 4: r1 recorded, r2 only
-- checked (new). As A, reset_list must raise has_new_checks and change
-- nothing.
-- ---------------------------------------------------------------------------

update public.list_items set recorded_at = now()
where id = '90000000-0000-4000-8000-000000005841';
update public.lists set last_activity_at = '2000-01-01'
where id = '70000000-0000-4000-8000-000000000584';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.reset_list('70000000-0000-4000-8000-000000000584');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'has_new_checks' then
    raise exception 'FAIL: reset_list with a new tick raised % (null = no error), expected has_new_checks', msg;
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000000584'
        and checked_at is not null and deleted_at is null) <> 2 then
    raise exception 'FAIL: a refused reset_list unticked something';
  end if;

  if (select recorded_at is not null from public.list_items
      where id = '90000000-0000-4000-8000-000000005841') is not true then
    raise exception 'FAIL: a refused reset_list cleared r1''s recorded_at';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 16 -- reset_list succeeds. Record r2 too (UPDATE recorded_at only,
-- so checked_at is untouched), snapshot the shop counts, reset activity, then D
-- (equal rank) resets list 4: every item unticked and unrecorded, none removed,
-- activity bumped, no shop_sessions or location_checkoffs row written.
-- ---------------------------------------------------------------------------

update public.list_items set recorded_at = now()
where id = '90000000-0000-4000-8000-000000005842';
update public.lists set last_activity_at = '2000-01-01'
where id = '70000000-0000-4000-8000-000000000584';
insert into snap values
  ('sessions_all', (select count(*) from public.shop_sessions)),
  ('checkoffs_all', (select count(*) from public.location_checkoffs));

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5d1","role":"authenticated"}', true);
set local role authenticated;

select public.reset_list('70000000-0000-4000-8000-000000000584');

reset role;

do $$
begin
  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000000584'
        and checked_at is null and recorded_at is null and deleted_at is null) <> 2 then
    raise exception 'FAIL: after reset_list both items of list 4 must be unticked, unrecorded and present';
  end if;

  if (select last_activity_at from public.lists
      where id = '70000000-0000-4000-8000-000000000584') <= '2000-01-01' then
    raise exception 'FAIL: reset_list did not bump last_activity_at';
  end if;

  if (select count(*) from public.shop_sessions) <> (select v from snap where k = 'sessions_all') then
    raise exception 'FAIL: reset_list wrote a shop_sessions row';
  end if;

  if (select count(*) from public.location_checkoffs) <> (select v from snap where k = 'checkoffs_all') then
    raise exception 'FAIL: reset_list wrote a location_checkoffs row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 17 -- reset_list again: nothing is ticked, so it must raise
-- nothing_to_reset (not nothing_checked, which is finish-only).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.reset_list('70000000-0000-4000-8000-000000000584');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'nothing_to_reset' then
    raise exception 'FAIL: a second reset_list raised % (null = no error), expected nothing_to_reset', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 18 -- reset_list authorisation. B (stranger) must get
-- list_not_found on list 4.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5b1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.reset_list('70000000-0000-4000-8000-000000000584');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'list_not_found' then
    raise exception 'FAIL: stranger B''s reset_list raised % (null = no error), expected list_not_found', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 19 -- function catalogue. No finish_shopping overload has a default
-- argument (PGRST203: a default would make {p_list_id} match both overloads and
-- break the live one-argument call). anon may not execute, authenticated may,
-- for both finish_shopping(uuid, text) and reset_list(uuid).
-- ---------------------------------------------------------------------------

do $$
begin
  if (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'finish_shopping'
        and p.pronargdefaults > 0) <> 0 then
    raise exception 'FAIL: a finish_shopping overload has a default argument (PGRST203 risk)';
  end if;

  if has_function_privilege('anon', 'public.finish_shopping(uuid, text)', 'execute') then
    raise exception 'FAIL: anon can execute finish_shopping(uuid, text)';
  end if;
  if not has_function_privilege('authenticated', 'public.finish_shopping(uuid, text)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute finish_shopping(uuid, text)';
  end if;

  if has_function_privilege('anon', 'public.reset_list(uuid)', 'execute') then
    raise exception 'FAIL: anon can execute reset_list(uuid)';
  end if;
  if not has_function_privilege('authenticated', 'public.reset_list(uuid)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute reset_list(uuid)';
  end if;
end $$;

rollback;
