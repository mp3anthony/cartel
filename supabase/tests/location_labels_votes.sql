-- Behaviour tests for vote_location_item_correction after Migration C2 (issue #106,
-- Slice 4b and #155 -- migration 20261012000000_location_labels_votes.sql) as changed
-- by #112 (20261114000000_item_location_standard_labels.sql): the proposal is read
-- as a standard Item location ("aisle 9" is stored "Aisle 9"), a real correction still
-- waits for a second independent voter, and the function's definition, lock and
-- grants are right. Since #112 a proposal that differs from the label only by case or
-- spacing reads as the same standard label, so it is refused as
-- correction_matches_current (C2 applied it at once with one voter; that branch is now
-- unreachable). The #112 label rules themselves are tested in
-- item_location_labels.sql.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor (or the MCP
-- `execute_sql` tool) against project chacavfoewyiwrfgvxtj, AFTER the migration is
-- applied. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The file is wrapped in
-- `begin ... rollback` and leaves nothing behind. State carries forward between
-- assertions: they are not independent and must not be reordered. The data
-- transforms of the same migration are tested in location_labels_transform.sql.
--
-- WHAT IT GUARDS. 0 the function's definition: security definer, empty search_path,
-- folds the name, reads the proposal with item_location_label (#112), locks the tag
-- row FOR UPDATE, executable by authenticated only. 1 a proposal is stored as the
-- standard label ("aisle 9" becomes "Aisle 9") and does not change the label. 2 a
-- second independent voter applies it and clears the item's votes. 3 a case-only
-- proposal ("AISLE 9" on "Aisle 9") is refused (correction_matches_current), leaves
-- no row and keeps a sibling pending vote. 4 a spacing-only proposal ("aisle  4" on
-- "Aisle 4") is refused the same way. 5 proposing "dairy" on "Dairy" is still refused
-- (correction_matches_current) and leaves no row. 6 a raw item name ("MILK  ", an
-- accented one) finds its folded tag. 7 already_voted still works. 8 item_not_tagged
-- still works. 9 a blank proposal is refused with 23514 and the #112 message and
-- leaves no row.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as the
-- owning role (which bypasses RLS; since #112 the standard-label trigger still reads a
-- new tag's section, so cheese's 'aisle  04' is stored 'Aisle 4'). Only the behaviour
-- assertions run as `authenticated`.
-- `request.jwt.claims` must be set *before* the role switch. All non-ASCII text is
-- written as U& escapes.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. E, F and G share nothing. One store LOC. Tags: milk (Aisle 3), cheese
-- (inserted as 'aisle  04', stored 'Aisle 4'), bread (Dairy), jalapeno (Aisle 5).
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000155e1', true),  -- E
  ('00000000-0000-4000-8000-0000000155f1', true),  -- F
  ('00000000-0000-4000-8000-0000000155a1', true);  -- G

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('83000000-0000-4000-8000-000000000155',
   'Test Supermarket (location_labels_votes)', -36.8485, 174.7633, 'new_world',
   '00000000-0000-4000-8000-0000000155e1');

insert into public.location_items (location_id, name, section) values
  ('83000000-0000-4000-8000-000000000155', 'milk', 'Aisle 3'),
  ('83000000-0000-4000-8000-000000000155', 'cheese', 'aisle  04'),
  ('83000000-0000-4000-8000-000000000155', 'bread', 'Dairy'),
  ('83000000-0000-4000-8000-000000000155', 'jalapeno', 'Aisle 5');

-- ---------------------------------------------------------------------------
-- Assertion 0 -- the definition and the grants.
-- ---------------------------------------------------------------------------

do $$
declare
  def text := pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure);
begin
  if not (select p.prosecdef from pg_proc p
          where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure) then
    raise exception 'FAIL: vote_location_item_correction is not security definer';
  end if;

  if (select array_to_string(p.proconfig, ',') from pg_proc p
      where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure)
     not like '%search_path=""%' then
    raise exception 'FAIL: vote_location_item_correction does not have an empty search_path';
  end if;

  if def not like '%public.fold_item_name(p_item_name)%' then
    raise exception 'FAIL: the vote function does not fold the item name';
  end if;

  if def not like '%public.item_location_label(p_proposed_section)%'
     or def like '%public.capitalise_first(p_proposed_section)%' then
    raise exception 'FAIL: the vote function does not read the proposal with item_location_label (#112)';
  end if;

  if def not ilike '%for update%' then
    raise exception 'FAIL: the vote function does not lock the tag row FOR UPDATE';
  end if;

  if has_function_privilege('anon', 'public.vote_location_item_correction(uuid, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.vote_location_item_correction(uuid, text, text)', 'execute') then
    raise exception 'FAIL: vote_location_item_correction must be executable by authenticated only';
  end if;

  if exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure
      and a.grantee = 0
  ) then
    raise exception 'FAIL: PUBLIC can execute vote_location_item_correction';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 1 -- a real correction waits, and the proposal is stored as the standard
