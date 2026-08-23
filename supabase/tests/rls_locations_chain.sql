-- RLS/constraint tests for public.locations.chain (#51, updated for #54).
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
-- WHAT IT IS REALLY GUARDING. Three things a plain code read can't confirm:
-- (1) the column-level SELECT grant actually includes `chain` — forgetting to
-- extend it (the exact trap the #51 migration's own comment calls out) would
-- silently make every `chain` read come back as if the column didn't exist, not
-- as an error; (2) the check constraint really does reject an unlisted value on
-- both INSERT and UPDATE, so a typo'd or pre-rebrand chain string (e.g.
-- 'countdown') can never reach a row; (3) as of #54, the new UPDATE path on
-- `chain` is genuinely open to any authenticated user — not owner-scoped — while
-- every other column on this table stays completely unwritable, including in a
-- single UPDATE statement that also names `chain`.
--
-- Assertion 4 used to be a negative control proving no UPDATE path existed at
-- all (#51's own scope decision). #54 makes that assertion false on purpose —
-- it has been rewritten below into assertion 4 (positive: owner may update
-- their own location's chain) and assertion 5 (positive: a DIFFERENT
-- authenticated user may also update it, proving the policy is open, not
-- owner-scoped — the actual thing #54 changes about this table's design).

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. Two anonymous users, D and E — nothing here depends on households.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000d1', true),  -- D
  ('00000000-0000-4000-8000-0000000000e1', true);  -- E

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
-- Assertion 4 — positive control (#54): D updates the chain on D's own
-- location. Must succeed and round-trip.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  target_id uuid;
  got_chain text;
begin
  select id into target_id from public.locations where name = 'D''s New World';

  update public.locations set chain = 'woolworths' where id = target_id;

  select chain into got_chain from public.locations where id = target_id;

  if got_chain is distinct from 'woolworths' then
    raise exception 'FAIL: D''s own chain update did not round-trip as woolworths, got %', got_chain;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 — the actual thing #54 changes about this table's design: a
-- DIFFERENT authenticated user (E, not the location's creator) may also
-- update the same location's chain. Must succeed and round-trip. This is
-- the open-policy, not-owner-scoped behaviour — not just assumed.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  target_id uuid;
  got_chain text;
begin
  select id into target_id from public.locations where name = 'D''s New World';

  update public.locations set chain = 'paknsave' where id = target_id;

  select chain into got_chain from public.locations where id = target_id;

  if got_chain is distinct from 'paknsave' then
    raise exception 'FAIL: E''s update of D''s location did not round-trip as paknsave, got %', got_chain;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 — `name` remains unwritable by anyone, chain-only grant or not.
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
    update public.locations set name = 'Renamed' where id = target_id;
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: D updated name — there should be no UPDATE grant on public.locations.name';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 7 — `lat` remains unwritable.
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
    update public.locations set lat = -37.0 where id = target_id;
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: D updated lat — there should be no UPDATE grant on public.locations.lat';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 8 — `lng` remains unwritable.
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
    update public.locations set lng = 175.0 where id = target_id;
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: D updated lng — there should be no UPDATE grant on public.locations.lng';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 9 — a single UPDATE statement naming `chain` together with `name`
-- must fail as a whole. Column-level grants are checked per-statement, so
-- the presence of a legitimately-grantable column (`chain`) in the same
-- statement does not let an ungranted column (`name`) slip through.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  target_id uuid;
  got_chain text;
begin
  select id into target_id from public.locations where name = 'D''s New World';

  begin
    update public.locations
    set chain = 'four_square', name = 'Renamed Again'
    where id = target_id;
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: a combined chain+name UPDATE succeeded — column-level grants should reject the whole statement';
  end if;

  -- Belt and braces: confirm the statement's failure really left chain
  -- untouched too, not just that an exception fired.
  select chain into got_chain from public.locations where id = target_id;

  if got_chain is distinct from 'paknsave' then
    raise exception 'FAIL: chain changed to % despite the combined UPDATE statement failing', got_chain;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 10 — the check constraint still applies to UPDATE, not just
-- INSERT: attempting chain = 'countdown' via UPDATE must be rejected.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  target_id uuid;
  got_chain text;
begin
  select id into target_id from public.locations where name = 'D''s New World';

  begin
    update public.locations set chain = 'countdown' where id = target_id;
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: an UPDATE with chain = ''countdown'' succeeded — the check constraint is not rejecting unlisted values on UPDATE';
  end if;

  select chain into got_chain from public.locations where id = target_id;

  if got_chain is distinct from 'paknsave' then
    raise exception 'FAIL: chain changed to % despite the rejected UPDATE', got_chain;
  end if;
end $$;

reset role;

rollback;
