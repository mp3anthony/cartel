-- Tests for public.leave_household(boolean, boolean) and the reworked
-- public.redeem_invite(text) (issue #90 Slice 1, migration
-- 20261018000000_leave_household.sql).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails. The
-- migration must already be applied for these to pass.
--
-- Fixtures are inserted as the owning role, which bypasses RLS. Actors run as
-- `authenticated` with request.jwt.claims set BEFORE the role switch (after it the
-- session may no longer be allowed to set the GUC, and auth.uid() reads it).
-- Negative RLS results are silent (zero rows), so ground truth is always read
-- through the bypass role (`reset role`), never through the denied actor.
--
-- WHAT IS NOT TESTED HERE. The harness commits each call on its own and runs one
-- session, so it cannot interleave two transactions. These are checked by the Code
-- Reviewer against the lock-order argument in the migration header:
--   * leave vs finish_shopping / reset_list / setChecked (items -> lists ->
--     households order, and the cascade delete waiting on them);
--   * join (redeem_invite, FOR KEY SHARE) vs leave (FOR UPDATE), including a join
--     racing the last member leaving;
--   * two concurrent leaves by the same user (double tap).
--
-- Cast (joined_at is set explicitly so "earliest joined" is provable):
--   A  joined 2026-01-01  member of H1, owns L1/L4/L3 and shop rows S1/S2
--   D  joined 2026-02-01  member of H1, owns L2           <- expected successor
--   E  joined 2026-03-01  member of H1 (lowest user id of D/E, inserted first, so a
--                          wrong "first row" or "lowest id" rule would pick E)
--   B  stranger, no household
--   F  sole member of H2
--   G  no household, later joins H1
-- Lists: L1 shared (A) with a ticked+recorded item, a soft-deleted item and a
-- quantity-3 item, and a store; L2 shared (D), no store; L4 shared soft-deleted (A);
-- L3 personal (A); L5 shared (F) with two items; L6 personal (F).

begin;

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-000000009001', true),  -- A
  ('00000000-0000-4000-8000-000000009002', true),  -- E
  ('00000000-0000-4000-8000-000000009003', true),  -- D
  ('00000000-0000-4000-8000-000000009004', true),  -- B
  ('00000000-0000-4000-8000-000000009005', true),  -- F
  ('00000000-0000-4000-8000-000000009006', true);  -- G

insert into public.households (id, name) values
  ('90000000-0000-4000-8000-000000009001', 'Test Household H1'),
  ('90000000-0000-4000-8000-000000009002', 'Test Household H2');

-- E is inserted first and has a lower user id than D: only joined_at makes D the
-- successor.
insert into public.household_members (user_id, household_id, joined_at) values
  ('00000000-0000-4000-8000-000000009002', '90000000-0000-4000-8000-000000009001', '2026-03-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000009003', '90000000-0000-4000-8000-000000009001', '2026-02-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000009001', '90000000-0000-4000-8000-000000009001', '2026-01-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000009005', '90000000-0000-4000-8000-000000009002', '2026-01-01T00:00:00Z');

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('91000000-0000-4000-8000-000000009001',
   'Test Supermarket Leave', -43.5321, 172.6362, 'new_world',
   '00000000-0000-4000-8000-000000009001');

insert into public.lists (id, owner_id, household_id, name, location_id, deleted_at) values
  ('92000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000009001',
   '90000000-0000-4000-8000-000000009001', 'Weekly shop',
   '91000000-0000-4000-8000-000000009001', null),
  ('92000000-0000-4000-8000-000000009002', '00000000-0000-4000-8000-000000009003',
   '90000000-0000-4000-8000-000000009001', 'Party', null, null),
  ('92000000-0000-4000-8000-000000009003', '00000000-0000-4000-8000-000000009001',
   null, 'Mine', null, null),
  ('92000000-0000-4000-8000-000000009004', '00000000-0000-4000-8000-000000009001',
   '90000000-0000-4000-8000-000000009001', 'Old list', null, now()),
  ('92000000-0000-4000-8000-000000009005', '00000000-0000-4000-8000-000000009005',
   '90000000-0000-4000-8000-000000009002', 'Pantry', null, null),
  ('92000000-0000-4000-8000-000000009006', '00000000-0000-4000-8000-000000009005',
   null, 'Mine6', null, null);

