-- RLS policy tests for public.locations (Slice 4).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- Simpler fixtures than rls_lists.sql: no household needed, because the property
-- under test does not involve households at all — that is the point. Two anonymous
-- users, B and C, sharing nothing.
--
-- WHAT IT IS REALLY GUARDING. `public.locations` is deliberately global per
-- 03-SPEC.md § 0: unlike `lists`/`list_items`, there is no household/owner
-- predicate anywhere in its SELECT policy. Assertion 1 is the *inverse* of
-- rls_lists.sql's core assertion — where that file proves two householdless users
-- must NOT see each other's lists, this file proves two users sharing nothing
-- (not even a household) MUST still see each other's locations. That is the one
-- assertion that actually proves "global" rather than merely "not broken".
--
-- Fixtures are the premise, not the thing under test, so the two test users are
-- inserted as the owning role, which bypasses RLS. Only the assertions run as
-- `authenticated`. `request.jwt.claims` must be set *before* the role switch:
-- after it, the session no longer has the privilege to set the GUC on some
-- configurations, and auth.uid() reads that GUC.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. B and C share nothing — no household, no prior relationship.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000b1', true),  -- B
  ('00000000-0000-4000-8000-0000000000c1', true);  -- C

insert into public.locations (id, name, lat, lng, created_by) values
  ('40000000-0000-4000-8000-000000000001',
   'B''s Corner Store', -33.8688, 151.2093,
   '00000000-0000-4000-8000-0000000000b1');

-- ---------------------------------------------------------------------------
-- Assertion 0 — positive control, as B.
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
    raise exception 'FAIL: B cannot see the location B just created';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — THE core property. As C, who shares no household with B and did
-- not create the row: the location must still be visible. This is the inverse of
-- rls_lists.sql's null=null assertion — there, no shared context means invisible;
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
    raise exception 'FAIL: C cannot see B''s location — locations is not actually global (it is scoping visibility by creator or household when it must not)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 — withheld column. As B, even as the row's own creator,
-- `created_by` is not selectable. The column-level SELECT grant on
-- public.locations names id, name, lat, lng, created_at only.
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
    raise exception 'FAIL: B could select created_by off public.locations — the column-level SELECT grant is not withholding it';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 — insert spoofing. As C, attempting to insert a location with
-- created_by set to B's id must fail the INSERT `with check`.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.locations (name, lat, lng, created_by)
    values ('C spoofing as B', -33.87, 151.21,
            '00000000-0000-4000-8000-0000000000b1');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: C created a location with created_by set to B''s id — the INSERT with check is not pinning created_by to the caller';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — positive control for insert + symmetric visibility. As C, insert
-- a location omitting created_by (relying on the column default) must succeed,
-- and the new row must then be visible to B too.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  new_id uuid;
begin
  insert into public.locations (name, lat, lng)
  values ('C''s Market', -37.8136, 144.9631)
  returning id into new_id;

  if new_id is null then
    raise exception 'FAIL: C could not insert a location relying on the created_by default';
  end if;

  if (select count(*) from public.locations where id = new_id) <> 1 then
    raise exception 'FAIL: C cannot see the location C just created';
  end if;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.locations where name = 'C''s Market') <> 1 then
    raise exception 'FAIL: B cannot see the location C created — symmetric global visibility is broken';
  end if;
end $$;

reset role;

rollback;
