-- RLS/grant/behaviour tests for list_items.quantity, public.adjust_item_quantity,
-- public.add_list_item and the quantity arrays written by public.finish_shopping
-- (issue #111 -- item quantity).
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor (or the MCP
-- `execute_sql` tool) against project chacavfoewyiwrfgvxtj. It needs the schema of
-- 20261006000000_item_quantity.sql, so run it only AFTER that migration is
-- applied. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- WHAT IT GUARDS. 1 defaults to 1. 2 the 1..99 check on direct writes. 3-7
-- adjust_item_quantity: owner and household member succeed, a stranger and a
-- personal list do not, clamping, sequential deltas, invalid deltas, auth.
-- 8-10 add_list_item: insert, normalised bump keeping the existing spelling, a
-- bump unticks and unrecords, soft-deleted items are not bumped, the 99 cap,
-- invisible or removed lists and bad names. 11-12 finish_shopping writes
-- quantity arrays aligned with the names arrays and quantities survive Done and
-- reset_list; a Continue then a second finish records only new ticks. 13 the
-- check-off record stays names-only. 14 the shop_sessions array checks. 15 the
-- function and column catalogue.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as the
-- owning role, which bypasses RLS (the INSERT guard triggers still fire for it, so
-- recorded_at is set afterwards by UPDATE). Only the assertions run as
-- `authenticated`. `request.jwt.claims` must be set *before* the role switch.
-- State carries forward between assertions: they are not independent and must not
-- be reordered.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. Household H has members A (owns every list below) and D (same
-- household, owns none). Stranger B shares nothing. One location L.
--
-- L1 household list: item1, item2 (default quantity), item3 (ticked),
--    item4 (soft-deleted).                                   (adjust tests)
-- L2 personal list of A: p1.                                 (personal list)
-- L3 household list at L: Apples (3, ticked 2nd), Pears (2), Plums (5, ticked
--    1st), so checked_at order differs from position order.
--                                                             (finish, done)
-- L4 household list at L: Rice (4, ticked), Beans (6), Oats (2).
--                                                             (finish, continue)
-- L5 removed household list: one item.                       (list_not_found)
-- L6 household list: Milk, Tea (ticked + recorded), Soap (soft-deleted),
--    Salt (99).                                              (add tests)
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000f6a1', true),  -- A: owns every list
  ('00000000-0000-4000-8000-00000000f6d1', true),  -- D: same household as A
  ('00000000-0000-4000-8000-00000000f6b1', true);  -- B: stranger

insert into public.households (id, name) values
  ('50000000-0000-4000-8000-000000000111', 'Test Household (item_quantity)');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-00000000f6a1', '50000000-0000-4000-8000-000000000111'),
  ('00000000-0000-4000-8000-00000000f6d1', '50000000-0000-4000-8000-000000000111');

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('81000000-0000-4000-8000-000000000111',
   'Test Supermarket (item_quantity)', -36.8485, 174.7633, 'new_world',
   '00000000-0000-4000-8000-00000000f6a1');

insert into public.lists (id, owner_id, household_id, location_id, name, deleted_at) values
  ('70000000-0000-4000-8000-000000001101',
   '00000000-0000-4000-8000-00000000f6a1', '50000000-0000-4000-8000-000000000111',
   null, 'L1 (adjust)', null),
  ('70000000-0000-4000-8000-000000001102',
   '00000000-0000-4000-8000-00000000f6a1', null,
   null, 'L2 (personal)', null),
  ('70000000-0000-4000-8000-000000001103',
   '00000000-0000-4000-8000-00000000f6a1', '50000000-0000-4000-8000-000000000111',
   '81000000-0000-4000-8000-000000000111', 'L3 (done)', null),
  ('70000000-0000-4000-8000-000000001104',
   '00000000-0000-4000-8000-00000000f6a1', '50000000-0000-4000-8000-000000000111',
   '81000000-0000-4000-8000-000000000111', 'L4 (continue)', null),
  ('70000000-0000-4000-8000-000000001105',
   '00000000-0000-4000-8000-00000000f6a1', '50000000-0000-4000-8000-000000000111',
   null, 'L5 (removed)', now()),
  ('70000000-0000-4000-8000-000000001106',
   '00000000-0000-4000-8000-00000000f6a1', '50000000-0000-4000-8000-000000000111',
   null, 'L6 (add)', null);

-- No quantity named: these rows must take the default (assertion 1).
insert into public.list_items (id, list_id, name, position, checked_at, deleted_at) values
  ('90000000-0000-4000-8000-000000110101', '70000000-0000-4000-8000-000000001101',
   'item1', 'a0', null, null),
  ('90000000-0000-4000-8000-000000110102', '70000000-0000-4000-8000-000000001101',
   'item2', 'a1', null, null),
  ('90000000-0000-4000-8000-000000110103', '70000000-0000-4000-8000-000000001101',
   'item3', 'a2', now(), null),
  ('90000000-0000-4000-8000-000000110104', '70000000-0000-4000-8000-000000001101',
   'item4', 'a3', null, now()),
  ('90000000-0000-4000-8000-000000110201', '70000000-0000-4000-8000-000000001102',
   'p1', 'a0', null, null);

insert into public.list_items (id, list_id, name, position, quantity, checked_at, deleted_at) values
  ('90000000-0000-4000-8000-000000110301', '70000000-0000-4000-8000-000000001103',
   'Apples', 'a0', 3, now() - interval '1 minute', null),
  ('90000000-0000-4000-8000-000000110302', '70000000-0000-4000-8000-000000001103',
   'Pears', 'a1', 2, null, null),
  ('90000000-0000-4000-8000-000000110303', '70000000-0000-4000-8000-000000001103',
   'Plums', 'a2', 5, now() - interval '2 minutes', null),
  ('90000000-0000-4000-8000-000000110401', '70000000-0000-4000-8000-000000001104',
   'Rice', 'a0', 4, now(), null),
  ('90000000-0000-4000-8000-000000110402', '70000000-0000-4000-8000-000000001104',
   'Beans', 'a1', 6, null, null),
  ('90000000-0000-4000-8000-000000110403', '70000000-0000-4000-8000-000000001104',
   'Oats', 'a2', 2, null, null),
  ('90000000-0000-4000-8000-000000110501', '70000000-0000-4000-8000-000000001105',
   'Gone', 'a0', 1, null, null),
  ('90000000-0000-4000-8000-000000110601', '70000000-0000-4000-8000-000000001106',
   'Milk', 'a0', 1, null, null),
  ('90000000-0000-4000-8000-000000110602', '70000000-0000-4000-8000-000000001106',
   'Tea', 'a1', 1, now(), null),
  ('90000000-0000-4000-8000-000000110603', '70000000-0000-4000-8000-000000001106',
   'Soap', 'a2', 1, null, now()),
  ('90000000-0000-4000-8000-000000110604', '70000000-0000-4000-8000-000000001106',
   'Salt', 'a3', 99, null, null);

-- Tea is ticked AND recorded (the insert guard nulled recorded_at; updating
-- recorded_at alone does not fire the checked_at trigger).
update public.list_items set recorded_at = now()
where id = '90000000-0000-4000-8000-000000110602';

-- ---------------------------------------------------------------------------
-- Assertion 1 -- default. Rows inserted without a quantity hold 1; a new row
-- inserted by the client (A, direct insert, no quantity) also holds 1.
-- ---------------------------------------------------------------------------

do $$
begin
  if (select count(*) from public.list_items
      where id in ('90000000-0000-4000-8000-000000110101',
                   '90000000-0000-4000-8000-000000110102',
                   '90000000-0000-4000-8000-000000110103',
                   '90000000-0000-4000-8000-000000110104',
                   '90000000-0000-4000-8000-000000110201')
        and quantity = 1) <> 5 then
    raise exception 'FAIL: fixture rows inserted without a quantity do not all hold 1';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  q int;
begin
  insert into public.list_items (list_id, name, position)
  values ('70000000-0000-4000-8000-000000001101', 'item5', 'a4')
  returning quantity into q;

  if q is distinct from 1 then
    raise exception 'FAIL: a client insert without a quantity stored %, expected 1', q;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 -- range check on direct writes. As A, UPDATE quantity to 0 and to
-- 100 must each fail with a check violation (23514), and so must an INSERT with
-- quantity 100. A legal direct UPDATE (to 7) works, proving the column grant.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  st text;
begin
  st := null;
  begin
    update public.list_items set quantity = 0
    where id = '90000000-0000-4000-8000-000000110102';
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23514' then
    raise exception 'FAIL: UPDATE quantity = 0 gave sqlstate % (null = no error), expected 23514', st;
  end if;

  st := null;
  begin
    update public.list_items set quantity = 100
    where id = '90000000-0000-4000-8000-000000110102';
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23514' then
    raise exception 'FAIL: UPDATE quantity = 100 gave sqlstate % (null = no error), expected 23514', st;
  end if;

  st := null;
  begin
    insert into public.list_items (list_id, name, position, quantity)
    values ('70000000-0000-4000-8000-000000001101', 'too many', 'a9', 100);
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23514' then
    raise exception 'FAIL: INSERT quantity = 100 gave sqlstate % (null = no error), expected 23514', st;
  end if;

  update public.list_items set quantity = 7
  where id = '90000000-0000-4000-8000-000000110102';
end $$;

reset role;

do $$
begin
  if (select quantity from public.list_items
      where id = '90000000-0000-4000-8000-000000110102') <> 7 then
    raise exception 'FAIL: a legal direct UPDATE of quantity did not stick (column grant missing?)';
  end if;
end $$;

-- Put item2 back to 1 so later assertions start from known values.
update public.list_items set quantity = 1
where id = '90000000-0000-4000-8000-000000110102';

-- ---------------------------------------------------------------------------
-- Assertion 3 -- adjust by owner and by household member. A +1 on item1 gives 2;
-- D (household member who does not own the list) +1 gives 3.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  q int;
begin
  q := public.adjust_item_quantity('90000000-0000-4000-8000-000000110101', 1);
  if q is distinct from 2 then
    raise exception 'FAIL: owner adjust +1 on item1 returned %, expected 2', q;
  end if;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  q int;
begin
  q := public.adjust_item_quantity('90000000-0000-4000-8000-000000110101', 1);
  if q is distinct from 3 then
    raise exception 'FAIL: household member D adjust +1 on item1 returned %, expected 3', q;
  end if;
end $$;

reset role;

do $$
begin
  if (select quantity from public.list_items
      where id = '90000000-0000-4000-8000-000000110101') <> 3 then
    raise exception 'FAIL: item1 stored quantity is not 3 after two adjusts';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 4 -- stranger. B adjusting item1 must raise item_not_found and leave
-- the value unchanged (read through the bypass role). A soft-deleted item is
-- also item_not_found, even for the owner.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6b1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.adjust_item_quantity('90000000-0000-4000-8000-000000110101', 1);
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'item_not_found' then
    raise exception 'FAIL: stranger B adjust raised % (null = no error), expected item_not_found', msg;
  end if;
end $$;

reset role;

do $$
begin
  if (select quantity from public.list_items
      where id = '90000000-0000-4000-8000-000000110101') <> 3 then
    raise exception 'FAIL: stranger B changed item1''s quantity';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.adjust_item_quantity('90000000-0000-4000-8000-000000110104', 1);
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'item_not_found' then
    raise exception 'FAIL: adjusting a soft-deleted item raised % (null = no error), expected item_not_found', msg;
  end if;

  msg := null;
  begin
    perform public.adjust_item_quantity('90000000-0000-4000-8000-0000000fffff', 1);
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'item_not_found' then
    raise exception 'FAIL: adjusting a nonexistent item raised % (null = no error), expected item_not_found', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 -- personal list. D is in A's household but p1 sits on A's
-- personal list (household_id null), so D must get item_not_found and p1 stays 1.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.adjust_item_quantity('90000000-0000-4000-8000-000000110201', 1);
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'item_not_found' then
    raise exception 'FAIL: household member D adjusting a personal list item raised % (null = no error), expected item_not_found', msg;
  end if;
end $$;

reset role;

do $$
begin
  if (select quantity from public.list_items
      where id = '90000000-0000-4000-8000-000000110201') <> 1 then
    raise exception 'FAIL: D changed the quantity of an item on a personal list';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 6 -- clamping and sequential deltas. item2 at 99: +1 stays 99.
-- item2 at 1: -1 stays 1. item3 (1): +1 then +1 gives 2 then 3.
-- ---------------------------------------------------------------------------

update public.list_items set quantity = 99
where id = '90000000-0000-4000-8000-000000110102';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  q int;
begin
  q := public.adjust_item_quantity('90000000-0000-4000-8000-000000110102', 1);
  if q is distinct from 99 then
    raise exception 'FAIL: 99 + 1 returned %, expected the clamp 99', q;
  end if;
end $$;

reset role;

update public.list_items set quantity = 1
where id = '90000000-0000-4000-8000-000000110102';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  q int;
begin
  q := public.adjust_item_quantity('90000000-0000-4000-8000-000000110102', -1);
  if q is distinct from 1 then
    raise exception 'FAIL: 1 - 1 returned %, expected the clamp 1', q;
  end if;

  q := public.adjust_item_quantity('90000000-0000-4000-8000-000000110103', 1);
  if q is distinct from 2 then
    raise exception 'FAIL: item3 first +1 returned %, expected 2', q;
  end if;

  q := public.adjust_item_quantity('90000000-0000-4000-8000-000000110103', 1);
  if q is distinct from 3 then
    raise exception 'FAIL: item3 second +1 returned %, expected 3 (deltas must stack)', q;
  end if;
end $$;

reset role;

do $$
begin
  if (select quantity from public.list_items
      where id = '90000000-0000-4000-8000-000000110103') <> 3 then
    raise exception 'FAIL: item3 stored quantity is not 3 after two +1';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 7 -- invalid delta and auth. 0, null, 99 and -99 raise invalid_delta
-- and change nothing; 98 and -98 are accepted (boundary). With no auth.uid() the
-- call raises not_authenticated.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
  d int;
  q int;
begin
  foreach d in array array[0, 99, -99, -2147483648] loop
    msg := null;
    begin
      perform public.adjust_item_quantity('90000000-0000-4000-8000-000000110103', d);
    exception when others then
      msg := sqlerrm;
    end;
    if msg is distinct from 'invalid_delta' then
      raise exception 'FAIL: adjust with delta % raised % (null = no error), expected invalid_delta', d, msg;
    end if;
  end loop;

  msg := null;
  begin
    perform public.adjust_item_quantity('90000000-0000-4000-8000-000000110103', null);
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'invalid_delta' then
    raise exception 'FAIL: adjust with a null delta raised % (null = no error), expected invalid_delta', msg;
  end if;

  q := public.adjust_item_quantity('90000000-0000-4000-8000-000000110103', 98);
  if q is distinct from 99 then
    raise exception 'FAIL: 3 + 98 returned %, expected 99 (|delta| = 98 is allowed)', q;
  end if;

  q := public.adjust_item_quantity('90000000-0000-4000-8000-000000110103', -98);
  if q is distinct from 1 then
    raise exception 'FAIL: 99 - 98 returned %, expected 1', q;
  end if;
end $$;

reset role;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.adjust_item_quantity('90000000-0000-4000-8000-000000110101', 1);
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'not_authenticated' then
    raise exception 'FAIL: adjust with no auth.uid() raised % (null = no error), expected not_authenticated', msg;
  end if;

  msg := null;
  begin
    perform public.add_list_item('70000000-0000-4000-8000-000000001106', 'Milk', 'z0');
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'not_authenticated' then
    raise exception 'FAIL: add_list_item with no auth.uid() raised % (null = no error), expected not_authenticated', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 8 -- add_list_item, new name and normalised bump. On L6 (Milk, 1):
-- a new name 'Butter' inserts at quantity 1, bumped false, capped false. Then
-- ' milk ' bumps the existing 'Milk' to 2 and returns its own spelling 'Milk'
-- with the existing item's id, bumped true, and no second Milk row appears.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.add_list_item('70000000-0000-4000-8000-000000001106', '  Butter ', 'b0');
  if r.name is distinct from 'Butter' or r.quantity is distinct from 1
     or r.bumped is distinct from false or r.capped is distinct from false then
    raise exception 'FAIL: new name returned (name=%, quantity=%, bumped=%, capped=%), expected (Butter, 1, false, false)',
      r.name, r.quantity, r.bumped, r.capped;
  end if;

  select * into r from public.add_list_item('70000000-0000-4000-8000-000000001106', ' milk ', 'b1');
  if r.item_id is distinct from '90000000-0000-4000-8000-000000110601'::uuid
     or r.name is distinct from 'Milk' or r.quantity is distinct from 2
     or r.bumped is distinct from true or r.capped is distinct from false then
    raise exception 'FAIL: '' milk '' returned (item_id=%, name=%, quantity=%, bumped=%, capped=%), expected (the existing Milk, Milk, 2, true, false)',
      r.item_id, r.name, r.quantity, r.bumped, r.capped;
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000001106'
        and deleted_at is null and lower(btrim(name)) = 'milk') <> 1 then
    raise exception 'FAIL: bumping '' milk '' created a second Milk row';
  end if;

  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000001106'
        and deleted_at is null and name = 'Butter' and quantity = 1) <> 1 then
    raise exception 'FAIL: the new item was not stored as one trimmed Butter row at quantity 1';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 9 -- bump side effects, soft-deleted names and the cap.