insert into public.list_items (id, list_id, name, position, quantity, checked_at, deleted_at) values
  ('93000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009001', 'Milk',  'a0', 3, null, null),
  ('93000000-0000-4000-8000-000000009002', '92000000-0000-4000-8000-000000009001', 'Eggs',  'a1', 1, now(), null),
  ('93000000-0000-4000-8000-000000009003', '92000000-0000-4000-8000-000000009001', 'Bread', 'a2', 1, null, now()),
  ('93000000-0000-4000-8000-000000009004', '92000000-0000-4000-8000-000000009002', 'Chips', 'a0', 1, null, null),
  ('93000000-0000-4000-8000-000000009005', '92000000-0000-4000-8000-000000009003', 'Soap',  'a0', 1, null, null),
  ('93000000-0000-4000-8000-000000009006', '92000000-0000-4000-8000-000000009004', 'Dust',  'a0', 1, null, null),
  ('93000000-0000-4000-8000-000000009007', '92000000-0000-4000-8000-000000009005', 'Rice',  'a0', 2, null, null),
  ('93000000-0000-4000-8000-000000009008', '92000000-0000-4000-8000-000000009005', 'Beans', 'a1', 1, null, null),
  ('93000000-0000-4000-8000-000000009009', '92000000-0000-4000-8000-000000009006', 'Tea',   'a0', 1, null, null);

-- An insert forces recorded_at to null, so mark the Eggs tick as already recorded
-- with a separate update (touching recorded_at alone does not fire the clear
-- trigger, which is BEFORE UPDATE OF checked_at).
update public.list_items set recorded_at = now()
where id = '93000000-0000-4000-8000-000000009002';

-- The item writes above bumped last_activity_at. Set known, distinct values (a
-- lists-only update of last_activity_at fires no activity trigger).
update public.lists set last_activity_at = '2026-05-01T00:00:00Z'
where id = '92000000-0000-4000-8000-000000009001';
update public.lists set last_activity_at = '2026-05-02T00:00:00Z'
where id = '92000000-0000-4000-8000-000000009002';

insert into public.shop_sessions
  (id, owner_id, household_id, location_id, list_id, item_names, checked_item_names) values
  ('94000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000009001',
   '90000000-0000-4000-8000-000000009001', '91000000-0000-4000-8000-000000009001',
   '92000000-0000-4000-8000-000000009001', array['Milk'], array['Milk']),          -- S1 household (A)
  ('94000000-0000-4000-8000-000000009002', '00000000-0000-4000-8000-000000009001',
   null, '91000000-0000-4000-8000-000000009001',
   null, array['Soap'], array['Soap']),                                             -- S2 personal (A)
  ('94000000-0000-4000-8000-000000009005', '00000000-0000-4000-8000-000000009005',
   '90000000-0000-4000-8000-000000009002', '91000000-0000-4000-8000-000000009001',
   '92000000-0000-4000-8000-000000009005', array['Rice'], array['Rice']),          -- S5 household (F)
  ('94000000-0000-4000-8000-000000009006', '00000000-0000-4000-8000-000000009005',
   null, '91000000-0000-4000-8000-000000009001',
   '92000000-0000-4000-8000-000000009005', array['Rice'], array['Rice']);          -- S6 personal (F) pointing at L5

