-- Behaviour and catalogue tests for the list-side item-name fold: the unique index
-- list_items_live_name_key, the list_items_tidy_name trigger, the fold-aware
-- add_list_item and the folded check-off array of finish_shopping (issue #106,
-- Slice 3 -- migration 20261010000000_list_items_fold.sql).
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor (or the MCP
-- `execute_sql` tool) against project chacavfoewyiwrfgvxtj, AFTER the migration is
-- applied. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The file is wrapped in
-- `begin ... rollback` and leaves nothing behind. State carries forward between
-- assertions: they are not independent and must not be reordered.
--
-- WHAT IT GUARDS. 1 the index, the trigger and the paused-trigger state. 2 a
-- direct insert of a same-fold name is refused with 23505 naming the index, a
-- match against a soft-deleted row is not. 3 add_list_item bumps by fold and
-- returns the existing spelling. 4 direct inserts and renames are capitalised.
-- 5 a rename onto another live fold is refused, a case-only self rename works.
-- 6 empty-fold names are refused three ways, and a 120-character name that
-- capitalising lengthens fails the table check as a raw 23514 (documented
-- limit). 7 finish_shopping writes the folded name to location_checkoffs and the
-- stored spelling to shop_sessions. 8 the function and schema catalogue.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as the
-- owning role (which bypasses RLS; the triggers still fire). Only the assertions
-- run as `authenticated`. `request.jwt.claims` must be set *before* the role
-- switch. All non-ASCII text is written as U& escapes.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. Household H has member A (owns every list below). B is a stranger.
-- L1 household list: Milk, Jalape\00F1o, Soap (soft-deleted).
-- L2 household list at location LOC: Jalape\00F1o (ticked), Plain.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000f7a1', true),  -- A
  ('00000000-0000-4000-8000-00000000f7b1', true);  -- B: stranger

insert into public.households (id, name) values
  ('50000000-0000-4000-8000-000000000106', 'Test Household (item_name_fold_lists)');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-00000000f7a1', '50000000-0000-4000-8000-000000000106');

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('81000000-0000-4000-8000-000000000106',
   'Test Supermarket (item_name_fold_lists)', -36.8485, 174.7633, 'new_world',
   '00000000-0000-4000-8000-00000000f7a1');

insert into public.lists (id, owner_id, household_id, location_id, name) values
  ('70000000-0000-4000-8000-000000010601',
   '00000000-0000-4000-8000-00000000f7a1', '50000000-0000-4000-8000-000000000106',
   null, 'L1 (fold)'),
  ('70000000-0000-4000-8000-000000010602',
   '00000000-0000-4000-8000-00000000f7a1', '50000000-0000-4000-8000-000000000106',
   '81000000-0000-4000-8000-000000000106', 'L2 (finish)');

insert into public.list_items (id, list_id, name, position, deleted_at) values
  ('90000000-0000-4000-8000-000001060101', '70000000-0000-4000-8000-000000010601',
   'Milk', 'a0', null),
  ('90000000-0000-4000-8000-000001060102', '70000000-0000-4000-8000-000000010601',
   U&'Jalape\00F1o', 'a1', null),
  ('90000000-0000-4000-8000-000001060103', '70000000-0000-4000-8000-000000010601',
   'Soap', 'a2', now());

insert into public.list_items (id, list_id, name, position, checked_at) values
  ('90000000-0000-4000-8000-000001060201', '70000000-0000-4000-8000-000000010602',
   U&'Jalape\00F1o', 'a0', now()),
  ('90000000-0000-4000-8000-000001060202', '70000000-0000-4000-8000-000000010602',
   'Plain', 'a1', null);

-- ---------------------------------------------------------------------------
-- Assertion 1 -- structure. The unique partial index has exactly this name (the
-- client recognises the 23505 by it), is unique and partial, and is built on
-- fold_item_name. The tidy trigger is a row-level BEFORE INSERT OR UPDATE OF
-- name trigger and is enabled; every non-internal trigger on list_items is
-- enabled (the migration pauses two of them while it runs).
-- ---------------------------------------------------------------------------