--  (a) Bumping Tea (ticked and recorded) leaves checked_at and recorded_at null
--      and quantity 2.
--  (b) 'soap' does not bump the soft-deleted Soap: a NEW live row is inserted and
--      the old row stays removed at quantity 1.
--  (c) 'salt' on Salt at 99 returns quantity 99, capped true, bumped true.
--  (d) D (household member) may add: 'MILK' bumps Milk to 3.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.add_list_item('70000000-0000-4000-8000-000000001106', 'TEA', 'b2');
  if r.item_id is distinct from '90000000-0000-4000-8000-000000110602'::uuid
     or r.quantity is distinct from 2 or r.bumped is distinct from true then
    raise exception 'FAIL: bumping Tea returned (item_id=%, quantity=%, bumped=%), expected (Tea, 2, true)',
      r.item_id, r.quantity, r.bumped;
  end if;

  select * into r from public.add_list_item('70000000-0000-4000-8000-000000001106', 'soap', 'b3');
  if r.bumped is distinct from false or r.quantity is distinct from 1
     or r.item_id = '90000000-0000-4000-8000-000000110603'::uuid then
    raise exception 'FAIL: adding ''soap'' returned (item_id=%, quantity=%, bumped=%), expected a NEW row at 1, bumped false',
      r.item_id, r.quantity, r.bumped;
  end if;

  select * into r from public.add_list_item('70000000-0000-4000-8000-000000001106', 'salt', 'b4');
  if r.quantity is distinct from 99 or r.capped is distinct from true
     or r.bumped is distinct from true
     or r.item_id is distinct from '90000000-0000-4000-8000-000000110604'::uuid then
    raise exception 'FAIL: adding ''salt'' at 99 returned (item_id=%, quantity=%, bumped=%, capped=%), expected (Salt, 99, true, true)',
      r.item_id, r.quantity, r.bumped, r.capped;
  end if;