insert into public.household_invites
  (id, household_id, code, created_by, expires_at, redeemed_at, redeemed_by) values
  ('95000000-0000-4000-8000-000000009001', '90000000-0000-4000-8000-000000009001',
   'TESTA1', '00000000-0000-4000-8000-000000009001', now() + interval '12 hours', null, null),  -- I1 (A's, valid)
  ('95000000-0000-4000-8000-000000009002', '90000000-0000-4000-8000-000000009001',
   'TESTB2', '00000000-0000-4000-8000-000000009003', now() + interval '12 hours', null, null),  -- I2 (D's, valid)
  ('95000000-0000-4000-8000-000000009003', '90000000-0000-4000-8000-000000009001',
   'TESTC3', '00000000-0000-4000-8000-000000009003', now() - interval '1 hour', null, null),    -- I3 expired
  ('95000000-0000-4000-8000-000000009004', '90000000-0000-4000-8000-000000009002',
   'TESTD4', '00000000-0000-4000-8000-000000009005', now() + interval '12 hours', null, null),  -- I5 (H2)
  ('95000000-0000-4000-8000-000000009005', '90000000-0000-4000-8000-000000009001',
   'TESTE5', '00000000-0000-4000-8000-000000009003', now() + interval '12 hours', null, null);  -- I4 (lowercase/padding test)

-- Stash row counts of the Item location tables, to prove leaving never touches them
-- (assertion 13). location_checkoffs gains exactly one row from the finish_shopping
-- in assertion 4.
select
  set_config('cartel.t_loc_items',    (select count(*) from public.location_items)::text, true),
  set_config('cartel.t_loc_votes',    (select count(*) from public.location_item_votes)::text, true),
  set_config('cartel.t_loc_checkoffs', (select count(*) from public.location_checkoffs)::text, true);

-- ---------------------------------------------------------------------------
-- Assertion 0 - positive control: A sees L1, L2, L3, L4 and S1, S2.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009001","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.lists where id in (
        '92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009002',
        '92000000-0000-4000-8000-000000009003', '92000000-0000-4000-8000-000000009004')) <> 4 then
    raise exception 'FAIL: A cannot see L1, L2, L3, L4 before leaving (positive control)';
  end if;
  if (select count(*) from public.shop_sessions where id in (
        '94000000-0000-4000-8000-000000009001', '94000000-0000-4000-8000-000000009002')) <> 2 then
    raise exception 'FAIL: A cannot see S1, S2 before leaving (positive control)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 - catalogue: security definer, empty search_path, no argument
-- defaults, a single overload (two would give PostgREST PGRST203), anon cannot
-- execute, authenticated can. redeem_invite keeps its grants and has the lock.
-- ---------------------------------------------------------------------------

do $$
declare
  v_oid oid;
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'leave_household') <> 1 then
    raise exception 'FAIL: leave_household must have exactly one overload';
  end if;

  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'leave_household';

  if not (select p.prosecdef from pg_proc p where p.oid = v_oid) then
    raise exception 'FAIL: leave_household is not security definer';
  end if;
  if not (select coalesce(p.proconfig, '{}') @> array['search_path=""'] from pg_proc p where p.oid = v_oid) then
    raise exception 'FAIL: leave_household does not set search_path to empty';
  end if;
  if (select p.pronargdefaults from pg_proc p where p.oid = v_oid) <> 0 then
    raise exception 'FAIL: leave_household has argument defaults';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'FAIL: anon can execute leave_household';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'FAIL: authenticated cannot execute leave_household';
  end if;

  if not has_function_privilege('authenticated', 'public.redeem_invite(text)'::regprocedure, 'execute') then
    raise exception 'FAIL: authenticated cannot execute redeem_invite';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.redeem_invite(text)'::regprocedure) then
    raise exception 'FAIL: redeem_invite is not security definer';
  end if;
  if pg_get_functiondef('public.redeem_invite(text)'::regprocedure) not ilike '%for key share%' then
    raise exception 'FAIL: redeem_invite does not take the households key share lock';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 2 - A leaves (no copy, no delete): outcome 'left', zero copies.
