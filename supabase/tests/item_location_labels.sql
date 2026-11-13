-- Tests for the #112 database guard on Item location labels (migration
-- 20261114000000_item_location_standard_labels.sql): the label helpers, the
-- standard-label trigger on location_items, the two CHECK backstops and the vote
-- function's reading of a proposal.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor (or the MCP
-- `execute_sql` tool) against project chacavfoewyiwrfgvxtj, AFTER the migration is
-- applied. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The file is wrapped in
-- `begin ... rollback` and leaves nothing behind. State carries forward between
-- assertions: they are not independent and must not be reordered.
--
-- WHAT IT GUARDS. 0 the objects, their definitions and grants. G (generated) every
-- case in supabase/tests/item_location_label_cases.json, the same table the app's
-- parseLayoutLabel is held to by scripts/check-layout-order.mjs, plus the department
-- list. 1 as authenticated, a direct tag insert (the app's tagItemLocation path, and
-- old cached clients) stores the standard label: "dairy section" is Dairy, "isle 07"
-- is Aisle 7, "Meat" is Butchery. 2 "Cleaning", "Aisle 0", "Aisle 1000" and
-- "Aisle 4a" are refused with 23514 and the D3 message, and leave no row. 3 an UPDATE
-- of section goes through the trigger too. 4 two votes "aisle 7" and "Aisle 7" reach
-- quorum, and "meat" plus "Butchery" do too. 5 "dairy section" on a Dairy tag is
-- correction_matches_current. 6 a non-standard proposal is refused with the D3
-- message and leaves no row. 7 the votes CHECK refuses a raw non-standard insert by
-- the owning role (votes have no trigger), caught by its constraint name.
--
-- The trigger is never disabled here: the location_items CHECK cannot be reached past
-- it, so assertion 0 checks that constraint's definition instead.
--
-- Fixtures are inserted as the owning role (which bypasses RLS; the trigger still
-- runs). The behaviour assertions run as `authenticated`. `request.jwt.claims` must
-- be set *before* the role switch. All non-ASCII text is written as U& escapes.
--
-- DO NOT EDIT THE GENERATED BLOCK BY HAND. Edit the JSON, then run
-- `node scripts/check-layout-order.mjs --write`.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. E and F share nothing. One store LOC. Tag: pasta (Aisle 3).
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000112e1', true),  -- E
  ('00000000-0000-4000-8000-0000000112f1', true);  -- F

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('87000000-0000-4000-8000-000000000112',
   'Test Supermarket (item_location_labels)', -36.8485, 174.7633, 'new_world',
   '00000000-0000-4000-8000-0000000112e1');

insert into public.location_items (location_id, name, section) values
  ('87000000-0000-4000-8000-000000000112', 'pasta', 'Aisle 3');

-- ---------------------------------------------------------------------------
-- Assertion 0 -- objects, definitions and grants.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.item_location_departments()', 'public.is_item_location_label(text)',
    'public.item_location_label(text)'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception 'FAIL: % is missing', v_fn;
    end if;
    if has_function_privilege('anon', v_fn, 'execute')
       or not has_function_privilege('authenticated', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FAIL: % must be executable by authenticated and service_role, not anon', v_fn;
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
               where p.oid = v_fn::regprocedure and a.grantee = 0) then
      raise exception 'FAIL: PUBLIC can execute %', v_fn;
    end if;
    if (select provolatile from pg_proc where oid = v_fn::regprocedure) <> 'i' then
      raise exception 'FAIL: % is not IMMUTABLE', v_fn;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.location_items_standard_section()', 'execute')
     or has_function_privilege('authenticated', 'public.location_items_standard_section()', 'execute') then
    raise exception 'FAIL: an API role can execute the trigger function location_items_standard_section';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_standard_section'
      and not tgisinternal
      and tgenabled = 'O'
      and pg_get_triggerdef(oid) like '%BEFORE INSERT OR UPDATE OF section ON %location_items FOR EACH ROW%'
  ) then
    raise exception 'FAIL: trigger location_items_standard_section is missing, disabled or not BEFORE INSERT OR UPDATE OF section FOR EACH ROW';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.location_items'::regclass
      and conname = 'location_items_section_standard'
      and contype = 'c' and convalidated
      and pg_get_constraintdef(oid) like 'CHECK (%is_item_location_label(section))'
  ) then
    raise exception 'FAIL: location_items_section_standard is missing, not validated or not CHECK (is_item_location_label(section))';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.location_item_votes'::regclass
      and conname = 'location_item_votes_proposed_section_standard'
      and contype = 'c' and convalidated
      and pg_get_constraintdef(oid) like 'CHECK (%is_item_location_label(proposed_section))'
  ) then
    raise exception 'FAIL: location_item_votes_proposed_section_standard is missing, not validated or not CHECK (is_item_location_label(proposed_section))';
  end if;

  if pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
       not like '%public.item_location_label(p_proposed_section)%' then
    raise exception 'FAIL: vote_location_item_correction does not read the proposal with item_location_label';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion G -- the shared label cases (generated).
