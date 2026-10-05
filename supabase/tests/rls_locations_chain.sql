-- RLS/constraint tests for public.locations.chain (#51, #54; reversed by #107 S4).
--
-- #107 S4 (Migration B, 20261005000001) removed the #54 UPDATE path on `chain`,
-- retired the 'other' chain value, made `chain` NOT NULL and made `name` unique.
-- The assertions below prove that end state; the old "any user may update chain"
-- and "name/lat/lng are unwritable" assertions are gone because nothing is
-- writable by a client any more.
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- Follows rls_locations.sql's idiom: fixtures and constraint checks run as the
-- owning role (bypasses RLS), client assertions run as `authenticated` with
-- request.jwt.claims set before the role switch.
--
-- WHAT IT IS REALLY GUARDING. (1) The column-level SELECT grant still includes
-- `chain` (forgetting it would make every `chain` read fail, not read null).
-- (2) The table constraints: chain is required, one of the five brands (not
-- 'other', not a pre-rebrand string like 'countdown'), and names are unique.
-- (3) A client cannot change chain or name, even the user who "owns" the row's
-- provenance: denied updates leave the row unchanged (verified as the owning role).

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. Two anonymous users, D and E, and one catalog row.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000d1', true),  -- D
  ('00000000-0000-4000-8000-0000000000e1', true);  -- E

insert into public.locations (name, lat, lng, chain, created_by)
values ('D''s New World', -36.85, 174.76, 'new_world',
        '00000000-0000-4000-8000-0000000000d1');

-- ---------------------------------------------------------------------------
-- Assertion 0 -- D reads the chain back as 'new_world'. Proves the SELECT grant
-- includes `chain`.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  got_chain text;
begin
  select chain into got_chain from public.locations where name = 'D''s New World';

  if got_chain is distinct from 'new_world' then
    raise exception 'FAIL: chain did not read back as new_world, got %', got_chain;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertions 1-4 -- table constraints, as the owning role (so a failure can only
-- come from the constraint, not from privileges).
-- ---------------------------------------------------------------------------

-- 1. NULL chain is rejected.
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.locations (name, lat, lng, chain)
    values ('Null Chain Store', -36.85, 174.76, null);
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: an insert with a NULL chain succeeded -- chain is not NOT NULL';
  end if;
end $$;

-- 2. 'other' is rejected (retired).
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.locations (name, lat, lng, chain)
    values ('Other Chain Store', -36.85, 174.76, 'other');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: an insert with chain = ''other'' succeeded -- the value should be retired';
  end if;
end $$;

-- 3. 'countdown' (Woolworths NZ's pre-rebrand name) is rejected.
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.locations (name, lat, lng, chain)
    values ('Countdown Store', -36.85, 174.76, 'countdown');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: an insert with chain = ''countdown'' succeeded -- the check constraint is not rejecting unlisted values';
  end if;
end $$;

-- 4. A second row with the same name and a valid chain is rejected (unique name).
do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.locations (name, lat, lng, chain)
    values ('D''s New World', -36.90, 174.80, 'woolworths');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: a duplicate store name was accepted -- the unique (name) constraint is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertions 5-7 -- clients cannot update. Each attempt runs as `authenticated`
-- in an exception block; ground truth is read back as the owning role.
-- ---------------------------------------------------------------------------

-- 5. D (the provenance creator) updates chain to 'woolworths': denied, unchanged.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    update public.locations set chain = 'woolworths' where name = 'D''s New World';
  exception when others then
    null;  -- denied is the expected outcome; ground truth is checked below
  end;
end $$;

reset role;

do $$
begin
  if (select chain from public.locations where name = 'D''s New World') is distinct from 'new_world' then
    raise exception 'FAIL: D changed the chain -- clients must not be able to update chain';
  end if;
end $$;

-- 6. E (not the creator) does the same: denied, unchanged.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    update public.locations set chain = 'woolworths' where name = 'D''s New World';
  exception when others then
    null;
  end;
end $$;

reset role;

do $$
begin
  if (select chain from public.locations where name = 'D''s New World') is distinct from 'new_world' then
    raise exception 'FAIL: E changed the chain -- clients must not be able to update chain';
  end if;
end $$;

-- 7. D updates name: denied, unchanged.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    update public.locations set name = 'Renamed' where name = 'D''s New World';
  exception when others then
    null;
  end;
end $$;

reset role;

do $$
begin
  if not exists (select 1 from public.locations where name = 'D''s New World') then
    raise exception 'FAIL: D renamed the location -- clients must not be able to update name';
  end if;
  if exists (select 1 from public.locations where name = 'Renamed') then
    raise exception 'FAIL: a location named Renamed exists -- the rename was not denied';
  end if;
end $$;

rollback;