do $$
declare
  def text;
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where c.relname = 'list_items_live_name_key'
      and c.relnamespace = 'public'::regnamespace
      and i.indrelid = 'public.list_items'::regclass
      and i.indisunique
      and i.indpred is not null
  ) then
    raise exception 'FAIL: list_items_live_name_key must exist as a unique partial index on public.list_items';
  end if;

  select indexdef into def from pg_indexes
  where schemaname = 'public' and indexname = 'list_items_live_name_key';

  if def not like '%fold_item_name%' or def not like '%deleted_at IS NULL%' then
    raise exception 'FAIL: list_items_live_name_key definition is %, expected fold_item_name and a deleted_at IS NULL predicate', def;
  end if;

  select pg_get_triggerdef(t.oid) into def
  from pg_trigger t
  where t.tgrelid = 'public.list_items'::regclass
    and t.tgname = 'list_items_tidy_name'
    and not t.tgisinternal;

  if def is null then
    raise exception 'FAIL: trigger list_items_tidy_name does not exist';
  end if;

  if def not like '%BEFORE INSERT OR UPDATE OF name%' or def not like '%FOR EACH ROW%' then
    raise exception 'FAIL: list_items_tidy_name is %, expected BEFORE INSERT OR UPDATE OF name FOR EACH ROW', def;
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.list_items'::regclass
      and not tgisinternal
      and tgenabled <> 'O'
  ) then
    raise exception 'FAIL: a trigger on public.list_items is not enabled';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 2 -- the index at work. As A, a direct insert of 'MILK' next to Milk
-- and of an NFD Jalapeno next to the NFC one must each fail with 23505 naming
-- list_items_live_name_key. 'soap' next to the SOFT-DELETED Soap succeeds (the
-- index is partial) and is stored capitalised.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f7a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  st text;
  cn text;
  stored text;
begin
  st := null; cn := null;
  begin
    insert into public.list_items (list_id, name, position)
    values ('70000000-0000-4000-8000-000000010601', 'MILK', 'b0');
  exception when others then
    get stacked diagnostics cn = constraint_name;
    st := sqlstate;
  end;
  if st is distinct from '23505' or cn is distinct from 'list_items_live_name_key' then
    raise exception 'FAIL: inserting MILK next to Milk gave (sqlstate %, constraint %), expected (23505, list_items_live_name_key)', st, cn;
  end if;

  st := null; cn := null;
  begin
    insert into public.list_items (list_id, name, position)
    values ('70000000-0000-4000-8000-000000010601', U&'jalapen\0303o', 'b1');
  exception when others then
    get stacked diagnostics cn = constraint_name;
    st := sqlstate;
  end;
  if st is distinct from '23505' or cn is distinct from 'list_items_live_name_key' then
    raise exception 'FAIL: inserting an NFD Jalapeno gave (sqlstate %, constraint %), expected (23505, list_items_live_name_key)', st, cn;
  end if;

  insert into public.list_items (list_id, name, position)
  values ('70000000-0000-4000-8000-000000010601', 'soap', 'b2')
  returning name into stored;
  if stored is distinct from 'Soap' then
    raise exception 'FAIL: inserting soap next to a soft-deleted Soap stored %, expected Soap', stored;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 -- add_list_item matches by fold. ' milk  ' bumps Milk to 2 and