-- Ownership of A's shared lists (live and soft-deleted) and household shop rows
-- moves to D (earliest joined of D/E); personal rows and the invite are untouched.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_outcome text;
  v_copied integer;
begin
  select r.outcome, r.copied_lists into v_outcome, v_copied
  from public.leave_household(false, false) r;

  if v_outcome is distinct from 'left' or v_copied is distinct from 0 then
    raise exception 'FAIL: A leaving returned (%, %), expected (left, 0)', v_outcome, v_copied;
  end if;
end $$;

reset role;

do $$
begin
  if exists (select 1 from public.household_members
             where user_id = '00000000-0000-4000-8000-000000009001') then
    raise exception 'FAIL: A is still a member after leaving';
  end if;
  if not exists (select 1 from public.households where id = '90000000-0000-4000-8000-000000009001') then
    raise exception 'FAIL: H1 was deleted although D and E remain';
  end if;
  if not exists (select 1 from public.household_members
                 where user_id = '00000000-0000-4000-8000-000000009003'
                   and household_id = '90000000-0000-4000-8000-000000009001') then
    raise exception 'FAIL: D is no longer a member of H1';
  end if;

  if (select count(*) from public.lists
      where id in ('92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009004')
        and owner_id = '00000000-0000-4000-8000-000000009003'
        and household_id = '90000000-0000-4000-8000-000000009001') <> 2 then
    raise exception 'FAIL: L1 and soft-deleted L4 did not move to D (earliest joined) with household_id kept';
  end if;
  if not exists (select 1 from public.lists
                 where id = '92000000-0000-4000-8000-000000009002'
                   and owner_id = '00000000-0000-4000-8000-000000009003') then
    raise exception 'FAIL: L2 changed owner';
  end if;
  if not exists (select 1 from public.shop_sessions
                 where id = '94000000-0000-4000-8000-000000009001'
                   and owner_id = '00000000-0000-4000-8000-000000009003'
                   and household_id = '90000000-0000-4000-8000-000000009001') then
    raise exception 'FAIL: household shop session S1 did not move to D';
  end if;

  if not exists (select 1 from public.lists
                 where id = '92000000-0000-4000-8000-000000009003'
                   and owner_id = '00000000-0000-4000-8000-000000009001'
                   and household_id is null) then
    raise exception 'FAIL: personal list L3 was touched';
  end if;
  if not exists (select 1 from public.shop_sessions
                 where id = '94000000-0000-4000-8000-000000009002'
                   and owner_id = '00000000-0000-4000-8000-000000009001'
                   and household_id is null) then
    raise exception 'FAIL: personal shop session S2 was touched';
  end if;

  if not exists (select 1 from public.household_invites
                 where code = 'TESTA1' and redeemed_at is null and expires_at > now()) then
    raise exception 'FAIL: A''s unredeemed invite was changed by leaving';
  end if;

  if (select last_activity_at from public.lists where id = '92000000-0000-4000-8000-000000009001')
     is distinct from '2026-05-01T00:00:00Z'::timestamptz then
    raise exception 'FAIL: moving ownership bumped L1 last_activity_at';
  end if;
  if (select count(*) from public.list_items
      where list_id in ('92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009004')) <> 4 then
    raise exception 'FAIL: items of the moved lists changed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 3 - A, now outside, sees none of H1's rows, but still sees personal.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009001","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if exists (select 1 from public.lists where id in (
        '92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009002',
        '92000000-0000-4000-8000-000000009004')) then
    raise exception 'FAIL: A can still see H1 lists after leaving';
  end if;
  if exists (select 1 from public.list_items where list_id in (
        '92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009002',
        '92000000-0000-4000-8000-000000009004')) then
    raise exception 'FAIL: A can still see H1 list items after leaving';
  end if;
  if exists (select 1 from public.shop_sessions where id = '94000000-0000-4000-8000-000000009001') then
    raise exception 'FAIL: A can still see the household shop session after leaving';
  end if;
  if exists (select 1 from public.households) then
    raise exception 'FAIL: A can still see a household row after leaving';
  end if;
  if exists (select 1 from public.household_members) then
    raise exception 'FAIL: A can still see household_members rows after leaving';
  end if;
  if exists (select 1 from public.household_invites) then
    raise exception 'FAIL: A can still see household_invites rows after leaving';
  end if;

  if not exists (select 1 from public.lists where id = '92000000-0000-4000-8000-000000009003') then
    raise exception 'FAIL: A lost sight of the personal list L3';
  end if;
  if not exists (select 1 from public.shop_sessions where id = '94000000-0000-4000-8000-000000009002') then
    raise exception 'FAIL: A lost sight of the personal shop session S2';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 - D (the successor) still sees everything, the household has two