end $$;

reset role;

do $$
begin
  if (select checked_at is null and recorded_at is null and quantity = 2
      from public.list_items
      where id = '90000000-0000-4000-8000-000000110602') is not true then
    raise exception 'FAIL: bumping a ticked and recorded item must leave checked_at and recorded_at null and quantity 2';
  end if;

  if (select count(*) from public.list_items
      where id = '90000000-0000-4000-8000-000000110603'
        and deleted_at is not null and quantity = 1) <> 1 then
    raise exception 'FAIL: the soft-deleted Soap row was changed or revived';
  end if;

  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000001106'
        and deleted_at is null and lower(btrim(name)) = 'soap') <> 1 then
    raise exception 'FAIL: adding ''soap'' did not produce exactly one live Soap row';
  end if;

  if (select quantity from public.list_items
      where id = '90000000-0000-4000-8000-000000110604') <> 99 then
    raise exception 'FAIL: Salt did not stay at 99';
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.add_list_item('70000000-0000-4000-8000-000000001106', 'MILK', 'b5');
  if r.quantity is distinct from 3 or r.bumped is distinct from true or r.name is distinct from 'Milk' then
    raise exception 'FAIL: household member D adding MILK returned (name=%, quantity=%, bumped=%), expected (Milk, 3, true)',
      r.name, r.quantity, r.bumped;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 10 -- list visibility and name validation. A removed list, a list the