-- returns Milk's own spelling and id; 'MILK' bumps it to 3; an NFD Jalapeno
-- bumps the NFC Jalape\00F1o and returns that spelling; at 99 the call returns
-- capped true and 99. A new name is stored capitalised.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f7a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.add_list_item('70000000-0000-4000-8000-000000010601', ' milk  ', 'c0');
  if r.item_id is distinct from '90000000-0000-4000-8000-000001060101'::uuid
     or r.name is distinct from 'Milk' or r.quantity is distinct from 2
     or r.bumped is distinct from true or r.capped is distinct from false then
    raise exception 'FAIL: '' milk '' returned (item_id=%, name=%, quantity=%, bumped=%, capped=%), expected (the Milk row, Milk, 2, true, false)',
      r.item_id, r.name, r.quantity, r.bumped, r.capped;
  end if;

  select * into r from public.add_list_item('70000000-0000-4000-8000-000000010601', 'MILK', 'c1');
  if r.item_id is distinct from '90000000-0000-4000-8000-000001060101'::uuid
     or r.quantity is distinct from 3 or r.bumped is distinct from true then
    raise exception 'FAIL: MILK returned (item_id=%, quantity=%, bumped=%), expected (the Milk row, 3, true)',
      r.item_id, r.quantity, r.bumped;
  end if;

  select * into r from public.add_list_item('70000000-0000-4000-8000-000000010601', U&'jalapen\0303o', 'c2');
  if r.item_id is distinct from '90000000-0000-4000-8000-000001060102'::uuid
     or r.name is distinct from U&'Jalape\00F1o'
     or r.quantity is distinct from 2 or r.bumped is distinct from true then
    raise exception 'FAIL: NFD Jalapeno returned (item_id=%, name=%, quantity=%, bumped=%), expected (the NFC row, its own spelling, 2, true)',
      r.item_id, r.name, r.quantity, r.bumped;
  end if;

  select * into r from public.add_list_item('70000000-0000-4000-8000-000000010601', 'eggs', 'c3');
  if r.name is distinct from 'Eggs' or r.bumped is distinct from false or r.quantity is distinct from 1 then
    raise exception 'FAIL: new name eggs returned (name=%, bumped=%, quantity=%), expected (Eggs, false, 1)',
      r.name, r.bumped, r.quantity;
  end if;
end $$;

reset role;

update public.list_items set quantity = 99
where id = '90000000-0000-4000-8000-000001060101';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f7a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.add_list_item('70000000-0000-4000-8000-000000010601', 'milk', 'c4');
  if r.quantity is distinct from 99 or r.capped is distinct from true or r.bumped is distinct from true then
    raise exception 'FAIL: milk at 99 returned (quantity=%, capped=%, bumped=%), expected (99, true, true)',
      r.quantity, r.capped, r.bumped;
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000010601'
        and deleted_at is null
        and public.fold_item_name(name) = 'milk') <> 1 then
    raise exception 'FAIL: bumping created a second Milk row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 4 -- the tidy trigger capitalises. A direct insert of 'bread' is
-- stored 'Bread'; renaming that row to 'butter' stores 'Butter'.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f7a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  stored text;
begin
  insert into public.list_items (id, list_id, name, position)
  values ('90000000-0000-4000-8000-000001060104', '70000000-0000-4000-8000-000000010601', 'bread', 'd0')
  returning name into stored;
  if stored is distinct from 'Bread' then
    raise exception 'FAIL: direct insert of bread stored %, expected Bread', stored;
  end if;

  update public.list_items set name = 'butter'
  where id = '90000000-0000-4000-8000-000001060104'
  returning name into stored;
  if stored is distinct from 'Butter' then
    raise exception 'FAIL: rename to butter stored %, expected Butter', stored;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 -- renames. Renaming Butter onto Milk's fold fails with 23505 and
-- leaves the name alone; a case-only rename of the row onto itself succeeds and
-- keeps the rest as typed.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f7a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  st text;
  cn text;
  stored text;
begin
  st := null; cn := null;
  begin
    update public.list_items set name = 'MILK'
    where id = '90000000-0000-4000-8000-000001060104';
  exception when others then
    get stacked diagnostics cn = constraint_name;
    st := sqlstate;
  end;
  if st is distinct from '23505' or cn is distinct from 'list_items_live_name_key' then
    raise exception 'FAIL: renaming Butter onto Milk gave (sqlstate %, constraint %), expected (23505, list_items_live_name_key)', st, cn;
  end if;

  update public.list_items set name = 'BUTTER'
  where id = '90000000-0000-4000-8000-000001060104'
  returning name into stored;
  if stored is distinct from 'BUTTER' then
    raise exception 'FAIL: case-only self rename stored %, expected BUTTER', stored;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 -- names with an empty fold. Only combining marks fold to ''. The
-- RPC, a direct insert and a rename each raise invalid_name. A 120-character name
-- starting with the sharp s passes the RPC length check, is lengthened by
-- capitalising (SS) to 121 characters and so fails the table check as a raw
-- 23514: a documented limit, not a bug to fix here.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f7a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
  st text;
