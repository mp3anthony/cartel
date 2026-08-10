-- RLS/grant tests for lists.location_id (Slice 5 — Shopping Mode attachment).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- WHAT IT IS REALLY GUARDING. Migration 20260810000006 adds `lists.location_id`
-- without touching `lists_update_visible` — the claim being tested is that the
-- existing owner-or-household-member predicate already covers the new column with
-- no policy change, and that the column-level UPDATE grant added alongside it is
-- what makes the column writable at all. Assertions 1-2 are the positive half (owner
-- can write it; a household member who is NOT the owner can too, because
-- 03-SPEC.md's "all members equal rank" applies here exactly as it does to
-- check-off); assertions 3-4 are the negative half (a household mate cannot reach a
-- list outside their household, a stranger cannot reach either list); assertion 5
-- checks the FK does real work, not just a UI-level convenience; assertion 6 checks
-- that `public.locations` — deliberately global per 03-SPEC.md § 0 — is untouched by
-- this migration and stays visible to someone with no relationship to the attaching
-- household. There is no assertion for "does `public.locations` leak which lists are
-- attached to it" because there is nothing to query: the FK is one-directional and
-- `locations` has no back-reference column, so that half of the boundary is enforced
-- by the schema's shape, not by a policy a test could defeat. Locations have no
-- soft-delete (`public.locations` has no `deleted_at` column at all, per migration
-- 20260810000005), so there is no soft-deleted-location edge case to test here.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as the
-- owning role, which bypasses RLS. Only the assertions run as `authenticated`.
-- `request.jwt.claims` must be set *before* the role switch: after it, the session
-- no longer has the privilege to set the GUC on some configurations, and auth.uid()
-- reads that GUC.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. A and D share household H. B shares nothing with either of them.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000005a', true),  -- A: household member, owns both lists below
  ('00000000-0000-4000-8000-00000000005d', true),  -- D: same household as A, owns neither list
  ('00000000-0000-4000-8000-00000000005b', true);  -- B: no household, no relation to A or D

insert into public.households (id, name) values
  ('50000000-0000-4000-8000-000000000001', 'Test Household');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-00000000005a', '50000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-00000000005d', '50000000-0000-4000-8000-000000000001');

insert into public.locations (id, name, lat, lng, created_by) values
  ('60000000-0000-4000-8000-000000000001',
   'Test Supermarket', -43.5321, 172.6362,
   '00000000-0000-4000-8000-00000000005a');

insert into public.lists (id, owner_id, household_id, name) values
  ('70000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-00000000005a', null,
   'A personal'),
  ('70000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-00000000005a', '50000000-0000-4000-8000-000000000001',
   'A household');

-- ---------------------------------------------------------------------------
-- Assertion 0 — positive control, as A.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000005a","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.lists
      where id in ('70000000-0000-4000-8000-000000000001',
                    '70000000-0000-4000-8000-000000000002')) <> 2 then
    raise exception 'FAIL: A cannot see A''s own two lists (policies hiding everything; the assertions below would prove nothing)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — owner writes their own personal list's location_id.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000005a","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.lists
  set location_id = '60000000-0000-4000-8000-000000000001'
  where id = '70000000-0000-4000-8000-000000000001';

  if (select location_id from public.lists
      where id = '70000000-0000-4000-8000-000000000001')
      <> '60000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL: A could not attach a location to A''s own personal list';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 — a household member who is NOT the owner attaches a location.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000005d","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.lists
  set location_id = '60000000-0000-4000-8000-000000000001'
  where id = '70000000-0000-4000-8000-000000000002';

  if (select location_id from public.lists
      where id = '70000000-0000-4000-8000-000000000002')
      <> '60000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL: D (household member, not owner) could not attach a location to A''s household list — equal-rank invariant broken';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 — D, a household mate of A, cannot reach A's PERSONAL list.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000005d","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.lists
  set location_id = null
  where id = '70000000-0000-4000-8000-000000000001';
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000005a","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select location_id from public.lists
      where id = '70000000-0000-4000-8000-000000000001')
      <> '60000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL: D changed A''s personal list''s location_id — D can reach a list outside their household';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — B, a stranger to both A and D, cannot reach either list.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000005b","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.lists set location_id = null
  where id = '70000000-0000-4000-8000-000000000001';

  update public.lists set location_id = null
  where id = '70000000-0000-4000-8000-000000000002';
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000005a","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select location_id from public.lists
      where id = '70000000-0000-4000-8000-000000000001')
      <> '60000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL: B changed A''s personal list''s location_id — a stranger reached a personal list';
  end if;

  if (select location_id from public.lists
      where id = '70000000-0000-4000-8000-000000000002')
      <> '60000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL: B changed A''s household list''s location_id — a stranger reached a household list';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 — the foreign key does real work.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000005a","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    update public.lists
    set location_id = '99999999-0000-4000-8000-000000000000'
    where id = '70000000-0000-4000-8000-000000000001';
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: attaching a nonexistent location_id succeeded — the foreign key constraint is not enforced';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 — the household-private/location-global boundary.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000005b","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.locations
      where id = '60000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FAIL: B (a stranger) cannot see the location A attached — public.locations is no longer global';
  end if;
end $$;

reset role;

rollback;
