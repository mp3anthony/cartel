-- Behaviour tests for vote_location_item_correction after Migration C2 (issue #106,
-- Slice 4b and #155 -- migration 20261012000000_location_labels_votes.sql): the
-- proposal is stored with a leading capital, a change of case or spacing only is
-- applied at once with no second user, a real correction still waits for a second
-- independent voter, and the function's definition, lock and grants are right.
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
-- folds the name, capitalises the proposal, locks the tag row FOR UPDATE, executable
-- by authenticated only. 1 a proposal is stored capitalised ("aisle 9" becomes
-- "Aisle 9") and does not change the label. 2 a second independent voter applies it
-- and clears the item's votes. 3 a case-only proposal ("AISLE 9" on "Aisle 9")
-- applies at once with ONE voter, clears a sibling pending vote and leaves no vote
-- row; the label is then put back the same way. 4 a spacing-only proposal applies at
-- once. 5 proposing "dairy" on "Dairy" is still refused (correction_matches_current)
-- and leaves no row. 6 a raw item name ("MILK  ", an accented one) finds its folded
-- tag. 7 already_voted still works. 8 item_not_tagged still works. 9 a blank
-- proposal still hits the proposed_section CHECK (23514) and leaves no row.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as the
-- owning role (which bypasses RLS; the tidy trigger still capitalises a new tag's
-- section). Only the behaviour assertions run as `authenticated`.
-- `request.jwt.claims` must be set *before* the role switch. All non-ASCII text is
-- written as U& escapes.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. E, F and G share nothing. One store LOC. Tags: milk (Aisle 3), cheese
-- (Aisle, two spaces, 4), bread (Dairy), jalapeno (Aisle 5).
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
  ('83000000-0000-4000-8000-000000000155', 'cheese', 'Aisle  4'),
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

  if def not like '%public.capitalise_first(p_proposed_section)%' then
    raise exception 'FAIL: the vote function does not capitalise the proposal';
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
-- Assertion 1 -- a real correction waits, and the proposal is stored capitalised.
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
-- Assertion 3 -- a case-only proposal applies at once. G leaves a pending vote
-- ('Aisle 40') on milk. Then E proposes 'AISLE 9' on 'Aisle 9': it applies with E
-- alone, milk is now 'AISLE 9', G's vote is gone and no row was left for E. E then
-- proposes 'Aisle 9' (case-only back): milk is 'Aisle 9' again.
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
begin
  perform public.vote_location_item_correction(
    '83000000-0000-4000-8000-000000000155', 'milk', 'AISLE 9');

  if (select section from public.location_items
      where location_id = '83000000-0000-4000-8000-000000000155' and name = 'milk') <> 'AISLE 9' then
    raise exception 'FAIL: a case-only proposal did not apply at once with a single voter';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155' and item_name = 'milk') <> 0 then
    raise exception 'FAIL: a case-only apply left vote rows behind (E''s own, or G''s sibling vote)';
  end if;

  perform public.vote_location_item_correction(
    '83000000-0000-4000-8000-000000000155', 'milk', 'Aisle 9');

  if (select section from public.location_items
      where location_id = '83000000-0000-4000-8000-000000000155' and name = 'milk') <> 'Aisle 9' then
    raise exception 'FAIL: putting the label back with a case-only proposal did not apply';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155' and item_name = 'milk') <> 0 then
    raise exception 'FAIL: the second case-only apply left a vote row behind';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 -- a spacing-only proposal applies at once. As E, propose 'Aisle 4'
-- on cheese (stored 'Aisle  4' with two spaces).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155e1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select section from public.location_items
      where location_id = '83000000-0000-4000-8000-000000000155' and name = 'cheese') <> 'Aisle  4' then
    raise exception 'FAIL: fixture: cheese should start as ''Aisle  4'' with two spaces';
  end if;

  perform public.vote_location_item_correction(
    '83000000-0000-4000-8000-000000000155', 'cheese', 'Aisle 4');

  if (select section from public.location_items
      where location_id = '83000000-0000-4000-8000-000000000155' and name = 'cheese') <> 'Aisle 4' then
    raise exception 'FAIL: a spacing-only proposal did not apply at once';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '83000000-0000-4000-8000-000000000155' and item_name = 'cheese') <> 0 then
    raise exception 'FAIL: a spacing-only apply left a vote row behind';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 -- proposing 'dairy' on bread ('Dairy') is refused: the proposal is
-- capitalised first, so it equals the label. No vote row is left.
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
-- Assertion 9 -- a blank proposal is still refused by the proposed_section CHECK
-- (23514), not accepted: it is empty after capitalise_first trims it. No row is left.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000155e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  st text;
begin
  begin
    perform public.vote_location_item_correction(
      '83000000-0000-4000-8000-000000000155', 'jalapeno', '   ');
  exception when others then
    st := sqlstate;
  end;

  if st is distinct from '23514' then
    raise exception 'FAIL: a blank proposal gave sqlstate % (null = accepted), expected 23514', st;
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
