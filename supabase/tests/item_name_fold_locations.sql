-- Behaviour and catalogue tests for the location-side item-name fold: the
-- location_items_tidy trigger, the fold CHECKs on location_items.name and
-- location_item_votes.item_name, the fold-based item_names_are_normalized CHECK on
-- location_checkoffs, and the folding vote function (issue #106, Slice 4a --
-- migration 20261011000000_location_items_fold.sql).
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor (or the MCP
-- `execute_sql` tool) against project chacavfoewyiwrfgvxtj, AFTER the migration is
-- applied. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The file is wrapped in
-- `begin ... rollback` and leaves nothing behind. State carries forward between
-- assertions: they are not independent and must not be reordered.
--
-- WHAT IT GUARDS. 1 the structure: trigger, the two fold CHECKs, no lower(btrim)
-- CHECK left, the cascading foreign key. 2 a tag insert is stored folded with a
-- capitalised section, and a same-fold name (case, spacing, accent, NFD, as an old
-- client would send it) is refused with the unique violation. 3 an empty-fold name
-- raises invalid_name; a rename is folded and cannot land on another fold. 4 the
-- vote function accepts the folded name and a raw accented or upper-case one. 5 the
-- CHECKs themselves refuse a non-folded name (the tag one with the trigger switched
-- off, the vote one directly). 6 finish_shopping writes the folded name, and the
-- check-off CHECK refuses an accented or capitalised element. 7 the catalogue.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as the
-- owning role (which bypasses RLS; the triggers still fire). Only the behaviour
-- assertions run as `authenticated`. `request.jwt.claims` must be set *before* the
-- role switch. All non-ASCII text is written as U& escapes.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. Household H has member A (owns list L). B is a stranger. LOC is a
-- store with two tags (milk, bread). L is attached to LOC with a ticked Cafe
-- (acute e) and an unticked Plain.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000f8a1', true),  -- A
  ('00000000-0000-4000-8000-00000000f8b1', true);  -- B: stranger

insert into public.households (id, name) values
  ('50000000-0000-4000-8000-000000000107', 'Test Household (item_name_fold_locations)');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-00000000f8a1', '50000000-0000-4000-8000-000000000107');

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('82000000-0000-4000-8000-000000000107',
   'Test Supermarket (item_name_fold_locations)', -36.8485, 174.7633, 'new_world',
   '00000000-0000-4000-8000-00000000f8a1');

insert into public.location_items (location_id, name, section) values
  ('82000000-0000-4000-8000-000000000107', 'milk', 'Aisle 3'),
  ('82000000-0000-4000-8000-000000000107', 'bread', 'Aisle 1');

insert into public.lists (id, owner_id, household_id, location_id, name) values
  ('70000000-0000-4000-8000-000000010701',
   '00000000-0000-4000-8000-00000000f8a1', '50000000-0000-4000-8000-000000000107',
   '82000000-0000-4000-8000-000000000107', 'L (fold locations)');

insert into public.list_items (id, list_id, name, position, checked_at) values
  ('90000000-0000-4000-8000-000001070101', '70000000-0000-4000-8000-000000010701',
   U&'caf\00E9', 'a0', now()),
  ('90000000-0000-4000-8000-000001070102', '70000000-0000-4000-8000-000000010701',
   'Plain', 'a1', null);

-- ---------------------------------------------------------------------------
-- Assertion 1 -- structure. The tidy trigger is a row-level BEFORE INSERT OR
-- UPDATE OF name trigger and is enabled; both fold CHECKs exist, are validated and
-- use fold_item_name; no CHECK on either table still uses lower(btrim); the vote
-- table has exactly one foreign key to the tags and it cascades on delete; every
-- non-internal trigger on the three tables is enabled.
-- ---------------------------------------------------------------------------

do $$
declare
  def text;