-- label.
-- As E, propose 'aisle 9' for milk (now Aisle 3): one vote row 'Aisle 9', label
-- unchanged.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155e1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '83000000-0000-4000-8000-000000000155', 'milk', 'aisle 9');

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155'
        and item_name = 'milk' and proposed_section = 'Aisle 9') <> 1 then
    raise exception 'FAIL: E''s proposal ''aisle 9'' was not stored as one vote row ''Aisle 9''';
  end if;

  if (select section from public.location_items
      where location_id = '83000000-0000-4000-8000-000000000155' and name = 'milk') <> 'Aisle 3' then
    raise exception 'FAIL: one vote changed milk''s label';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 -- the second independent voter applies it. As F, confirm 'Aisle 9'.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155f1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '83000000-0000-4000-8000-000000000155', 'milk', 'Aisle 9');

  if (select section from public.location_items
      where location_id = '83000000-0000-4000-8000-000000000155' and name = 'milk') <> 'Aisle 9' then
    raise exception 'FAIL: the second voter''s ''Aisle 9'' did not apply the correction';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155' and item_name = 'milk') <> 0 then
    raise exception 'FAIL: applying the correction did not clear milk''s vote rows';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 -- a case-only proposal is refused (#112). G leaves a pending vote
-- ('Aisle 40') on milk. Then E proposes 'AISLE 9' on 'Aisle 9': it reads as 'Aisle 9',
-- so it is refused as correction_matches_current, milk stays 'Aisle 9', E leaves no
-- row and G's sibling vote is still there.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155a1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '83000000-0000-4000-8000-000000000155', 'milk', 'Aisle 40');

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155' and item_name = 'milk') <> 1 then
    raise exception 'FAIL: G''s pending vote on milk was not stored';
  end if;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  begin
    perform public.vote_location_item_correction(
      '83000000-0000-4000-8000-000000000155', 'milk', 'AISLE 9');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'correction_matches_current' then
    raise exception 'FAIL: a case-only proposal (AISLE 9 on Aisle 9) gave % (null = accepted), expected correction_matches_current', msg;
  end if;

  if (select section from public.location_items
      where location_id = '83000000-0000-4000-8000-000000000155' and name = 'milk') <> 'Aisle 9' then
    raise exception 'FAIL: the refused case-only proposal changed milk''s label';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155'
        and item_name = 'milk' and proposed_section = 'Aisle 40') <> 1
     or (select count(*) from public.location_item_votes
         where location_id = '83000000-0000-4000-8000-000000000155' and item_name = 'milk') <> 1 then
    raise exception 'FAIL: the refused case-only proposal left a row, or removed G''s pending vote';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 -- a spacing-only proposal is refused (#112). cheese was inserted as
-- 'aisle  04' and stored as 'Aisle 4'; as E, propose 'aisle  4' (two spaces): it
-- reads as 'Aisle 4', so correction_matches_current, and no row is left.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  msg text;
begin
  if (select section from public.location_items
      where location_id = '83000000-0000-4000-8000-000000000155' and name = 'cheese') <> 'Aisle 4' then
    raise exception 'FAIL: fixture: cheese inserted as ''aisle  04'' should be stored as ''Aisle 4''';
  end if;

  begin
    perform public.vote_location_item_correction(
      '83000000-0000-4000-8000-000000000155', 'cheese', 'aisle  4');
  exception when others then
    msg := sqlerrm;
  end;

  if msg is distinct from 'correction_matches_current' then
    raise exception 'FAIL: a spacing-only proposal gave % (null = accepted), expected correction_matches_current', msg;
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155' and item_name = 'cheese') <> 0 then
    raise exception 'FAIL: the refused spacing-only proposal left a vote row behind';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 -- proposing 'dairy' on bread ('Dairy') is refused: the proposal is
-- read as the standard label first, so it equals the label. No vote row is left.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155f1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  msg text;
begin
  begin
    perform public.vote_location_item_correction(
      '83000000-0000-4000-8000-000000000155', 'bread', 'dairy');
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;

  if not raised then
    raise exception 'FAIL: proposing ''dairy'' on a ''Dairy'' tag succeeded';
  end if;

  if msg <> 'correction_matches_current' then
    raise exception 'FAIL: proposing ''dairy'' on ''Dairy'' raised % -- expected correction_matches_current', msg;
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155' and item_name = 'bread') <> 0 then
    raise exception 'FAIL: the refused ''dairy'' proposal left a vote row behind';
  end if;

  if (select section from public.location_items
      where location_id = '83000000-0000-4000-8000-000000000155' and name = 'bread') <> 'Dairy' then
    raise exception 'FAIL: the refused ''dairy'' proposal changed bread''s label';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 -- the raw item name is folded. As F, propose 'Aisle 41' for 'MILK  '
-- (upper case, trailing spaces) and 'Aisle 6' for the accented Jalape<n tilde>o name
-- with a trailing space. Each lands on the folded tag.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155f1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '83000000-0000-4000-8000-000000000155', 'MILK  ', 'Aisle 41');

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155'
        and item_name = 'milk' and proposed_section = 'Aisle 41') <> 1 then
    raise exception 'FAIL: ''MILK  '' did not find the folded milk tag';
  end if;

  perform public.vote_location_item_correction(
    '83000000-0000-4000-8000-000000000155', U&'Jalape\00F1o ', 'Aisle 6');

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155'
        and item_name = 'jalapeno' and proposed_section = 'Aisle 6') <> 1 then
    raise exception 'FAIL: the accented raw name did not find the folded jalapeno tag';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 7 -- already_voted. F repeats (milk, Aisle 41): refused, still one row.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155f1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  msg text;
