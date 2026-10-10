-- Fixture tests for the destructive data steps of Migration C2 and for its revert
-- (issue #106, Slice 4b and #155 -- migration 20261012000000_location_labels_votes.sql,
-- revert supabase/rollback/106_c2_revert.sql).
--
-- WHY THIS EXISTS. Production has no disposable copy (docs/lessons.md), and the real
-- data will probably hit none of the interesting branches (a duplicate pair, a proposal
-- that equals the mapped label, an unmapped proposal on a surviving tag, a cleared tag
-- with votes, a tuple that reaches two voters only through the mapping). The migration
-- keeps its transforms in migration_106.c2_transform(scope), its invariants in
-- migration_106.c2_check(scope) and the data half of the undo in
-- migration_106.c2_revert_data(scope), each taking a list of store ids. This file
-- builds pre-C2 rows in one fixture store, runs those exact functions on that store
-- only, and checks the result and the undo.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor (or the MCP
-- `execute_sql` tool) against project chacavfoewyiwrfgvxtj, AFTER the migration is
-- applied and while schema migration_106 still exists (it is dropped 30 days after C2;
-- after that this file cannot run and is retired). Success is silence: every assertion
-- raises only when it fails. The file is wrapped in `begin ... rollback`: the fixture
-- rows, and the log rows the functions write for them, are rolled back; the real
-- run's backups and logs are not touched (every function works on the fixture store
-- only). It runs as the owning role.
--
-- WHAT IT GUARDS. 1 c2_target_label on many label spellings (the rules, and the
-- Ant-approved map: 15, 23, Fruit & Vegetables, Meat; Dali cleared). 2 c2_transform on
-- a store with every branch: tag_cleared, proposal_unmapped, duplicate,
-- proposal_rewritten, equals_current, applied_d6, a label rewritten by rule 1, rule 2
-- and the map (a test-only key is added to the map inside this transaction), a tag
-- cleared with no votes, tags and votes that must not change, and a second store that
-- must not be touched at all. 3 c2_check passes on the result and raises when a
-- non-standard label is put back. 4 c2_revert_data restores the cleared tags and the
-- old labels and votes by id, leaves a label changed since the run, a tag re-created
-- since the run and a vote cast since the run alone, and skips a vote whose voter no
-- longer exists. All non-ASCII text would be written as U& escapes; there is none.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. Voters A, B, C. Store LOC (in scope), store LOC2 (out of scope).
-- Tags are inserted, then their sections are set to the raw pre-C2 spellings with an
-- update (the tidy trigger capitalises on insert only, so an update keeps them raw).
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000155b1', true),  -- A
  ('00000000-0000-4000-8000-0000000155b2', true),  -- B
  ('00000000-0000-4000-8000-0000000155b3', true);  -- C

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('84000000-0000-4000-8000-000000000155',
   'Test Supermarket (location_labels_transform)', -36.8485, 174.7633, 'new_world',
   '00000000-0000-4000-8000-0000000155b1'),
  ('84000000-0000-4000-8000-000000000156',
   'Test Supermarket 2 (location_labels_transform)', -36.8486, 174.7634, 'new_world',
   '00000000-0000-4000-8000-0000000155b1');