begin
  select pg_get_triggerdef(t.oid) into def
  from pg_trigger t
  where t.tgrelid = 'public.location_items'::regclass
    and t.tgname = 'location_items_tidy'
    and not t.tgisinternal;

  if def is null then
    raise exception 'FAIL: trigger location_items_tidy does not exist';
  end if;

  if def not like '%BEFORE INSERT OR UPDATE OF name%' or def not like '%FOR EACH ROW%' then
    raise exception 'FAIL: location_items_tidy is %, expected BEFORE INSERT OR UPDATE OF name FOR EACH ROW', def;
  end if;

  select pg_get_constraintdef(c.oid) into def
  from pg_constraint c
  where c.conrelid = 'public.location_items'::regclass
    and c.conname = 'location_items_name_folded'
    and c.contype = 'c' and c.convalidated;

  if def is null or def not like '%fold_item_name%' then
    raise exception 'FAIL: location_items_name_folded is missing, not validated or does not use fold_item_name (%)', def;
  end if;

  select pg_get_constraintdef(c.oid) into def
  from pg_constraint c
  where c.conrelid = 'public.location_item_votes'::regclass
    and c.conname = 'location_item_votes_item_name_folded'
    and c.contype = 'c' and c.convalidated;

  if def is null or def not like '%fold_item_name%' then
    raise exception 'FAIL: location_item_votes_item_name_folded is missing, not validated or does not use fold_item_name (%)', def;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid in ('public.location_items'::regclass, 'public.location_item_votes'::regclass)
      and contype = 'c'
      and strpos(pg_get_constraintdef(oid), 'lower(btrim') > 0
  ) then
    raise exception 'FAIL: a lower(btrim) CHECK remains on location_items or location_item_votes';
  end if;

  select pg_get_constraintdef(c.oid) into def
  from pg_constraint c
  where c.conrelid = 'public.location_item_votes'::regclass
    and c.contype = 'f'
    and c.confrelid = 'public.location_items'::regclass
    and c.convalidated;

  if def is null or def not like '%ON DELETE CASCADE%' then
    raise exception 'FAIL: the vote-to-tag foreign key is missing, not validated or not ON DELETE CASCADE (%)', def;
  end if;

  if (select count(*) from pg_constraint
      where conrelid = 'public.location_item_votes'::regclass
        and contype = 'f'
        and confrelid = 'public.location_items'::regclass) <> 1 then
    raise exception 'FAIL: expected exactly one foreign key from location_item_votes to location_items';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid in ('public.location_items'::regclass,
                      'public.location_item_votes'::regclass,
                      'public.location_checkoffs'::regclass)
      and not tgisinternal
      and tgenabled <> 'O'
  ) then
    raise exception 'FAIL: a trigger on location_items, location_item_votes or location_checkoffs is not enabled';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 2 -- the tag insert, as A. 'Jalape<n tilde>o  Peppers' (two spaces)
-- with section 'aisle 5' is stored 'jalapeno peppers' / 'Aisle 5'. The same item
-- typed upper-case, as lower(btrim) of the accented form (what an old client
-- sends) and as an NFD form each fail with 23505 on the table's unique key and
-- leave the first tag untouched.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f8a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  st text;
  cn text;
  n text;
  s text;
  uk text := (select conname from pg_constraint
              where conrelid = 'public.location_items'::regclass and contype = 'u');
  v text;
begin
  insert into public.location_items (location_id, name, section)
  values ('82000000-0000-4000-8000-000000000107', U&'Jalape\00F1o  Peppers', 'aisle 5');

  select name, section into n, s
  from public.location_items
  where location_id = '82000000-0000-4000-8000-000000000107' and name like 'jalape%';

  if n is distinct from 'jalapeno peppers' or s is distinct from 'Aisle 5' then
    raise exception 'FAIL: the accented, double-spaced tag was stored as (%, %), expected (jalapeno peppers, Aisle 5)', n, s;
  end if;

  foreach v in array array['JALAPENO peppers', U&'jalape\00F1o peppers', U&'jalapen\0303o  PEPPERS'] loop
    st := null; cn := null;
    begin
      insert into public.location_items (location_id, name, section)
      values ('82000000-0000-4000-8000-000000000107', v, 'Aisle 8');
    exception when others then
      get stacked diagnostics cn = constraint_name;
      st := sqlstate;
    end;
    if st is distinct from '23505' or cn is distinct from uk then
      raise exception 'FAIL: inserting a same-fold spelling gave (sqlstate %, constraint %), expected (23505, %)', st, cn, uk;
    end if;
  end loop;

  if (select count(*) from public.location_items
      where location_id = '82000000-0000-4000-8000-000000000107' and name like 'jalape%') <> 1
     or (select section from public.location_items
         where location_id = '82000000-0000-4000-8000-000000000107'
           and name = 'jalapeno peppers') <> 'Aisle 5' then
    raise exception 'FAIL: a refused same-fold insert disturbed the first tag';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 -- empty folds and renames. As A, a name made only of combining marks
-- or only of spaces raises invalid_name. As the owner, renaming bread to
-- 'Cafe Au Lait' stores 'cafe au lait'; renaming onto milk's fold fails with 23505;
-- a section-only update leaves the name alone.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f8a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
  v text;
begin
  foreach v in array array[U&'\0301\0302', '   '] loop
    msg := null;
    begin
      insert into public.location_items (location_id, name, section)
      values ('82000000-0000-4000-8000-000000000107', v, 'Aisle 8');
    exception when others then
      msg := sqlerrm;
    end;
    if msg is distinct from 'invalid_name' then
      raise exception 'FAIL: inserting an empty-fold name raised % (null = no error), expected invalid_name', msg;
    end if;
  end loop;
end $$;

reset role;

do $$
declare
  st text;
  stored text;