-- caller cannot see (stranger B on L6) and a nonexistent list all raise
-- list_not_found; empty, whitespace-only, null and 121-character names raise
-- invalid_name (checked before the list lookup), and a 120-character name works.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
  n text;
  r record;
begin
  begin
    perform public.add_list_item('70000000-0000-4000-8000-000000001105', 'Gone', 'c0');
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'list_not_found' then
    raise exception 'FAIL: add to a removed list raised % (null = no error), expected list_not_found', msg;
  end if;

  msg := null;
  begin
    perform public.add_list_item('70000000-0000-4000-8000-0000000fffff', 'Nothing', 'c0');
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'list_not_found' then
    raise exception 'FAIL: add to a nonexistent list raised % (null = no error), expected list_not_found', msg;
  end if;

  -- Position is validated on the insert path only (null or empty).
  foreach n in array array['', 'x'] loop
    msg := null;
    begin
      perform public.add_list_item('70000000-0000-4000-8000-000000001106',
        'Brand new item', case when n = '' then '' else null end);
    exception when others then
      msg := sqlerrm;
    end;
    if msg is distinct from 'invalid_position' then
      raise exception 'FAIL: add of a new item with a % position raised % (null = no error), expected invalid_position',
        case when n = '' then 'empty' else 'null' end, msg;
    end if;
  end loop;

  -- A bump ignores the position, so a null position on an existing name works.
  select * into r from public.add_list_item('70000000-0000-4000-8000-000000001106', 'milk', null);
  if r.bumped is distinct from true then
    raise exception 'FAIL: bumping an existing name with a null position should succeed';
  end if;

  foreach n in array array['', '   ', repeat('x', 121)] loop
    msg := null;
    begin
      perform public.add_list_item('70000000-0000-4000-8000-000000001106', n, 'c0');
    exception when others then
      msg := sqlerrm;
    end;
    if msg is distinct from 'invalid_name' then
      raise exception 'FAIL: add with a % character name raised % (null = no error), expected invalid_name',
        length(n), msg;
    end if;
  end loop;

  msg := null;
  begin
    perform public.add_list_item('70000000-0000-4000-8000-000000001106', null, 'c0');
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'invalid_name' then
    raise exception 'FAIL: add with a null name raised % (null = no error), expected invalid_name', msg;
  end if;

  select * into r from public.add_list_item('70000000-0000-4000-8000-000000001106', repeat('y', 120), 'c1');
  if r.bumped is distinct from false or length(r.name) <> 120 then
    raise exception 'FAIL: a 120-character name should insert (bumped=%, length=%)', r.bumped, length(r.name);
  end if;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6b1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.add_list_item('70000000-0000-4000-8000-000000001106', 'Milk', 'c0');
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'list_not_found' then
    raise exception 'FAIL: stranger B adding to L6 raised % (null = no error), expected list_not_found', msg;
  end if;