-- members left, and D can use the moved list: tick an item and run
-- finish_shopping on L1 (owner is now D; both paths are owner-or-household checks).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009003","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_checked integer;
  v_total integer;
begin
  if (select count(*) from public.lists where id in (
        '92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009002')) <> 2 then
    raise exception 'FAIL: D cannot see L1 and L2';
  end if;
  if (select count(*) from public.list_items where list_id in (
        '92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009002')) <> 4 then
    raise exception 'FAIL: D cannot see the items of L1 and L2';
  end if;
  if not exists (select 1 from public.shop_sessions where id = '94000000-0000-4000-8000-000000009001') then
    raise exception 'FAIL: D cannot see the moved household shop session';
  end if;
  if (select count(*) from public.household_members) <> 2 then
    raise exception 'FAIL: D sees a member count other than 2 (D and E)';
  end if;

  update public.list_items set checked_at = now()
  where id = '93000000-0000-4000-8000-000000009001';
  if not found then
    raise exception 'FAIL: D could not tick an item on the moved list L1';
  end if;

  select f.checked_count, f.total_count into v_checked, v_total
  from public.finish_shopping('92000000-0000-4000-8000-000000009001', 'continue') f;
  if v_checked is distinct from 1 or v_total is distinct from 2 then
    raise exception 'FAIL: finish_shopping on the moved list returned (%, %), expected (1, 2)', v_checked, v_total;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 - A leaving again (no household) is not_in_household.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_msg text;
begin
  begin
    perform 1 from public.leave_household(false, false);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'not_in_household' then
    raise exception 'FAIL: leaving twice raised % instead of not_in_household', v_msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 - A's own invite code stays valid: A redeems it, rejoins H1, and
-- sees L1 and L2 again; L3 stays personal.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_household uuid;
begin
  v_household := public.redeem_invite('TESTA1');
  if v_household is distinct from '90000000-0000-4000-8000-000000009001'::uuid then
    raise exception 'FAIL: redeem_invite returned % instead of H1', v_household;
  end if;
  if (select count(*) from public.lists where id in (
        '92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009002')) <> 2 then
    raise exception 'FAIL: A cannot see L1 and L2 after rejoining';
  end if;
  if not exists (select 1 from public.lists
                 where id = '92000000-0000-4000-8000-000000009003' and household_id is null) then
    raise exception 'FAIL: personal list L3 is not still personal after rejoining';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 7 - A leaves with copy_lists = true: two copies (L4 is soft-deleted and
-- excluded), each personal, same name and store, live items only with quantity and
-- position, unticked and unrecorded, last_activity_at equal to the source's.
-- A owns no shared list now, so nothing moves.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_outcome text;
  v_copied integer;
begin
  select r.outcome, r.copied_lists into v_outcome, v_copied
  from public.leave_household(true, false) r;

  if v_outcome is distinct from 'left' or v_copied is distinct from 2 then
    raise exception 'FAIL: A leaving with copy returned (%, %), expected (left, 2)', v_outcome, v_copied;
  end if;
end $$;

reset role;

do $$
declare
  v_src record;
  v_copy uuid;