begin
  update public.location_items set name = 'Cafe Au Lait'
  where location_id = '82000000-0000-4000-8000-000000000107' and name = 'bread'
  returning name into stored;
  if stored is distinct from 'cafe au lait' then
    raise exception 'FAIL: renaming bread to Cafe Au Lait stored %, expected cafe au lait', stored;
  end if;

  st := null;
  begin
    update public.location_items set name = 'MILK'
    where location_id = '82000000-0000-4000-8000-000000000107' and name = 'cafe au lait';
  exception when others then
    st := sqlstate;
  end;
  if st is distinct from '23505' then
    raise exception 'FAIL: renaming onto milk gave sqlstate % (null = accepted), expected 23505', st;
  end if;

  update public.location_items set section = 'Aisle 2'
  where location_id = '82000000-0000-4000-8000-000000000107' and name = 'cafe au lait'
  returning name into stored;
  if stored is distinct from 'cafe au lait' then
    raise exception 'FAIL: a section-only update changed the name to %', stored;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 4 -- the vote function folds. B proposes milk -> 'Aisle 7' with the
-- folded name (one vote row, section unchanged); A confirms with 'MILK' and the
-- correction applies and the votes clear. Then B proposes the Jalape<n tilde>o
-- tag -> 'Aisle 9' with the accented raw name (stored under the fold) and A
-- confirms with the folded name: quorum.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f8b1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '82000000-0000-4000-8000-000000000107', 'milk', 'Aisle 7');

  if (select count(*) from public.location_item_votes
      where location_id = '82000000-0000-4000-8000-000000000107'
        and item_name = 'milk' and proposed_section = 'Aisle 7') <> 1 then
    raise exception 'FAIL: B''s proposal with the folded name did not create a vote row';
  end if;

  perform public.vote_location_item_correction(
    '82000000-0000-4000-8000-000000000107', U&'Jalape\00F1o Peppers', 'Aisle 9');

  if (select count(*) from public.location_item_votes
      where location_id = '82000000-0000-4000-8000-000000000107'
        and item_name = 'jalapeno peppers' and proposed_section = 'Aisle 9') <> 1 then
    raise exception 'FAIL: B''s proposal with the accented raw name was not stored under the fold';
  end if;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f8a1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '82000000-0000-4000-8000-000000000107', 'MILK', 'Aisle 7');

  if (select section from public.location_items
      where location_id = '82000000-0000-4000-8000-000000000107' and name = 'milk') <> 'Aisle 7' then
    raise exception 'FAIL: A''s confirmation with MILK did not reach quorum on the milk tag';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '82000000-0000-4000-8000-000000000107' and item_name = 'milk') <> 0 then
    raise exception 'FAIL: applying the milk correction did not clear its votes';
  end if;

  perform public.vote_location_item_correction(
    '82000000-0000-4000-8000-000000000107', 'jalapeno peppers', 'Aisle 9');

  if (select section from public.location_items
      where location_id = '82000000-0000-4000-8000-000000000107'
        and name = 'jalapeno peppers') <> 'Aisle 9' then
    raise exception 'FAIL: A''s confirmation of the accented proposal did not reach quorum';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 -- the CHECKs themselves. As the owner: a vote with an upper-case or
-- accented item_name is refused with 23514 and the fold CHECK's name (the CHECK
-- runs before the foreign key, which only fires after the row is formed). With
-- the tidy trigger switched off (inside this rolled-back transaction), a tag
-- insert of 'Zesty' or an accented name is refused by location_items_name_folded;
-- the trigger is switched back on.
-- ---------------------------------------------------------------------------

do $$
declare
  st text;
  cn text;
  v text;
begin
  foreach v in array array['Milk', U&'m\00EDlk'] loop
    st := null; cn := null;
    begin
      insert into public.location_item_votes (location_id, item_name, proposed_section, voter_id)
      values ('82000000-0000-4000-8000-000000000107', v, 'Aisle 30',
              '00000000-0000-4000-8000-00000000f8a1');
    exception when others then
      get stacked diagnostics cn = constraint_name;
      st := sqlstate;
    end;
    if st is distinct from '23514' or cn is distinct from 'location_item_votes_item_name_folded' then
      raise exception 'FAIL: a non-folded vote item_name gave (sqlstate %, constraint %), expected (23514, location_item_votes_item_name_folded)', st, cn;
    end if;
  end loop;

  alter table public.location_items disable trigger location_items_tidy;

  foreach v in array array['Zesty', U&'caf\00E9'] loop
    st := null; cn := null;
    begin
      insert into public.location_items (location_id, name, section)
      values ('82000000-0000-4000-8000-000000000107', v, 'Aisle 31');
    exception when others then
      get stacked diagnostics cn = constraint_name;
      st := sqlstate;
    end;
    if st is distinct from '23514' or cn is distinct from 'location_items_name_folded' then
      raise exception 'FAIL: a non-folded tag name gave (sqlstate %, constraint %), expected (23514, location_items_name_folded)', st, cn;
    end if;
  end loop;

  alter table public.location_items enable trigger location_items_tidy;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 6 -- check-offs. As A, finish_shopping (Done) on L writes the FOLDED