begin
  begin
    perform public.vote_location_item_correction(
      '83000000-0000-4000-8000-000000000155', 'milk', 'aisle 41');
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;

  if not raised or msg <> 'already_voted' then
    raise exception 'FAIL: F''s repeat vote raised % (raised: %) -- expected already_voted', msg, raised;
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155'
        and item_name = 'milk' and proposed_section = 'Aisle 41') <> 1 then
    raise exception 'FAIL: the repeat vote changed the number of vote rows for (milk, Aisle 41)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 8 -- item_not_tagged still works.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  msg text;
begin
  begin
    perform public.vote_location_item_correction(
      '83000000-0000-4000-8000-000000000155', 'eggs', 'Aisle 5');
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;

  if not raised or msg <> 'item_not_tagged' then
    raise exception 'FAIL: an untagged item raised % (raised: %) -- expected item_not_tagged', msg, raised;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 9 -- a blank proposal is refused with 23514 and the #112 message (it reads
-- as no standard label), not accepted. No row is left.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  st text;
  msg text;
begin
  begin
    perform public.vote_location_item_correction(
      '83000000-0000-4000-8000-000000000155', 'jalapeno', '   ');
  exception when others then
    st := sqlstate;
    msg := sqlerrm;
  end;

  if st is distinct from '23514'
     or msg is distinct from 'That isn''t a standard Item location. Pick a section, or Aisle 1 to 999.' then
    raise exception 'FAIL: a blank proposal gave (sqlstate %, %) (null = accepted), expected 23514 and the #112 message', st, msg;
  end if;

  -- voter_id is not readable by authenticated, so count the item's rows instead:
  -- only F's assertion 6 vote ('Aisle 6') may be there.
  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155'
        and item_name = 'jalapeno') <> 1 then
    raise exception 'FAIL: the blank proposal left a vote row behind (or F''s earlier vote is gone)';
  end if;
end $$;

reset role;

rollback;