-- ---------------------------------------------------------------------------

-- GENERATED BEGIN (node scripts/check-layout-order.mjs --write)
do $$
begin
  if public.item_location_departments() is distinct from
       array['Fruit & Veg', 'Butchery', 'Seafood', 'Deli', 'Bakery', 'Dairy', 'Chilled', 'Frozen', 'Health & Beauty', 'Pharmacy', 'Beer & Wine']::text[] then
    raise exception 'FAIL: item_location_departments() is not LAYOUT_ORDER_SEQUENCE without Aisle';
  end if;
  if public.item_location_label('Fruit & Veg') is distinct from 'Fruit & Veg' then
    raise exception 'FAIL: item_location_label case %: got %', 'Fruit & Veg', public.item_location_label('Fruit & Veg');
  end if;
  if public.item_location_label('Butchery') is distinct from 'Butchery' then
    raise exception 'FAIL: item_location_label case %: got %', 'Butchery', public.item_location_label('Butchery');
  end if;
  if public.item_location_label('Seafood') is distinct from 'Seafood' then
    raise exception 'FAIL: item_location_label case %: got %', 'Seafood', public.item_location_label('Seafood');
  end if;
  if public.item_location_label('Deli') is distinct from 'Deli' then
    raise exception 'FAIL: item_location_label case %: got %', 'Deli', public.item_location_label('Deli');
  end if;
  if public.item_location_label('Bakery') is distinct from 'Bakery' then
    raise exception 'FAIL: item_location_label case %: got %', 'Bakery', public.item_location_label('Bakery');
  end if;
  if public.item_location_label('Dairy') is distinct from 'Dairy' then
    raise exception 'FAIL: item_location_label case %: got %', 'Dairy', public.item_location_label('Dairy');
  end if;
  if public.item_location_label('Chilled') is distinct from 'Chilled' then
    raise exception 'FAIL: item_location_label case %: got %', 'Chilled', public.item_location_label('Chilled');
  end if;
  if public.item_location_label('Frozen') is distinct from 'Frozen' then
    raise exception 'FAIL: item_location_label case %: got %', 'Frozen', public.item_location_label('Frozen');
  end if;
  if public.item_location_label('Health & Beauty') is distinct from 'Health & Beauty' then
    raise exception 'FAIL: item_location_label case %: got %', 'Health & Beauty', public.item_location_label('Health & Beauty');
  end if;
  if public.item_location_label('Pharmacy') is distinct from 'Pharmacy' then
    raise exception 'FAIL: item_location_label case %: got %', 'Pharmacy', public.item_location_label('Pharmacy');
  end if;
  if public.item_location_label('Beer & Wine') is distinct from 'Beer & Wine' then
    raise exception 'FAIL: item_location_label case %: got %', 'Beer & Wine', public.item_location_label('Beer & Wine');
  end if;
  if public.item_location_label('dairy section') is distinct from 'Dairy' then
    raise exception 'FAIL: item_location_label case %: got %', 'trailing section', public.item_location_label('dairy section');
  end if;
  if public.item_location_label('DAIRY') is distinct from 'Dairy' then
    raise exception 'FAIL: item_location_label case %: got %', 'upper case', public.item_location_label('DAIRY');
  end if;
  if public.item_location_label('the deli') is distinct from 'Deli' then
    raise exception 'FAIL: item_location_label case %: got %', 'leading the', public.item_location_label('the deli');
  end if;
  if public.item_location_label('Deli counter') is distinct from 'Deli' then
    raise exception 'FAIL: item_location_label case %: got %', 'trailing counter', public.item_location_label('Deli counter');
  end if;
  if public.item_location_label('fruit and veg') is distinct from 'Fruit & Veg' then
    raise exception 'FAIL: item_location_label case %: got %', 'and for &', public.item_location_label('fruit and veg');
  end if;
  if public.item_location_label('Health and Beauty') is distinct from 'Health & Beauty' then
    raise exception 'FAIL: item_location_label case %: got %', 'Health and Beauty', public.item_location_label('Health and Beauty');
  end if;
  if public.item_location_label('frozen area') is distinct from 'Frozen' then
    raise exception 'FAIL: item_location_label case %: got %', 'trailing area', public.item_location_label('frozen area');
  end if;
  if public.item_location_label('Dairy aisle') is distinct from 'Dairy' then
    raise exception 'FAIL: item_location_label case %: got %', 'trailing aisle', public.item_location_label('Dairy aisle');
  end if;
  if public.item_location_label('Chilled dept') is distinct from 'Chilled' then
    raise exception 'FAIL: item_location_label case %: got %', 'trailing dept', public.item_location_label('Chilled dept');
  end if;
  if public.item_location_label('seafood department') is distinct from 'Seafood' then
    raise exception 'FAIL: item_location_label case %: got %', 'trailing department', public.item_location_label('seafood department');
  end if;
  if public.item_location_label('pharmacy bay') is distinct from 'Pharmacy' then
    raise exception 'FAIL: item_location_label case %: got %', 'trailing bay', public.item_location_label('pharmacy bay');
  end if;
  if public.item_location_label('The Beer and Wine Section') is distinct from 'Beer & Wine' then
    raise exception 'FAIL: item_location_label case %: got %', 'the, and, section together', public.item_location_label('The Beer and Wine Section');
  end if;
  if public.item_location_label('  bakery  ') is distinct from 'Bakery' then
    raise exception 'FAIL: item_location_label case %: got %', 'edge spaces', public.item_location_label('  bakery  ');
  end if;
  if public.item_location_label(U&'D\00C9LI') is distinct from 'Deli' then
    raise exception 'FAIL: item_location_label case %: got %', 'accented E', public.item_location_label(U&'D\00C9LI');
  end if;
  if public.item_location_label('Meat') is distinct from 'Butchery' then
    raise exception 'FAIL: item_location_label case %: got %', 'D2 Meat', public.item_location_label('Meat');
  end if;
  if public.item_location_label('MEAT') is distinct from 'Butchery' then
    raise exception 'FAIL: item_location_label case %: got %', 'D2 MEAT', public.item_location_label('MEAT');
  end if;
  if public.item_location_label('meat section') is distinct from 'Butchery' then
    raise exception 'FAIL: item_location_label case %: got %', 'D2 meat section', public.item_location_label('meat section');
  end if;
  if public.item_location_label('the meat counter') is distinct from 'Butchery' then
    raise exception 'FAIL: item_location_label case %: got %', 'D2 the meat counter', public.item_location_label('the meat counter');
  end if;
  if public.item_location_label('aisle 4') is distinct from 'Aisle 4' then
    raise exception 'FAIL: item_location_label case %: got %', 'aisle lower', public.item_location_label('aisle 4');
  end if;
  if public.item_location_label('Isle 04') is distinct from 'Aisle 4' then
    raise exception 'FAIL: item_location_label case %: got %', 'isle leading zero', public.item_location_label('Isle 04');
  end if;
  if public.item_location_label('isle 07') is distinct from 'Aisle 7' then
    raise exception 'FAIL: item_location_label case %: got %', 'isle 07', public.item_location_label('isle 07');
  end if;
  if public.item_location_label('aisle no. 4') is distinct from 'Aisle 4' then
    raise exception 'FAIL: item_location_label case %: got %', 'aisle no.', public.item_location_label('aisle no. 4');
  end if;
  if public.item_location_label('aisle #4') is distinct from 'Aisle 4' then
    raise exception 'FAIL: item_location_label case %: got %', 'aisle #', public.item_location_label('aisle #4');
  end if;
  if public.item_location_label('aisle number 12') is distinct from 'Aisle 12' then
    raise exception 'FAIL: item_location_label case %: got %', 'aisle number', public.item_location_label('aisle number 12');
  end if;
  if public.item_location_label('ailse 3') is distinct from 'Aisle 3' then
    raise exception 'FAIL: item_location_label case %: got %', 'ailse typo', public.item_location_label('ailse 3');
  end if;
  if public.item_location_label('asile 5') is distinct from 'Aisle 5' then
    raise exception 'FAIL: item_location_label case %: got %', 'asile typo', public.item_location_label('asile 5');
  end if;
  if public.item_location_label('aisle  22') is distinct from 'Aisle 22' then
    raise exception 'FAIL: item_location_label case %: got %', 'inner double space', public.item_location_label('aisle  22');
  end if;
  if public.item_location_label('AISLE 20') is distinct from 'Aisle 20' then
    raise exception 'FAIL: item_location_label case %: got %', 'upper AISLE', public.item_location_label('AISLE 20');
  end if;
  if public.item_location_label('Aisle 1') is distinct from 'Aisle 1' then
    raise exception 'FAIL: item_location_label case %: got %', 'Aisle 1', public.item_location_label('Aisle 1');
  end if;
  if public.item_location_label('Aisle 999') is distinct from 'Aisle 999' then
    raise exception 'FAIL: item_location_label case %: got %', 'Aisle 999', public.item_location_label('Aisle 999');
  end if;
  if public.item_location_label('Aisle 0') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'Aisle 0 refused', public.item_location_label('Aisle 0');
  end if;
  if public.item_location_label('Aisle 1000') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'Aisle 1000 refused', public.item_location_label('Aisle 1000');
  end if;
  if public.item_location_label('Aisle 4a') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'Aisle 4a refused', public.item_location_label('Aisle 4a');
  end if;
  if public.item_location_label('Aisle 4-5') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'Aisle 4-5 refused', public.item_location_label('Aisle 4-5');
  end if;
  if public.item_location_label('Aisle') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'bare Aisle refused', public.item_location_label('Aisle');
  end if;
  if public.item_location_label('15') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'bare number refused', public.item_location_label('15');
  end if;
  if public.item_location_label('Cleaning') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'Cleaning refused', public.item_location_label('Cleaning');
  end if;
  if public.item_location_label('Dali') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'Dali refused', public.item_location_label('Dali');
  end if;
  if public.item_location_label('Frozen Meats') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'Frozen Meats refused', public.item_location_label('Frozen Meats');
  end if;
  if public.item_location_label('Meats') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'Meats refused (no other synonyms)', public.item_location_label('Meats');
  end if;
  if public.item_location_label('Fruit & Vegetables') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'Fruit & Vegetables refused (no other synonyms)', public.item_location_label('Fruit & Vegetables');
  end if;
  if public.item_location_label('greengrocer') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'greengrocer refused', public.item_location_label('greengrocer');
  end if;
  if public.item_location_label('') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'empty refused', public.item_location_label('');
  end if;
  if public.item_location_label('   ') is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'blank refused', public.item_location_label('   ');
  end if;
  if public.item_location_label(null::text) is distinct from null::text then
    raise exception 'FAIL: item_location_label case %: got %', 'null refused', public.item_location_label(null::text);
  end if;
  if public.is_item_location_label('Dairy') is distinct from true then
    raise exception 'FAIL: is_item_location_label case %', 'department';
  end if;
  if public.is_item_location_label('Beer & Wine') is distinct from true then
    raise exception 'FAIL: is_item_location_label case %', 'department with &';
  end if;
  if public.is_item_location_label('Aisle 7') is distinct from true then
    raise exception 'FAIL: is_item_location_label case %', 'Aisle 7';
  end if;
  if public.is_item_location_label('Aisle 999') is distinct from true then
    raise exception 'FAIL: is_item_location_label case %', 'Aisle 999';
  end if;
  if public.is_item_location_label('Aisle 07') is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'Aisle 07 (leading zero)';
  end if;
  if public.is_item_location_label('Aisle 0') is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'Aisle 0';
  end if;
  if public.is_item_location_label('Aisle 1000') is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'Aisle 1000';
  end if;
  if public.is_item_location_label('aisle 7') is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'lower aisle';
  end if;
  if public.is_item_location_label('dairy') is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'lower department';
  end if;
  if public.is_item_location_label('Dairy ') is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'trailing space';
  end if;
  if public.is_item_location_label('Fruit and Veg') is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'and spelled out';
  end if;
  if public.is_item_location_label('Meat') is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'synonym is not stored form';
  end if;
  if public.is_item_location_label('') is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'empty';
  end if;
  if public.is_item_location_label(null::text) is distinct from false then
    raise exception 'FAIL: is_item_location_label case %', 'null';
  end if;
  if not public.is_item_location_label('Fruit & Veg') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Fruit & Veg';
  end if;
  if not public.is_item_location_label('Butchery') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Butchery';
  end if;
  if not public.is_item_location_label('Seafood') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Seafood';
  end if;
  if not public.is_item_location_label('Deli') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Deli';
  end if;
  if not public.is_item_location_label('Bakery') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Bakery';
  end if;
  if not public.is_item_location_label('Dairy') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Dairy';
  end if;
  if not public.is_item_location_label('Chilled') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Chilled';
  end if;
  if not public.is_item_location_label('Frozen') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Frozen';
  end if;
  if not public.is_item_location_label('Health & Beauty') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Health & Beauty';
  end if;
  if not public.is_item_location_label('Pharmacy') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Pharmacy';
  end if;
  if not public.is_item_location_label('Beer & Wine') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Beer & Wine';
  end if;
  if not public.is_item_location_label('Aisle 4') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Aisle 4';
  end if;
  if not public.is_item_location_label('Aisle 7') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Aisle 7';
  end if;
  if not public.is_item_location_label('Aisle 12') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Aisle 12';
  end if;
  if not public.is_item_location_label('Aisle 3') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Aisle 3';
  end if;
  if not public.is_item_location_label('Aisle 5') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Aisle 5';
  end if;
  if not public.is_item_location_label('Aisle 22') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Aisle 22';
  end if;
  if not public.is_item_location_label('Aisle 20') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Aisle 20';
  end if;
  if not public.is_item_location_label('Aisle 1') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Aisle 1';
  end if;
  if not public.is_item_location_label('Aisle 999') then
    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', 'Aisle 999';
  end if;