-- name {cafe} to location_checkoffs. Then, as the owner (authenticated has no
-- INSERT), a check-off with an accented or capitalised element is refused with
-- 23514 from the item_names CHECK, and item_names_are_normalized agrees; an
-- already folded array is accepted.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f8a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000010701', 'done');
  if r.checked_count <> 1 or r.total_count <> 2 then
    raise exception 'FAIL: done on L returned (checked_count=%, total_count=%), expected (1, 2)',
      r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
declare
  st text;
  cn text;
  a text[];
  v text;
begin
  if (select count(*) from public.location_checkoffs
      where location_id = '82000000-0000-4000-8000-000000000107'
        and item_names = array['cafe']) <> 1 then
    raise exception 'FAIL: location_checkoffs must hold exactly one row {cafe} (the folded name) for the fixture store';
  end if;

  -- Each probe is a comma-separated list, split into the array under test.
  foreach v in array array[U&'caf\00E9', 'Milk', 'tea,' || U&'\00FCber'] loop
    a := string_to_array(v, ',');
    st := null; cn := null;
    begin
      insert into public.location_checkoffs (location_id, item_names)
      values ('82000000-0000-4000-8000-000000000107', a);
    exception when others then
      get stacked diagnostics cn = constraint_name;
      st := sqlstate;
    end;
    if st is distinct from '23514' or cn not like 'location_checkoffs_item_names%' then
      raise exception 'FAIL: a non-folded check-off % gave (sqlstate %, constraint %), expected (23514, location_checkoffs_item_names...)', a, st, cn;
    end if;
  end loop;

  insert into public.location_checkoffs (location_id, item_names)
  values ('82000000-0000-4000-8000-000000000107', array['tea', 'jalapeno peppers']);

  if public.item_names_are_normalized(array[U&'caf\00E9'])
     or public.item_names_are_normalized(array['Milk'])
     or not public.item_names_are_normalized(array['tea', 'jalapeno peppers']) then
    raise exception 'FAIL: item_names_are_normalized disagrees with the fold on its three probe arrays';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 7 -- catalogue. The tidy trigger function is executable by no API role
-- nor public; item_names_are_normalized uses the fold and stays IMMUTABLE; the vote
-- function folds and is executable by authenticated only; the grants are the old
-- ones (authenticated can insert tags only, cannot update or delete them, cannot
-- insert votes or check-offs); neither API role can use the backup schema.
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('anon', 'public.location_items_tidy()', 'execute')
     or has_function_privilege('authenticated', 'public.location_items_tidy()', 'execute')
     or exists (
       select 1 from pg_proc p, aclexplode(p.proacl) a
       where p.oid = 'public.location_items_tidy()'::regprocedure and a.grantee = 0
     ) then
    raise exception 'FAIL: an API role or public can execute location_items_tidy';
  end if;

  if pg_get_functiondef('public.item_names_are_normalized(text[])'::regprocedure) not like '%fold_item_name%' then
    raise exception 'FAIL: item_names_are_normalized does not use fold_item_name';
  end if;

  if (select provolatile from pg_proc
      where oid = 'public.item_names_are_normalized(text[])'::regprocedure) <> 'i' then
    raise exception 'FAIL: item_names_are_normalized is no longer IMMUTABLE';
  end if;

  if pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
       not like '%fold_item_name(p_item_name)%' then
    raise exception 'FAIL: vote_location_item_correction does not fold the item name';
  end if;

  if has_function_privilege('anon', 'public.vote_location_item_correction(uuid, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.vote_location_item_correction(uuid, text, text)', 'execute') then
    raise exception 'FAIL: vote_location_item_correction must be executable by authenticated only';
  end if;

  if not has_table_privilege('authenticated', 'public.location_items', 'insert')
     or has_table_privilege('authenticated', 'public.location_items', 'update')
     or has_table_privilege('authenticated', 'public.location_items', 'delete')
     or has_table_privilege('authenticated', 'public.location_item_votes', 'insert')
     or has_table_privilege('authenticated', 'public.location_checkoffs', 'insert') then
    raise exception 'FAIL: the table grants on the location tables are not the expected ones';
  end if;

  if has_schema_privilege('anon', 'migration_106', 'usage')
     or has_schema_privilege('authenticated', 'migration_106', 'usage') then
    raise exception 'FAIL: anon or authenticated can use schema migration_106';
  end if;
end $$;

rollback;