insert into public.location_items (id, location_id, name, section, created_at) values
  ('85000000-0000-4000-8000-000000000101', '84000000-0000-4000-8000-000000000155', 'milk',   'x', '2026-01-01'),
  ('85000000-0000-4000-8000-000000000102', '84000000-0000-4000-8000-000000000155', 'bread',  'x', '2026-01-01'),
  ('85000000-0000-4000-8000-000000000103', '84000000-0000-4000-8000-000000000155', 'cheese', 'x', '2026-01-01'),
  ('85000000-0000-4000-8000-000000000104', '84000000-0000-4000-8000-000000000155', 'soap',   'x', '2026-01-01'),
  ('85000000-0000-4000-8000-000000000105', '84000000-0000-4000-8000-000000000155', 'apples', 'x', '2026-01-01'),
  ('85000000-0000-4000-8000-000000000106', '84000000-0000-4000-8000-000000000155', 'eggs',   'x', '2026-01-01'),
  ('85000000-0000-4000-8000-000000000107', '84000000-0000-4000-8000-000000000155', 'rice',   'x', '2026-01-01'),
  ('85000000-0000-4000-8000-000000000108', '84000000-0000-4000-8000-000000000155', 'tea',    'x', '2026-01-01'),
  ('85000000-0000-4000-8000-000000000109', '84000000-0000-4000-8000-000000000155', 'jam',    'x', '2026-01-01'),
  ('85000000-0000-4000-8000-00000000010a', '84000000-0000-4000-8000-000000000155', 'oil',    'x', '2026-01-01'),
  ('85000000-0000-4000-8000-00000000010b', '84000000-0000-4000-8000-000000000155', 'pasta',  'x', '2026-01-01'),
  ('85000000-0000-4000-8000-00000000010c', '84000000-0000-4000-8000-000000000155', 'water',  'x', '2026-01-01'),
  ('85000000-0000-4000-8000-00000000010d', '84000000-0000-4000-8000-000000000156', 'cleaner', 'x', '2026-01-01');

update public.location_items li
set section = v.s
from (values
  ('85000000-0000-4000-8000-000000000101', 'aisle 4'),
  ('85000000-0000-4000-8000-000000000102', 'Bakery'),
  ('85000000-0000-4000-8000-000000000103', 'dairy section'),
  ('85000000-0000-4000-8000-000000000104', 'Cleaning'),
  ('85000000-0000-4000-8000-000000000105', 'Fruit and Veg'),
  ('85000000-0000-4000-8000-000000000106', 'Aisle 4'),
  ('85000000-0000-4000-8000-000000000107', 'Aisle 2'),
  ('85000000-0000-4000-8000-000000000108', 'Aisle 3'),
  ('85000000-0000-4000-8000-000000000109', 'Isle 12'),
  ('85000000-0000-4000-8000-00000000010a', 'Aisle 4a'),
  ('85000000-0000-4000-8000-00000000010b', 'greengrocer'),
  ('85000000-0000-4000-8000-00000000010c', 'The Beer and Wine Section'),
  ('85000000-0000-4000-8000-00000000010d', 'Cleaning')
) as v(id, s)
where li.id = v.id::uuid;

insert into public.location_item_votes (id, location_id, item_name, proposed_section, voter_id, created_at) values
  -- soap is cleared: its vote goes (tag_cleared)
  ('86000000-0000-4000-8000-000000000101', '84000000-0000-4000-8000-000000000155', 'soap',   'Aisle 9',     '00000000-0000-4000-8000-0000000155b1', '2026-02-01'),
  -- apples becomes 'Fruit & Veg'; the proposal maps to the same label (equals_current)
  ('86000000-0000-4000-8000-000000000102', '84000000-0000-4000-8000-000000000155', 'apples', 'fruit & veg', '00000000-0000-4000-8000-0000000155b1', '2026-02-01'),
  -- eggs survives: an unmapped proposal (proposal_unmapped) and one that is rewritten and kept
  ('86000000-0000-4000-8000-000000000103', '84000000-0000-4000-8000-000000000155', 'eggs',   'Cleaning',    '00000000-0000-4000-8000-0000000155b1', '2026-02-01'),
  ('86000000-0000-4000-8000-000000000104', '84000000-0000-4000-8000-000000000155', 'eggs',   'aisle 5',     '00000000-0000-4000-8000-0000000155b2', '2026-02-01'),
  -- rice: the same voter, two spellings of one proposal; the older one stays (duplicate)
  ('86000000-0000-4000-8000-000000000105', '84000000-0000-4000-8000-000000000155', 'rice',   'Aisle 7',     '00000000-0000-4000-8000-0000000155b1', '2026-01-01'),
  ('86000000-0000-4000-8000-000000000106', '84000000-0000-4000-8000-000000000155', 'rice',   'aisle 7',     '00000000-0000-4000-8000-0000000155b1', '2026-01-02'),
  -- tea: two voters on one proposal only after mapping (applied_d6), plus a third vote
  ('86000000-0000-4000-8000-000000000107', '84000000-0000-4000-8000-000000000155', 'tea',    'Aisle 8',     '00000000-0000-4000-8000-0000000155b1', '2026-02-01'),
  ('86000000-0000-4000-8000-000000000108', '84000000-0000-4000-8000-000000000155', 'tea',    'aisle 8',     '00000000-0000-4000-8000-0000000155b2', '2026-02-02'),
  ('86000000-0000-4000-8000-000000000109', '84000000-0000-4000-8000-000000000155', 'tea',    'Aisle 6',     '00000000-0000-4000-8000-0000000155b3', '2026-02-03'),
  -- jam: a clean pending proposal that must not change
  ('86000000-0000-4000-8000-00000000010a', '84000000-0000-4000-8000-000000000155', 'jam',    'Aisle 13',    '00000000-0000-4000-8000-0000000155b1', '2026-02-01'),
  -- the second store: out of scope, must not change
  ('86000000-0000-4000-8000-00000000010b', '84000000-0000-4000-8000-000000000156', 'cleaner', 'Aisle 2',    '00000000-0000-4000-8000-0000000155b1', '2026-02-01');