end $$;
-- GENERATED END

-- ---------------------------------------------------------------------------
-- Assertion 1 -- a direct tag insert as authenticated stores the standard label.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000112e1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.location_items (location_id, name, section) values
    ('87000000-0000-4000-8000-000000000112', 'yoghurt', 'dairy section'),
    ('87000000-0000-4000-8000-000000000112', 'soap', 'isle 07'),
    ('87000000-0000-4000-8000-000000000112', 'steak', 'Meat');

  if (select section from public.location_items
      where location_id = '87000000-0000-4000-8000-000000000112' and name = 'yoghurt') <> 'Dairy' then
    raise exception 'FAIL: ''dairy section'' was not stored as ''Dairy''';
  end if;

  if (select section from public.location_items
      where location_id = '87000000-0000-4000-8000-000000000112' and name = 'soap') <> 'Aisle 7' then
    raise exception 'FAIL: ''isle 07'' was not stored as ''Aisle 7''';
  end if;

  if (select section from public.location_items
      where location_id = '87000000-0000-4000-8000-000000000112' and name = 'steak') <> 'Butchery' then
    raise exception 'FAIL: ''Meat'' was not stored as ''Butchery'' (D2)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 -- non-standard labels are refused with 23514 and the D3 message, and
-- leave no row.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000112e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_label text;
  st text;
  msg text;