begin
  if exists (select 1 from public.household_members
             where user_id = '00000000-0000-4000-8000-000000009001') then
    raise exception 'FAIL: A is still a member after leaving with copy';
  end if;

  -- A owns exactly: Mine, plus the two copies.
  if (select count(*) from public.lists
      where owner_id = '00000000-0000-4000-8000-000000009001' and deleted_at is null) <> 3 then
    raise exception 'FAIL: A does not own exactly 3 live lists (Mine and two copies)';
  end if;
  if exists (select 1 from public.lists
             where owner_id = '00000000-0000-4000-8000-000000009001' and name = 'Old list') then
    raise exception 'FAIL: the soft-deleted list L4 was copied';
  end if;

  for v_src in
    select l.id, l.name, l.location_id, l.last_activity_at
    from public.lists l
    where l.id in ('92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009002')
  loop
    select c.id into v_copy
    from public.lists c
    where c.owner_id = '00000000-0000-4000-8000-000000009001'
      and c.household_id is null
      and c.deleted_at is null
      and c.name = v_src.name
      and c.id <> v_src.id
      and c.location_id is not distinct from v_src.location_id;

    if v_copy is null then
      raise exception 'FAIL: no personal copy of "%" with the same name and store', v_src.name;
    end if;

    if (select c.last_activity_at from public.lists c where c.id = v_copy)
       is distinct from v_src.last_activity_at then
      raise exception 'FAIL: copy of "%" does not keep the source last_activity_at', v_src.name;
    end if;

    if exists (
      (select li.name, li.position, li.quantity from public.list_items li
        where li.list_id = v_src.id and li.deleted_at is null
       except
       select li.name, li.position, li.quantity from public.list_items li
        where li.list_id = v_copy and li.deleted_at is null)
      union all
      (select li.name, li.position, li.quantity from public.list_items li
        where li.list_id = v_copy and li.deleted_at is null
       except
       select li.name, li.position, li.quantity from public.list_items li
        where li.list_id = v_src.id and li.deleted_at is null)
    ) then
      raise exception 'FAIL: items of the copy of "%" differ from the source live items', v_src.name;
    end if;

    if exists (select 1 from public.list_items li
               where li.list_id = v_copy
                 and (li.checked_at is not null or li.recorded_at is not null or li.deleted_at is not null)) then
      raise exception 'FAIL: copy of "%" has a ticked, recorded or deleted item', v_src.name;
    end if;
  end loop;

  -- The copy of L1 has exactly Milk (x3) and Eggs; the soft-deleted Bread is not copied.
  if (select count(*) from public.list_items li
      join public.lists c on c.id = li.list_id
      where c.owner_id = '00000000-0000-4000-8000-000000009001' and c.name = 'Weekly shop') <> 2 then
    raise exception 'FAIL: the copy of Weekly shop does not have exactly 2 items';
  end if;
  if not exists (select 1 from public.list_items li
      join public.lists c on c.id = li.list_id
      where c.owner_id = '00000000-0000-4000-8000-000000009001' and c.name = 'Weekly shop'
        and li.name = 'Milk' and li.quantity = 3) then
    raise exception 'FAIL: the copied Milk lost its quantity';
  end if;

  -- Sources are only unchanged apart from the ownership move done earlier.
  if (select count(*) from public.lists
      where id in ('92000000-0000-4000-8000-000000009001', '92000000-0000-4000-8000-000000009002')
        and owner_id = '00000000-0000-4000-8000-000000009003'
        and household_id = '90000000-0000-4000-8000-000000009001') <> 2 then
    raise exception 'FAIL: source lists L1/L2 changed owner or household when A copied them';
  end if;
  if (select count(*) from public.list_items
      where list_id = '92000000-0000-4000-8000-000000009001') <> 3 then
    raise exception 'FAIL: source L1 items changed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 8 - F, sole member, leaving without consent to delete: refused. (This