-- A test-only map entry for the "approved synonym" path (the production map is
-- untouched: this insert is rolled back with everything else).
insert into migration_106.c2_label_map (from_key, to_label) values
  ('greengrocer', 'Fruit & Veg');

-- ---------------------------------------------------------------------------
-- Assertion 1 -- c2_target_label on label spellings. null means cleared. The four
-- production map entries (Ant's approval) are asserted here too.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('aisle 4',                    'Aisle 4'),
      ('Aisle 04',                   'Aisle 4'),
      ('AISLE 12',                   'Aisle 12'),
      ('isle 12',                    'Aisle 12'),
      ('Aisle No. 7',                'Aisle 7'),
      ('aisle #3',                   'Aisle 3'),
      ('Aisle 4a',                   null),
      ('Aisle 4-5',                  null),
      ('Aisle',                      null),
      ('Aisle 0',                    null),
      ('Aisle 1000',                 null),
      ('dairy section',              'Dairy'),
      ('The Bakery Department',      'Bakery'),
      ('fruit and veg',              'Fruit & Veg'),
      ('Fruit & Veg',                'Fruit & Veg'),
      ('Health and Beauty',          'Health & Beauty'),
      ('beer & wine',                'Beer & Wine'),
      (' Frozen ',                   'Frozen'),
      ('FROZEN AISLE',               'Frozen'),
      ('Seafood',                    'Seafood'),
      ('Cleaning',                   null),
      ('Pet',                        null),
      ('Dali',                       null),
      ('16',                         null),
      ('15',                         'Aisle 15'),
      ('23',                         'Aisle 23'),
      ('Fruit & Vegetables',         'Fruit & Veg'),
      ('Meat',                       'Butchery'),
      ('greengrocer',                'Fruit & Veg')
    ) as t(label, expected)
  loop
    if migration_106.c2_target_label(r.label) is distinct from r.expected then
      raise exception 'FAIL: c2_target_label(%) is %, expected %',
        r.label, migration_106.c2_target_label(r.label), r.expected;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 2 -- c2_transform on the fixture store only.
-- ---------------------------------------------------------------------------

select migration_106.c2_transform(array['84000000-0000-4000-8000-000000000155'::uuid]);

do $$
declare
  loc constant uuid := '84000000-0000-4000-8000-000000000155';
  r record;