begin
  foreach v_label in array array['Cleaning', 'Aisle 0', 'Aisle 1000', 'Aisle 4a'] loop
    st := null; msg := null;
    begin
      insert into public.location_items (location_id, name, section)
      values ('87000000-0000-4000-8000-000000000112', 'refused item', v_label);
    exception when others then
      st := sqlstate;
      msg := sqlerrm;
    end;

    if st is distinct from '23514'
       or msg is distinct from 'That isn''t a standard Item location. Pick a section, or Aisle 1 to 999.' then
      raise exception 'FAIL: tagging with % gave (sqlstate %, %) (null = accepted), expected 23514 and the D3 message',
        v_label, st, msg;
    end if;
  end loop;

  if (select count(*) from public.location_items
      where location_id = '87000000-0000-4000-8000-000000000112' and name = 'refused item') <> 0 then
    raise exception 'FAIL: a refused tag left a row behind';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 -- an UPDATE of section goes through the trigger (the vote function's
-- applies use this path). As the owner: 'frozen area' is stored 'Frozen'; 'Cleaning'
-- is refused; pasta is put back to 'Aisle 3'.
-- ---------------------------------------------------------------------------

do $$
declare
  st text;
begin
  update public.location_items set section = 'frozen area'
  where location_id = '87000000-0000-4000-8000-000000000112' and name = 'pasta';

  if (select section from public.location_items
      where location_id = '87000000-0000-4000-8000-000000000112' and name = 'pasta') <> 'Frozen' then
    raise exception 'FAIL: an update to ''frozen area'' was not stored as ''Frozen''';
  end if;

  begin
    update public.location_items set section = 'Cleaning'
    where location_id = '87000000-0000-4000-8000-000000000112' and name = 'pasta';
  exception when others then
    st := sqlstate;
  end;

  if st is distinct from '23514' then
    raise exception 'FAIL: an update to ''Cleaning'' gave sqlstate % (null = accepted), expected 23514', st;
  end if;

  update public.location_items set section = 'Aisle 3'
  where location_id = '87000000-0000-4000-8000-000000000112' and name = 'pasta';
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 4 -- near-miss votes count together. E proposes 'aisle 7' on pasta
-- (Aisle 3), F proposes 'Aisle 7': quorum, pasta is 'Aisle 7', no votes left. Then
-- E proposes 'meat' on soap (Aisle 7) and F 'Butchery': soap is 'Butchery'.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000112e1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '87000000-0000-4000-8000-000000000112', 'pasta', 'aisle 7');
  perform public.vote_location_item_correction(
    '87000000-0000-4000-8000-000000000112', 'soap', 'meat');

  if (select count(*) from public.location_item_votes
      where location_id = '87000000-0000-4000-8000-000000000112'
        and ((item_name = 'pasta' and proposed_section = 'Aisle 7')
             or (item_name = 'soap' and proposed_section = 'Butchery'))) <> 2 then
    raise exception 'FAIL: E''s proposals ''aisle 7'' and ''meat'' were not stored as ''Aisle 7'' and ''Butchery''';
  end if;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000112f1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '87000000-0000-4000-8000-000000000112', 'pasta', 'Aisle 7');
  perform public.vote_location_item_correction(
    '87000000-0000-4000-8000-000000000112', 'soap', 'Butchery');

  if (select section from public.location_items
      where location_id = '87000000-0000-4000-8000-000000000112' and name = 'pasta') <> 'Aisle 7' then
    raise exception 'FAIL: ''aisle 7'' and ''Aisle 7'' from two voters did not reach quorum';
  end if;

  if (select section from public.location_items
      where location_id = '87000000-0000-4000-8000-000000000112' and name = 'soap') <> 'Butchery' then
    raise exception 'FAIL: ''meat'' and ''Butchery'' from two voters did not reach quorum';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '87000000-0000-4000-8000-000000000112'
        and item_name in ('pasta', 'soap')) <> 0 then
    raise exception 'FAIL: applying the corrections did not clear the votes';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 -- 'dairy section' on yoghurt (Dairy) reads as Dairy:
-- correction_matches_current, no row.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000112e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.vote_location_item_correction(
      '87000000-0000-4000-8000-000000000112', 'yoghurt', 'dairy section');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'correction_matches_current' then
    raise exception 'FAIL: ''dairy section'' on a Dairy tag gave % (null = accepted), expected correction_matches_current', msg;
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '87000000-0000-4000-8000-000000000112' and item_name = 'yoghurt') <> 0 then
    raise exception 'FAIL: the refused ''dairy section'' proposal left a vote row';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 -- a non-standard proposal is refused with 23514 and the D3 message
-- and leaves no row; yoghurt's label is unchanged.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000112e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_label text;
  st text;
  msg text;
begin
  foreach v_label in array array['Cleaning', 'Aisle 0', 'Frozen Meats'] loop
    st := null; msg := null;
    begin
      perform public.vote_location_item_correction(
        '87000000-0000-4000-8000-000000000112', 'yoghurt', v_label);
    exception when others then
      st := sqlstate;
      msg := sqlerrm;
    end;

    if st is distinct from '23514'
       or msg is distinct from 'That isn''t a standard Item location. Pick a section, or Aisle 1 to 999.' then
      raise exception 'FAIL: proposing % gave (sqlstate %, %) (null = accepted), expected 23514 and the D3 message',
        v_label, st, msg;
    end if;
  end loop;

  if (select count(*) from public.location_item_votes
      where location_id = '87000000-0000-4000-8000-000000000112' and item_name = 'yoghurt') <> 0 then
    raise exception 'FAIL: a refused proposal left a vote row';
  end if;

  if (select section from public.location_items
      where location_id = '87000000-0000-4000-8000-000000000112' and name = 'yoghurt') <> 'Dairy' then
    raise exception 'FAIL: a refused proposal changed yoghurt''s label';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 7 -- the votes CHECK. As the owner, a raw insert of 'Cleaning' must fail
-- on location_item_votes_proposed_section_standard (23514); a raw 'Aisle 9' passes it.
-- ---------------------------------------------------------------------------

do $$
declare
  st text;
  cn text;
begin
  begin
    insert into public.location_item_votes (location_id, item_name, proposed_section, voter_id)
    values ('87000000-0000-4000-8000-000000000112', 'yoghurt', 'Cleaning',
            '00000000-0000-4000-8000-0000000112e1');
  exception when others then
    get stacked diagnostics cn = constraint_name;
    st := sqlstate;
  end;

  if st is distinct from '23514' or cn is distinct from 'location_item_votes_proposed_section_standard' then
    raise exception 'FAIL: a raw non-standard vote gave (sqlstate %, constraint %), expected (23514, location_item_votes_proposed_section_standard)', st, cn;
  end if;

  insert into public.location_item_votes (location_id, item_name, proposed_section, voter_id)
  values ('87000000-0000-4000-8000-000000000112', 'yoghurt', 'Aisle 9',
          '00000000-0000-4000-8000-0000000112e1');
end $$;

rollback;
