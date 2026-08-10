-- RLS policy tests for public.lists and public.list_items (Slice 2).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- There is no local Supabase CLI, no config.toml and no Docker in this project —
-- Slice 0 deferred test infrastructure and no later slice picks it up. This file is
-- the deliberately narrow substitute: SQL-level assertions about RLS only, run
-- against the hosted project inside a transaction that is thrown away.
--
-- WHAT IT IS REALLY GUARDING. The policies compare household membership with `=`,
-- never `is not distinct from`. For a user with no household `current_household_id()`
-- returns null, so `household_id = null` is null → false and a personal list matches
-- on ownership alone. Written with `is not distinct from`, `null = null` is *true*
-- and every householdless user sees every other householdless user's lists — a
-- household-privacy break of the class 03-SPEC.md § 0 calls a hard invariant
-- violation. Assertion 1 is the one that catches it: B and C both have no household,
-- so it exercises exactly the null-vs-null comparison.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as the
-- owning role, which bypasses RLS. Only the assertions run as `authenticated`.
-- `request.jwt.claims` must be set *before* the role switch: after it, the session
-- no longer has the privilege to set the GUC on some configurations, and auth.uid()
-- reads that GUC.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. A and D share a household. B and C have none — that is the point of
-- them, not an oversight.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', true),  -- A: household, 1 personal + 1 household list
  ('00000000-0000-4000-8000-00000000000b', true),  -- B: no household
  ('00000000-0000-4000-8000-00000000000c', true),  -- C: no household
  ('00000000-0000-4000-8000-00000000000d', true);  -- D: same household as A

insert into public.households (id, name) values
  ('10000000-0000-4000-8000-000000000001', 'Test Household');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000001');

insert into public.lists (id, owner_id, household_id, name) values
  ('20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-00000000000a', null,
   'A personal'),
  ('20000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001',
   'A household'),
  ('20000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-00000000000b', null,
   'B personal'),
  ('20000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-00000000000c', null,
   'C personal');

insert into public.list_items (id, list_id, name, position) values
  ('30000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', 'A personal item', 'a0'),
  ('30000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002', 'A household item', 'a0'),
  ('30000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000003', 'B personal item', 'a0'),
  ('30000000-0000-4000-8000-000000000004',
   '20000000-0000-4000-8000-000000000004', 'C personal item', 'a0');

-- ---------------------------------------------------------------------------
-- Assertion 0 — positive control, as B.
-- Without this, every "must be 0" assertion below would also pass if the policies
-- hid absolutely everything, including from the owner.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.lists
      where id = '20000000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'FAIL: B cannot see B''s own personal list (policies hide everything; the zero-row assertions below prove nothing)';
  end if;

  if (select count(*) from public.list_items
      where id = '30000000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'FAIL: B cannot see the item on B''s own personal list';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — two householdless users cannot see each other. THE null = null case.
-- Assertion 2 — a non-member cannot see a household list.
-- Assertion 4 (lists half) — same two questions asked of list_items.
-- All as B.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.lists
      where id = '20000000-0000-4000-8000-000000000004') <> 0 then
    raise exception 'FAIL: B (no household) can see C''s (no household) personal list — membership is being compared with IS NOT DISTINCT FROM, so null = null matched';
  end if;

  if (select count(*) from public.list_items
      where id = '30000000-0000-4000-8000-000000000004') <> 0 then
    raise exception 'FAIL: B (no household) can see the item on C''s (no household) personal list';
  end if;

  if (select count(*) from public.lists
      where id = '20000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FAIL: B (not a member) can see A''s household list';
  end if;

  if (select count(*) from public.list_items
      where id = '30000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FAIL: B (not a member) can see the item on A''s household list';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1, symmetric half — as C, looking for B's list. Asked in both
-- directions because a policy can be asymmetric in ways one direction hides.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.lists
      where id = '20000000-0000-4000-8000-000000000003') <> 0 then
    raise exception 'FAIL: C (no household) can see B''s (no household) personal list';
  end if;

  if (select count(*) from public.list_items
      where id = '30000000-0000-4000-8000-000000000003') <> 0 then
    raise exception 'FAIL: C (no household) can see the item on B''s (no household) personal list';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 — as D, A's household-mate: A's personal list stays private, A's
-- household list is visible. Assertion 4's other half asks the same of the items,
-- because item visibility delegates through a nested EXISTS onto public.lists and
-- that delegation is an assumption worth testing rather than reasoning about.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.lists
      where id = '20000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FAIL: D can see A''s personal list — personal is not staying private inside a household';
  end if;

  if (select count(*) from public.list_items
      where id = '30000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FAIL: D can see the item on A''s personal list';
  end if;

  if (select count(*) from public.lists
      where id = '20000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'FAIL: D cannot see A''s household list — household lists are not reaching members';
  end if;

  if (select count(*) from public.list_items
      where id = '30000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'FAIL: D cannot see the item on A''s household list — item visibility is not delegating through the parent list';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 — no demotion. `with check` cannot see OLD, so it cannot express
-- "household_id may not change"; the withheld column-level UPDATE grant does. The
-- failure being caught here is the update SILENTLY SUCCEEDING, not it erroring.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    update public.lists
    set household_id = null
    where id = '20000000-0000-4000-8000-000000000002';
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: A demoted their own household list back to personal — the column-level UPDATE grant on public.lists is not withholding household_id';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 — as B (no household), creating a list scoped to someone else's
-- household must fail the INSERT `with check`.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.lists (owner_id, household_id, name)
    values ('00000000-0000-4000-8000-00000000000b',
            '10000000-0000-4000-8000-000000000001',
            'B smuggling a list into A''s household');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: B (no household) created a list inside A''s household — the INSERT with check is not scoping household_id to the caller''s own household';
  end if;
end $$;

reset role;

rollback;