begin
  begin
    perform public.add_list_item('70000000-0000-4000-8000-000000010601', U&'\0301\0302', 'e0');
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'invalid_name' then
    raise exception 'FAIL: add_list_item of combining marks raised % (null = no error), expected invalid_name', msg;
  end if;

  msg := null;
  begin
    insert into public.list_items (list_id, name, position)
    values ('70000000-0000-4000-8000-000000010601', U&'\0301\0302', 'e1');
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'invalid_name' then
    raise exception 'FAIL: direct insert of combining marks raised % (null = no error), expected invalid_name', msg;
  end if;

  msg := null;
  begin
    update public.list_items set name = U&'\0301\0302'
    where id = '90000000-0000-4000-8000-000001060104';
  exception when others then
    msg := sqlerrm;
  end;
  if msg is distinct from 'invalid_name' then
    raise exception 'FAIL: rename to combining marks raised % (null = no error), expected invalid_name', msg;
  end if;

  st := null;
  begin
    perform public.add_list_item('70000000-0000-4000-8000-000000010601',
      U&'\00DF' || repeat('x', 119), 'e2');
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23514' then
    raise exception 'FAIL: a 120-character name that capitalising lengthens gave sqlstate % (null = accepted), expected 23514', st;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 7 -- finish_shopping. L2 holds a ticked Jalape\00F1o and Plain. As A,
-- Done. The location_checkoffs row holds the FOLDED name {jalapeno}; the
-- shop_sessions row keeps the names as stored.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f7a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000010602', 'done');
  if r.checked_count <> 1 or r.total_count <> 2 then
    raise exception 'FAIL: done on L2 returned (checked_count=%, total_count=%), expected (1, 2)',
      r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000106'
        and item_names = array['jalapeno']) <> 1 then
    raise exception 'FAIL: location_checkoffs must hold exactly one row {jalapeno} (the folded name) for the fixture location';
  end if;

  if (select count(*) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000010602'
        and item_names = array[U&'Jalape\00F1o', 'Plain']
        and checked_item_names = array[U&'Jalape\00F1o']) <> 1 then
    raise exception 'FAIL: the shop_sessions row must keep the stored spelling Jalape\00F1o';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 8 -- catalogue. add_list_item and finish_shopping are single
-- overloads without defaults (PGRST203); anon and public cannot execute them,
-- authenticated can. The tidy trigger function is executable by no API role.
-- Neither API role can use the backup schema migration_106.
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array['add_list_item', 'finish_shopping'] loop
    if (select count(*) from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = fn) <> 1 then
      raise exception 'FAIL: % must have exactly one overload', fn;
    end if;

    if (select count(*) from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = fn
          and p.pronargdefaults > 0) <> 0 then
      raise exception 'FAIL: % has a default argument (PGRST203 risk)', fn;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.add_list_item(uuid, text, text)', 'execute')
     or has_function_privilege('anon', 'public.finish_shopping(uuid, text)', 'execute') then
    raise exception 'FAIL: anon can execute add_list_item or finish_shopping';
  end if;

  if exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid in ('public.add_list_item(uuid, text, text)'::regprocedure,
                    'public.finish_shopping(uuid, text)'::regprocedure,
                    'public.list_items_tidy_name()'::regprocedure)
      and a.grantee = 0
  ) then
    raise exception 'FAIL: public may execute add_list_item, finish_shopping or list_items_tidy_name';
  end if;

  if not has_function_privilege('authenticated', 'public.add_list_item(uuid, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.finish_shopping(uuid, text)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute add_list_item or finish_shopping';
  end if;

  if has_function_privilege('authenticated', 'public.list_items_tidy_name()', 'execute')
     or has_function_privilege('anon', 'public.list_items_tidy_name()', 'execute') then
    raise exception 'FAIL: an API role can execute list_items_tidy_name';
  end if;

  if has_schema_privilege('anon', 'migration_106', 'usage')
     or has_schema_privilege('authenticated', 'migration_106', 'usage') then
    raise exception 'FAIL: anon or authenticated can use schema migration_106';
  end if;

  if pg_get_functiondef('public.add_list_item(uuid, text, text)'::regprocedure) not like '%fold_item_name%' then
    raise exception 'FAIL: add_list_item does not use fold_item_name';
  end if;
end $$;

rollback;
