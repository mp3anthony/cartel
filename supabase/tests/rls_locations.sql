-- RLS policy tests for public.locations (Slice 4, rewritten for #107 S4).
--
-- #107 S4 (Migration B, 20261005000001) locked the Store catalog: clients can only
-- read it. The old assertions that a user may insert a location are reversed below
-- into negatives, plus a catalog check that no write privilege or policy remains.
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- Simpler fixtures than rls_lists.sql: no household needed, because the property
-- under test does not involve households at all -- that is the point. Two anonymous
-- users, B and C, sharing nothing.
--
-- WHAT IT IS REALLY GUARDING. `public.locations` is deliberately global per
-- 03-SPEC.md § 0: unlike `lists`/`list_items`, there is no household/owner
-- predicate anywhere in its SELECT policy. Assertion 1 is the *inverse* of
-- rls_lists.sql's core assertion -- where that file proves two householdless users
-- must NOT see each other's lists, this file proves two users sharing nothing
-- (not even a household) MUST still see each other's locations. That is the one
-- assertion that actually proves "global" rather than merely "not broken".
-- Assertions 3-6 prove the other half: the catalog is read-only to clients.
--
-- Fixtures are the premise, not the thing under test, so the fixture row and the
-- two test users are inserted as the owning role, which bypasses RLS. Only the
-- assertions run as `authenticated`. `request.jwt.claims` must be set *before* the
-- role switch: after it, the session no longer has the privilege to set the GUC on
-- some configurations, and auth.uid() reads that GUC.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. B and C share nothing -- no household, no prior relationship.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000b1', true),  -- B
  ('00000000-0000-4000-8000-0000000000c1', true);  -- C

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('40000000-0000-4000-8000-000000000001',
   'B''s Corner Store', -33.8688, 151.2093, 'new_world',
   '00000000-0000-4000-8000-0000000000b1');

-- ---------------------------------------------------------------------------
-- Assertion 0 -- positive control, as B.
-- Without this, the "must be visible" assertions below would prove nothing if the
-- policy hid everything, including from the creator.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.locations
      where id = '40000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FAIL: B cannot see the fixture location';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 -- THE core property. As C, who shares no household with B and did
-- not create the row: the location must still be visible. This is the inverse of
-- rls_lists.sql's null=null assertion -- there, no shared context means invisible;
-- here, no shared context is irrelevant, because locations have no access-control
-- path through households or ownership at all.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.locations
      where id = '40000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FAIL: C cannot see B''s location -- locations is not actually global (it is scoping visibility by creator or household when it must not)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 -- withheld column. As B, even as the row's own creator,
-- `created_by` is not selectable. The column-level SELECT grant on
-- public.locations names id, name, lat, lng, created_at, chain only.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    perform created_by from public.locations
    where id = '40000000-0000-4000-8000-000000000001';
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: B could select created_by off public.locations -- the column-level SELECT grant is not withholding it';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertions 3-5 -- clients cannot write. Each attempt runs as `authenticated`
-- in an exception block; ground truth is then read as the owning role.
-- ---------------------------------------------------------------------------

-- 3. C inserts with created_by = B and a valid chain: denied, row absent.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.locations (name, lat, lng, chain, created_by)
    values ('C spoofing as B', -33.87, 151.21, 'new_world',
            '00000000-0000-4000-8000-0000000000b1');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: C inserted a location with created_by set to B -- clients must not be able to insert';
  end if;
end $$;

reset role;

do $$
begin
  if exists (select 1 from public.locations where name = 'C spoofing as B') then
    raise exception 'FAIL: the spoofed insert left a row behind';
  end if;
end $$;

-- 4. C inserts without created_by and a valid chain: denied, row absent.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.locations (name, lat, lng, chain)
    values ('C''s Market', -37.8136, 144.9631, 'new_world');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: C inserted a location relying on the created_by default -- clients must not be able to insert';
  end if;
end $$;

reset role;

do $$
begin
  if exists (select 1 from public.locations where name = 'C''s Market') then
    raise exception 'FAIL: C''s insert left a row behind';
  end if;
end $$;

-- 5. B deletes the fixture: denied, row still exists.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    delete from public.locations where id = '40000000-0000-4000-8000-000000000001';
  exception when others then
    null;  -- permission denied is the expected outcome; ground truth is checked below
  end;
end $$;

reset role;

do $$
begin
  if not exists (select 1 from public.locations
                 where id = '40000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: B deleted the fixture location -- clients must not be able to delete';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 6 -- catalog check, as the owning role. No write privilege, no anon
-- access, and no policy other than SELECT remains on public.locations.
-- ---------------------------------------------------------------------------

do $$
begin
  if has_table_privilege('authenticated', 'public.locations', 'INSERT') then
    raise exception 'FAIL: authenticated still has INSERT on public.locations';
  end if;
  if has_column_privilege('authenticated', 'public.locations', 'chain', 'UPDATE') then
    raise exception 'FAIL: authenticated still has UPDATE on public.locations.chain';
  end if;
  if has_table_privilege('anon', 'public.locations', 'SELECT') then
    raise exception 'FAIL: anon has SELECT on public.locations';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'locations' and cmd <> 'SELECT') then
    raise exception 'FAIL: a non-SELECT policy remains on public.locations';
  end if;
end $$;

rollback;