-- checks the refusal and that H2 is unchanged afterwards; that the refusal comes
-- before any write is verified by code review, since the raise would roll back an
-- earlier copy anyway.)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009005","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_msg text;
begin
  begin
    perform 1 from public.leave_household(false, false);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'household_would_be_deleted' then
    raise exception 'FAIL: last member without consent raised % instead of household_would_be_deleted', v_msg;
  end if;

  v_msg := null;
  begin
    perform 1 from public.leave_household(true, false);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'household_would_be_deleted' then
    raise exception 'FAIL: last member with copy but no consent raised % instead of household_would_be_deleted', v_msg;
  end if;
end $$;

reset role;

do $$
begin
  if not exists (select 1 from public.households where id = '90000000-0000-4000-8000-000000009002')
     or not exists (select 1 from public.household_members
                    where user_id = '00000000-0000-4000-8000-000000009005')
     or not exists (select 1 from public.lists where id = '92000000-0000-4000-8000-000000009005')
     or not exists (select 1 from public.shop_sessions where id = '94000000-0000-4000-8000-000000009005') then
    raise exception 'FAIL: a refused last-member leave still changed H2';
  end if;
  if exists (select 1 from public.lists
             where owner_id = '00000000-0000-4000-8000-000000009005' and name = 'Pantry'
               and household_id is null) then
    raise exception 'FAIL: a refused last-member leave still made a copy (a refused leave must leave no copy behind)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 9 - F leaves with copy and consent: household deleted with its