end $$;

reset role;

do $$
begin
  if (select quantity from public.list_items
      where id = '90000000-0000-4000-8000-000000110601') <> 4 then
    raise exception 'FAIL: a rejected add changed Milk''s quantity (expected 4: 3 after D, +1 from the null-position bump)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 11 -- finish_shopping 'done' writes the quantity arrays. L3 holds
-- Apples (3, ticked second), Pears (2), Plums (5, ticked first). Expect
-- item_names {Apples,Pears,Plums} with item_quantities {3,2,5} and
-- checked_item_names {Plums,Apples} with checked_item_quantities {5,3}: each
-- pair index-aligned and in the same order. After Done the quantities survive and
-- every item is unticked.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000001103', 'done');
  if r.checked_count <> 2 or r.total_count <> 3 then
    raise exception 'FAIL: done on L3 returned (checked_count=%, total_count=%), expected (2, 3)',
      r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
declare
  s record;
begin
  select * into s from public.shop_sessions
  where list_id = '70000000-0000-4000-8000-000000001103';

  if not found then
    raise exception 'FAIL: no shop_sessions row for L3';
  end if;

  if s.item_names <> array['Apples', 'Pears', 'Plums']
     or s.item_quantities is distinct from array[3, 2, 5] then
    raise exception 'FAIL: L3 session item_names / item_quantities are % / %, expected {Apples,Pears,Plums} / {3,2,5}',
      s.item_names, s.item_quantities;
  end if;

  if s.checked_item_names <> array['Plums', 'Apples']
     or s.checked_item_quantities is distinct from array[5, 3] then
    raise exception 'FAIL: L3 session checked_item_names / checked_item_quantities are % / %, expected {Plums,Apples} / {5,3}',
      s.checked_item_names, s.checked_item_quantities;
  end if;

  if cardinality(s.item_names) <> cardinality(s.item_quantities)
     or cardinality(s.checked_item_names) <> cardinality(s.checked_item_quantities) then
    raise exception 'FAIL: L3 session quantity arrays are not the same length as their names arrays';
  end if;

  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000001103'
        and deleted_at is null and checked_at is null and recorded_at is null
        and ((name = 'Apples' and quantity = 3)
          or (name = 'Pears' and quantity = 2)
          or (name = 'Plums' and quantity = 5))) <> 3 then
    raise exception 'FAIL: after Done, L3 items must be unticked with their quantities (3, 2, 5) intact';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 12 -- Continue, then a second finish. L4: Rice (4, ticked), Beans
