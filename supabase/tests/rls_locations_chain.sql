-- RLS/constraint tests for public.locations.chain (#51).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- Follows rls_locations.sql's exact idiom: fixtures inserted as the owning role
-- (bypasses RLS), assertions run as `authenticated` with request.jwt.claims set
-- before the role switch.
--
-- WHAT IT IS REALLY GUARDING. Two things #51 depends on that a plain code read
-- can't confirm: (1) the column-level SELECT grant actually includes `chain` —
-- forgetting to extend it (the exact trap the migration's own comment calls out)
-- would silently make every `chain` read come back as if the column didn't
-- exist, not as an error; (2) the check constraint really does reject an
-- unlisted value, so a typo'd or pre-rebrand chain string (e.g. 'countdown')
-- can never reach a row. Assertion 4 is a negative control for #51's own scope
-- decision — chain is set at creation time only, no UPDATE path exists.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. One anonymous user, D — nothing here depends on households.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000d1', true);  -- D

-- ---------------------------------------------------------------------------
-- Assertion 0 — insert without chain, select it back as the same user, assert
-- null. Proves the SELECT grant actually includes `chain` (a column absent
-- from the grant would make this select fail outright, not just read null —
-- see assertion 1 for that failure mode isolated on its own).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  new_id uuid;
  got_chain text;
begin
  insert into public.locations (name, lat, lng)
  values ('D''s Corner Store', -36.8485, 174.7633)
  returning id into new_id;

  select chain into got_chain from public.locations where id = new_id;

  if got_chain is not null then
    raise exception 'FAIL: chain should be null for a location created without one, got %', got_chain;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — insert with chain = 'new_world', assert success and round-trip.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  new_id uuid;
  got_chain text;
begin
  insert into public.locations (name, lat, lng, chain)
  values ('D''s New World', -36.85, 174.76, 'new_world')
  returning id into new_id;

  select chain into got_chain from public.locations where id = new_id;

  if got_chain is distinct from 'new_world' then
    raise exception 'FAIL: chain did not round-trip as new_world, got %', got_chain;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 — insert with chain = 'countdown' (a realistic-looking bad
-- value — Countdown was Woolworths NZ's pre-rebrand name, not in the allowed
-- list) must be rejected by the check constraint.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.locations (name, lat, lng, chain)
    values ('Should Fail', -36.85, 174.76, 'countdown');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: an insert with chain = ''countdown'' succeeded — the check constraint is not rejecting unlisted values';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 — insert with chain = 'other' explicitly, assert success.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  new_id uuid;
  got_chain text;
begin
  insert into public.locations (name, lat, lng, chain)
  values ('D''s Dairy', -36.86, 174.77, 'other')
  returning id into new_id;

  select chain into got_chain from public.locations where id = new_id;

  if got_chain is distinct from 'other' then
    raise exception 'FAIL: chain did not round-trip as other, got %', got_chain;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — negative control for #51's scope decision. As the row's own
-- creator, attempting to UPDATE chain must fail — no UPDATE grant or policy
-- exists on public.locations at all, chain included.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  target_id uuid;
begin
  select id into target_id from public.locations where name = 'D''s New World';

  begin
    update public.locations set chain = 'woolworths' where id = target_id;
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: D updated chain on their own location — there should be no UPDATE grant/policy on public.locations at all';
  end if;
end $$;

reset role;

rollback;