-- cascade; F keeps a personal copy of Pantry; F's personal list and personal shop
-- row survive (the shop row's list_id becomes null).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009005","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_outcome text;
  v_copied integer;
begin
  select r.outcome, r.copied_lists into v_outcome, v_copied
  from public.leave_household(true, true) r;

  if v_outcome is distinct from 'deleted' or v_copied is distinct from 1 then
    raise exception 'FAIL: last member leaving returned (%, %), expected (deleted, 1)', v_outcome, v_copied;
  end if;
end $$;

reset role;

do $$
begin
  if exists (select 1 from public.households where id = '90000000-0000-4000-8000-000000009002') then
    raise exception 'FAIL: H2 still exists';
  end if;
  if exists (select 1 from public.household_members where household_id = '90000000-0000-4000-8000-000000009002')
     or exists (select 1 from public.household_members where user_id = '00000000-0000-4000-8000-000000009005') then
    raise exception 'FAIL: H2 membership rows survived';
  end if;
  if exists (select 1 from public.household_invites where household_id = '90000000-0000-4000-8000-000000009002') then
    raise exception 'FAIL: H2 invites survived';
  end if;
  if exists (select 1 from public.lists where id = '92000000-0000-4000-8000-000000009005')
     or exists (select 1 from public.list_items where list_id = '92000000-0000-4000-8000-000000009005') then
    raise exception 'FAIL: the shared list L5 or its items survived';
  end if;
  if exists (select 1 from public.shop_sessions where id = '94000000-0000-4000-8000-000000009005') then
    raise exception 'FAIL: the household shop session S5 survived';
  end if;

  if (select count(*) from public.list_items li join public.lists c on c.id = li.list_id
      where c.owner_id = '00000000-0000-4000-8000-000000009005' and c.name = 'Pantry'
        and c.household_id is null and c.deleted_at is null) <> 2 then
    raise exception 'FAIL: F does not own a personal copy of Pantry with its 2 items';
  end if;
  if not exists (select 1 from public.list_items
                 where list_id = '92000000-0000-4000-8000-000000009006'
                   and id = '93000000-0000-4000-8000-000000009009') then
    raise exception 'FAIL: F''s personal list L6 was touched';
  end if;
  if not exists (select 1 from public.shop_sessions
                 where id = '94000000-0000-4000-8000-000000009006'
                   and list_id is null and household_id is null
                   and owner_id = '00000000-0000-4000-8000-000000009005') then
    raise exception 'FAIL: F''s personal shop session S6 did not survive with a null list_id';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 10 - the deleted household's invite code can no longer be redeemed.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009006","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_msg text;
begin
  begin
    perform public.redeem_invite('TESTD4');
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'invalid_or_expired_code' then
    raise exception 'FAIL: redeeming a deleted household''s code raised % instead of invalid_or_expired_code', v_msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 11 - null arguments are invalid.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_msg text;
begin
  begin
    perform 1 from public.leave_household(null, false);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'invalid_leave_request' then
    raise exception 'FAIL: (null, false) raised % instead of invalid_leave_request', v_msg;
  end if;

  v_msg := null;
  begin
    perform 1 from public.leave_household(false, null);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'invalid_leave_request' then
    raise exception 'FAIL: (false, null) raised % instead of invalid_leave_request', v_msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 12 - a stranger leaving is not_in_household and changes nothing.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009004","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_msg text;
begin
  begin
    perform 1 from public.leave_household(true, true);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'not_in_household' then
    raise exception 'FAIL: a stranger leaving raised % instead of not_in_household', v_msg;
  end if;
end $$;

reset role;

do $$
begin
  if not exists (select 1 from public.households where id = '90000000-0000-4000-8000-000000009001')
     or (select count(*) from public.household_members
         where household_id = '90000000-0000-4000-8000-000000009001') <> 2 then
    raise exception 'FAIL: a stranger''s leave changed H1';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 13 - leaving never touched the Item location tables (check-offs gain
-- the single row written by finish_shopping in assertion 4).
-- ---------------------------------------------------------------------------

do $$
begin
  if (select count(*) from public.location_items)
     <> current_setting('cartel.t_loc_items')::bigint then
    raise exception 'FAIL: location_items row count changed';
  end if;
  if (select count(*) from public.location_item_votes)
     <> current_setting('cartel.t_loc_votes')::bigint then
    raise exception 'FAIL: location_item_votes row count changed';
  end if;
  if (select count(*) from public.location_checkoffs)
     <> current_setting('cartel.t_loc_checkoffs')::bigint + 1 then
    raise exception 'FAIL: location_checkoffs changed by something other than the one finish_shopping';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 14 - redeem_invite regression: a valid code joins; a second redeem is
-- already_in_household; a used code and an expired code are invalid_or_expired_code;
-- a lowercase, padded code still works.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009006","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_msg text;
begin
  if public.redeem_invite('TESTB2') is distinct from '90000000-0000-4000-8000-000000009001'::uuid then
    raise exception 'FAIL: G could not join H1 with a valid code';
  end if;

  begin
    perform public.redeem_invite('TESTE5');
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'already_in_household' then
    raise exception 'FAIL: redeeming while in a household raised % instead of already_in_household', v_msg;
  end if;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000009004","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_msg text;
begin
  begin
    perform public.redeem_invite('TESTB2');  -- already used by G
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'invalid_or_expired_code' then
    raise exception 'FAIL: a used code raised % instead of invalid_or_expired_code', v_msg;
  end if;

  v_msg := null;
  begin
    perform public.redeem_invite('TESTC3');  -- expired
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'invalid_or_expired_code' then
    raise exception 'FAIL: an expired code raised % instead of invalid_or_expired_code', v_msg;
  end if;

  v_msg := null;
  begin
    perform public.redeem_invite('NOSUCH');
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is distinct from 'invalid_or_expired_code' then
    raise exception 'FAIL: an unknown code raised % instead of invalid_or_expired_code', v_msg;
  end if;

  if public.redeem_invite('  teste5 ') is distinct from '90000000-0000-4000-8000-000000009001'::uuid then
    raise exception 'FAIL: a lowercase, padded code did not join H1';
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.household_members
      where household_id = '90000000-0000-4000-8000-000000009001') <> 4 then
    raise exception 'FAIL: H1 should have 4 members (D, E, G, B) at the end';
  end if;
end $$;

rollback;