-- (6), Oats (2). First Continue session: item_names {Rice,Beans,Oats} with
-- {4,6,2}, checked {Rice} with {4}. Then A bumps Beans to 7 and ticks it; the
-- second Continue session holds only the round's unrecorded items:
-- item_names {Beans,Oats} with {7,2} and checked {Beans} with {7}. Then
-- reset_list (every tick now recorded) unticks everything and quantities
-- 4, 7, 2 survive.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

select * from public.finish_shopping('70000000-0000-4000-8000-000000001104', 'continue');

reset role;

do $$
declare
  s record;
begin
  select * into s from public.shop_sessions
  where list_id = '70000000-0000-4000-8000-000000001104'
    and checked_item_names = array['Rice'];

  if not found then
    raise exception 'FAIL: no L4 session with checked_item_names {Rice}';
  end if;

  if s.item_names <> array['Rice', 'Beans', 'Oats']
     or s.item_quantities is distinct from array[4, 6, 2]
     or s.checked_item_quantities is distinct from array[4] then
    raise exception 'FAIL: L4 first session is (%, %, %), expected ({Rice,Beans,Oats}, {4,6,2}, {4})',
      s.item_names, s.item_quantities, s.checked_item_quantities;
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  q int;
begin
  q := public.adjust_item_quantity('90000000-0000-4000-8000-000000110402', 1);
  if q is distinct from 7 then
    raise exception 'FAIL: Beans 6 + 1 returned %, expected 7', q;
  end if;