begin
  -- Tags: expected label by name; null = gone.
  for r in
    select * from (values
      ('milk',   'Aisle 4'),
      ('bread',  'Bakery'),
      ('cheese', 'Dairy'),
      ('soap',   null),
      ('apples', 'Fruit & Veg'),
      ('eggs',   'Aisle 4'),
      ('rice',   'Aisle 2'),
      ('tea',    'Aisle 8'),
      ('jam',    'Aisle 12'),
      ('oil',    null),
      ('pasta',  'Fruit & Veg'),
      ('water',  'Beer & Wine')
    ) as t(name, expected)
  loop
    if (select li.section from public.location_items li
        where li.location_id = loc and li.name = r.name) is distinct from r.expected then
      raise exception 'FAIL: after C2 the tag % has label %, expected %', r.name,
        (select li.section from public.location_items li where li.location_id = loc and li.name = r.name),
        r.expected;
    end if;
  end loop;

  -- Votes left: eggs/aisle 5 rewritten, rice/Aisle 7 (the older), jam/Aisle 13.
  if (select count(*) from public.location_item_votes where location_id = loc) <> 3 then
    raise exception 'FAIL: expected 3 votes left in the fixture store, found %',
      (select count(*) from public.location_item_votes where location_id = loc);
  end if;

  if not exists (select 1 from public.location_item_votes
                 where id = '86000000-0000-4000-8000-000000000104' and proposed_section = 'Aisle 5')
     or not exists (select 1 from public.location_item_votes
                    where id = '86000000-0000-4000-8000-000000000105' and proposed_section = 'Aisle 7')
     or not exists (select 1 from public.location_item_votes
                    where id = '86000000-0000-4000-8000-00000000010a' and proposed_section = 'Aisle 13') then
    raise exception 'FAIL: the surviving votes are not (eggs Aisle 5, rice Aisle 7, jam Aisle 13)';
  end if;

  -- Each deletion has its reason, once.
  for r in
    select * from (values
      ('86000000-0000-4000-8000-000000000101', 'tag_cleared'),
      ('86000000-0000-4000-8000-000000000102', 'equals_current'),
      ('86000000-0000-4000-8000-000000000103', 'proposal_unmapped'),
      ('86000000-0000-4000-8000-000000000106', 'duplicate'),
      ('86000000-0000-4000-8000-000000000107', 'applied_d6'),
      ('86000000-0000-4000-8000-000000000108', 'applied_d6'),
      ('86000000-0000-4000-8000-000000000109', 'applied_d6')
    ) as t(id, reason)
  loop
    if (select count(*) from migration_106.c2_vote_changes c
        where c.id = r.id::uuid and c.new_proposed is null and c.reason = r.reason) <> 1 then
      raise exception 'FAIL: vote % was not logged exactly once as deleted for reason %', r.id, r.reason;
    end if;

    if exists (select 1 from public.location_item_votes where id = r.id::uuid) then
      raise exception 'FAIL: vote % should be gone (%)', r.id, r.reason;
    end if;
  end loop;

  -- The D6 apply is logged with the label it replaced and the voter count.
  if not exists (select 1 from migration_106.c2_applied
                 where location_id = loc and item_name = 'tea'
                   and old_section = 'Aisle 3' and new_section = 'Aisle 8' and voters = 2) then
    raise exception 'FAIL: the D6 apply on tea was not logged as Aisle 3 to Aisle 8 with 2 voters';
  end if;

  -- The rewritten votes keep their old text in the log.
  if not exists (select 1 from migration_106.c2_vote_changes
                 where id = '86000000-0000-4000-8000-000000000104'
                   and reason = 'proposal_rewritten'
                   and old_proposed = 'aisle 5' and new_proposed = 'Aisle 5') then
    raise exception 'FAIL: the rewrite of the eggs vote was not logged';
  end if;

  -- The second store was not touched, and nothing was logged for it.
  if (select section from public.location_items
      where id = '85000000-0000-4000-8000-00000000010d') <> 'Cleaning'
     or not exists (select 1 from public.location_item_votes
                    where id = '86000000-0000-4000-8000-00000000010b' and proposed_section = 'Aisle 2') then
    raise exception 'FAIL: the out-of-scope store was changed';
  end if;

  if exists (select 1 from migration_106.c2_tag_changes
             where location_id = '84000000-0000-4000-8000-000000000156') then
    raise exception 'FAIL: a tag change was logged for the out-of-scope store';
  end if;

  -- An independent check of the standard set (not the migration's own list).
  if exists (
    select 1 from public.location_items li
    where li.location_id = loc
      and li.section <> all (array['Fruit & Veg', 'Butchery', 'Seafood', 'Deli', 'Bakery', 'Dairy',
                                   'Chilled', 'Frozen', 'Health & Beauty', 'Pharmacy', 'Beer & Wine'])
      and li.section !~ '^Aisle [1-9][0-9]{0,2}$'
  ) then
    raise exception 'FAIL: a fixture tag label is outside the standard set';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 3 -- c2_check passes and its summary is right; it raises when a
-- non-standard label is put back.
-- ---------------------------------------------------------------------------

do $$
declare
  scope constant uuid[] := array['84000000-0000-4000-8000-000000000155'::uuid];
  s jsonb := migration_106.c2_check(scope);
  msg text;
begin
  if (s->>'tags_before')::int <> 12 or (s->>'tags_after')::int <> 10
     or (s->>'tags_cleared')::int <> 2 or (s->>'tags_rewritten')::int <> 6
     or (s->>'tags_applied_d6')::int <> 1 then
    raise exception 'FAIL: tag summary is %', s;
  end if;

  if (s->>'votes_before')::int <> 10 or (s->>'votes_after')::int <> 3
     or (s->>'votes_deleted')::int <> 7 or (s->>'votes_rewritten')::int <> 3 then
    raise exception 'FAIL: vote summary is %', s;
  end if;

  if s->'votes_deleted_by_reason' <> '{"tag_cleared": 1, "equals_current": 1, "proposal_unmapped": 1, "duplicate": 1, "applied_d6": 3}'::jsonb then
    raise exception 'FAIL: deleted-by-reason summary is %', s->'votes_deleted_by_reason';
  end if;

  if jsonb_array_length(s->'cleared_labels') <> 2 then
    raise exception 'FAIL: expected two cleared labels, found %', s->'cleared_labels';
  end if;

  -- The checker must notice a bad label.
  update public.location_items set section = 'cleaning'
  where id = '85000000-0000-4000-8000-000000000101';

  begin
    perform migration_106.c2_check(scope);
  exception when others then
    msg := sqlerrm;
  end;

  if msg is null or msg not like 'FAIL:%standard set%' then
    raise exception 'FAIL: c2_check did not reject a non-standard label (got %)', msg;
  end if;

  update public.location_items set section = 'Aisle 4'
  where id = '85000000-0000-4000-8000-000000000101';

  perform migration_106.c2_check(scope);
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 4 -- the revert. First simulate life after the run: a correction changed
-- milk to Aisle 99; the oil tag was re-created by a shopper (a different id); voter C
-- was deleted; voter A cast a new vote on eggs.
-- ---------------------------------------------------------------------------

update public.location_items set section = 'Aisle 99'
where id = '85000000-0000-4000-8000-000000000101';

insert into public.location_items (id, location_id, name, section, created_at) values
  ('85000000-0000-4000-8000-0000000001a0', '84000000-0000-4000-8000-000000000155',
   'oil', 'Aisle 8', '2026-03-01');

delete from auth.users where id = '00000000-0000-4000-8000-0000000155b3';

insert into public.location_item_votes (id, location_id, item_name, proposed_section, voter_id, created_at) values
  ('86000000-0000-4000-8000-0000000001a0', '84000000-0000-4000-8000-000000000155',
   'eggs', 'Aisle 9', '00000000-0000-4000-8000-0000000155b1', '2026-03-02');

select migration_106.c2_revert_data(array['84000000-0000-4000-8000-000000000155'::uuid]);

do $$
declare
  loc constant uuid := '84000000-0000-4000-8000-000000000155';
  r record;
begin
  -- Labels back where C2 wrote them; milk keeps the later correction.
  for r in
    select * from (values
      ('milk',   'Aisle 99'),
      ('bread',  'Bakery'),
      ('cheese', 'dairy section'),
      ('soap',   'Cleaning'),
      ('apples', 'Fruit and Veg'),
      ('eggs',   'Aisle 4'),
      ('rice',   'Aisle 2'),
      ('tea',    'Aisle 3'),
      ('jam',    'Isle 12'),
      ('pasta',  'greengrocer'),
      ('water',  'The Beer and Wine Section')
    ) as t(name, expected)
  loop
    if (select li.section from public.location_items li
        where li.location_id = loc and li.name = r.name) is distinct from r.expected then
      raise exception 'FAIL: after the revert the tag % has label %, expected %', r.name,
        (select li.section from public.location_items li where li.location_id = loc and li.name = r.name),
        r.expected;
    end if;
  end loop;

  -- The cleared soap tag is back with its old id and created_at; oil is the tag
  -- re-created after the run (the cleared one is not re-inserted over it).
  if not exists (select 1 from public.location_items
                 where id = '85000000-0000-4000-8000-000000000104' and name = 'soap'
                   and created_at = '2026-01-01') then
    raise exception 'FAIL: the cleared soap tag was not restored by id';
  end if;

  if (select count(*) from public.location_items where location_id = loc and name = 'oil') <> 1
     or not exists (select 1 from public.location_items
                    where id = '85000000-0000-4000-8000-0000000001a0' and section = 'Aisle 8')
     or exists (select 1 from public.location_items
                where id = '85000000-0000-4000-8000-00000000010a') then
    raise exception 'FAIL: the oil tag re-created after the run was not left alone';
  end if;

  -- Votes: the originals are back with their old text; the one whose voter was
  -- deleted is not; the vote cast after the run stays.
  for r in
    select * from (values
      ('86000000-0000-4000-8000-000000000101', 'Aisle 9'),
      ('86000000-0000-4000-8000-000000000102', 'fruit & veg'),
      ('86000000-0000-4000-8000-000000000103', 'Cleaning'),
      ('86000000-0000-4000-8000-000000000104', 'aisle 5'),
      ('86000000-0000-4000-8000-000000000105', 'Aisle 7'),
      ('86000000-0000-4000-8000-000000000106', 'aisle 7'),
      ('86000000-0000-4000-8000-000000000107', 'Aisle 8'),
      ('86000000-0000-4000-8000-000000000108', 'aisle 8'),
      ('86000000-0000-4000-8000-00000000010a', 'Aisle 13'),
      ('86000000-0000-4000-8000-0000000001a0', 'Aisle 9')
    ) as t(id, expected)
  loop
    if (select v.proposed_section from public.location_item_votes v where v.id = r.id::uuid)
       is distinct from r.expected then
      raise exception 'FAIL: after the revert vote % has proposal %, expected %', r.id,
        (select v.proposed_section from public.location_item_votes v where v.id = r.id::uuid),
        r.expected;
    end if;
  end loop;

  if exists (select 1 from public.location_item_votes
             where id = '86000000-0000-4000-8000-000000000109') then
    raise exception 'FAIL: a vote whose voter no longer exists was re-inserted (or the insert did not skip it)';
  end if;

  if (select count(*) from public.location_item_votes where location_id = loc) <> 10 then
    raise exception 'FAIL: expected 10 votes in the fixture store after the revert, found %',
      (select count(*) from public.location_item_votes where location_id = loc);
  end if;

  -- The out-of-scope store is still untouched, and the tidy trigger is back on.
  if (select section from public.location_items
      where id = '85000000-0000-4000-8000-00000000010d') <> 'Cleaning' then
    raise exception 'FAIL: the out-of-scope store was changed by the revert';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_tidy' and not tgisinternal and tgenabled = 'O'
  ) then
    raise exception 'FAIL: location_items_tidy is not enabled after the revert';
  end if;
end $$;

rollback;