end $$;

update public.list_items set checked_at = now()
where id = '90000000-0000-4000-8000-000000110402';

select * from public.finish_shopping('70000000-0000-4000-8000-000000001104', 'continue');

reset role;

do $$
declare
  s record;
begin
  select * into s from public.shop_sessions
  where list_id = '70000000-0000-4000-8000-000000001104'
    and checked_item_names = array['Beans'];

  if not found then
    raise exception 'FAIL: no L4 session with checked_item_names {Beans}';
  end if;

  if s.item_names <> array['Beans', 'Oats']
     or s.item_quantities is distinct from array[7, 2]
     or s.checked_item_quantities is distinct from array[7] then
    raise exception 'FAIL: L4 second session is (%, %, %), expected ({Beans,Oats}, {7,2}, {7}): only this round''s new ticks',
      s.item_names, s.item_quantities, s.checked_item_quantities;
  end if;
end $$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f6d1","role":"authenticated"}', true);
set local role authenticated;

select public.reset_list('70000000-0000-4000-8000-000000001104');

reset role;

do $$
begin
  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000001104'
        and deleted_at is null and checked_at is null and recorded_at is null
        and ((name = 'Rice' and quantity = 4)
          or (name = 'Beans' and quantity = 7)
          or (name = 'Oats' and quantity = 2))) <> 3 then
    raise exception 'FAIL: after reset_list, L4 items must be unticked with quantities 4, 7, 2 intact';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 13 -- the check-off record stays names-only. location_checkoffs has
-- no quantity-like column, and every row written for location L (L3 done, L4's
-- two Continue finishes) holds exactly the normalised ticked names, with no
-- quantity data and no un-normalised spelling.
-- ---------------------------------------------------------------------------

do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'location_checkoffs'
        and column_name ilike '%quant%') <> 0 then
    raise exception 'FAIL: location_checkoffs gained a quantity column (ADR 0002: names only)';
  end if;

  if (select count(*) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000111') <> 3 then
    raise exception 'FAIL: expected 3 location_checkoffs rows for the fixture location (L3 done, L4 twice)';
  end if;

  if (select count(*) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000111'
        and item_names in (array['plums', 'apples'], array['rice'], array['beans'])) <> 3 then
    raise exception 'FAIL: location_checkoffs rows are not exactly the normalised ticked names';
  end if;

  if exists (
    select 1
    from public.location_checkoffs c, unnest(c.item_names) as n
    where c.location_id = '81000000-0000-4000-8000-000000000111'
      and n <> lower(btrim(n))
  ) then
    raise exception 'FAIL: location_checkoffs holds an un-normalised item name';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 14 -- shop_sessions array checks, exercised as the owning role (the
-- table's client INSERT grant was revoked by finish_shopping's migration; the
-- constraints apply to every writer). Rejected with check_violation (23514):
-- mismatched cardinality (either array), a value of 0 or 100, a null element.
-- Accepted: aligned arrays, and null arrays (how pre-quantity rows look).
-- ---------------------------------------------------------------------------

do $$
declare
  st text;
begin
  st := null;
  begin
    insert into public.shop_sessions (owner_id, location_id, item_names, checked_item_names, item_quantities)
    values ('00000000-0000-4000-8000-00000000f6a1', '81000000-0000-4000-8000-000000000111',
            array['a', 'b'], array['a'], array[1]);
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23514' then
    raise exception 'FAIL: mismatched item_quantities cardinality gave sqlstate % (null = accepted), expected 23514', st;
  end if;

  st := null;
  begin
    insert into public.shop_sessions (owner_id, location_id, item_names, checked_item_names, checked_item_quantities)
    values ('00000000-0000-4000-8000-00000000f6a1', '81000000-0000-4000-8000-000000000111',
            array['a', 'b'], array['a'], array[1, 2]);
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23514' then
    raise exception 'FAIL: mismatched checked_item_quantities cardinality gave sqlstate % (null = accepted), expected 23514', st;
  end if;

  st := null;
  begin
    insert into public.shop_sessions (owner_id, location_id, item_names, checked_item_names, item_quantities)
    values ('00000000-0000-4000-8000-00000000f6a1', '81000000-0000-4000-8000-000000000111',
            array['a'], array['a'], array[100]);
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23514' then
    raise exception 'FAIL: item_quantities value 100 gave sqlstate % (null = accepted), expected 23514', st;
  end if;

  st := null;
  begin
    insert into public.shop_sessions (owner_id, location_id, item_names, checked_item_names, checked_item_quantities)
    values ('00000000-0000-4000-8000-00000000f6a1', '81000000-0000-4000-8000-000000000111',
            array['a'], array['a'], array[0]);
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23514' then
    raise exception 'FAIL: checked_item_quantities value 0 gave sqlstate % (null = accepted), expected 23514', st;
  end if;

  st := null;
  begin
    insert into public.shop_sessions (owner_id, location_id, item_names, checked_item_names, item_quantities)
    values ('00000000-0000-4000-8000-00000000f6a1', '81000000-0000-4000-8000-000000000111',
            array['a', 'b'], array['a'], array[1, null]::integer[]);
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23514' then
    raise exception 'FAIL: a null element in item_quantities gave sqlstate % (null = accepted), expected 23514', st;
  end if;

  -- Accepted shapes.
  insert into public.shop_sessions (owner_id, location_id, item_names, checked_item_names, item_quantities, checked_item_quantities)
  values ('00000000-0000-4000-8000-00000000f6a1', '81000000-0000-4000-8000-000000000111',
          array['a', 'b'], array['a'], array[1, 99], array[1]);

  insert into public.shop_sessions (owner_id, location_id, item_names, checked_item_names)
  values ('00000000-0000-4000-8000-00000000f6a1', '81000000-0000-4000-8000-000000000111',
          array['a', 'b'], array['a']);
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 15 -- catalogue. Both new RPCs: security invoker (prosecdef false),
-- no argument defaults (PGRST203), one overload each; authenticated may execute,
-- anon may not. finish_shopping is still a single overload, no defaults, still
-- executable by authenticated and not by anon. authenticated may UPDATE
-- list_items.quantity and may not UPDATE recorded_at.
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array['adjust_item_quantity', 'add_list_item'] loop
    if (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = fn) <> 1 then
      raise exception 'FAIL: % must have exactly one overload', fn;
    end if;

    if (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = fn
          and (p.prosecdef or p.pronargdefaults > 0)) <> 0 then
      raise exception 'FAIL: % is security definer or has a default argument', fn;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.adjust_item_quantity(uuid, integer)', 'execute') then
    raise exception 'FAIL: anon can execute adjust_item_quantity';
  end if;
  if not has_function_privilege('authenticated', 'public.adjust_item_quantity(uuid, integer)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute adjust_item_quantity';
  end if;

  if has_function_privilege('anon', 'public.add_list_item(uuid, text, text)', 'execute') then
    raise exception 'FAIL: anon can execute add_list_item';
  end if;
  if not has_function_privilege('authenticated', 'public.add_list_item(uuid, text, text)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute add_list_item';
  end if;

  if (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'finish_shopping') <> 1 then
    raise exception 'FAIL: finish_shopping must still be a single overload';
  end if;

  if (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'finish_shopping'
        and p.pronargdefaults > 0) <> 0 then
    raise exception 'FAIL: finish_shopping gained a default argument (PGRST203 risk)';
  end if;

  if has_function_privilege('anon', 'public.finish_shopping(uuid, text)', 'execute') then
    raise exception 'FAIL: anon can execute finish_shopping(uuid, text)';
  end if;
  if not has_function_privilege('authenticated', 'public.finish_shopping(uuid, text)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute finish_shopping(uuid, text)';
  end if;

  if not has_column_privilege('authenticated', 'public.list_items', 'quantity', 'UPDATE') then
    raise exception 'FAIL: authenticated cannot UPDATE list_items.quantity';
  end if;
  if has_column_privilege('authenticated', 'public.list_items', 'recorded_at', 'UPDATE') then
    raise exception 'FAIL: authenticated can UPDATE list_items.recorded_at';
  end if;
end $$;

rollback;
