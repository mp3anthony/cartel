-- RLS/grant tests for the DELETE policy added to public.shop_sessions by
-- issue #57 (migration 20260823000002_shop_sessions_delete.sql).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- WHAT IT IS REALLY GUARDING. `shop_sessions_delete_visible` reuses this table's
-- own SELECT predicate verbatim — `owner_id = (select auth.uid()) or household_id
-- = current_household_id()` — as its DELETE predicate too, the same equal-rank
-- shape every other household-shared table in this app already gives its members.
-- Assertion 0 is the positive control (A deletes A's own personal row). Assertion 1
-- is the equal-rank case the issue itself called out: D, a household member who is
-- NOT the row's owner, can delete a household-scoped row A created. Assertion 2 is
-- the negative mirror of that: a stranger (B) cannot delete a row belonging to A's
-- household. Assertion 3 confirms a personal row (household_id is null) stays
-- owner-only even to a household mate — the same "null = null is not true" property
-- `rls_shop_sessions.sql` assertion 4 already proved for SELECT/INSERT, now checked
-- for DELETE. Assertions 4-5 are the "clear all" scope: deleting every row visible
-- under RLS (no id filter at all) removes exactly the caller's own visible set —
-- both A's personal and household rows — and leaves a completely unrelated
-- household's rows (owned by a stranger) untouched, proving RLS is what bounds an
-- unfiltered/broadly-filtered delete, not just each single-row call.
--
-- A DENIED delete is silent, not an error — RLS just makes the row match zero
-- rows, so `DELETE ... WHERE id = x` from an unauthorized role succeeds with
-- "0 rows affected" and no exception. That means a negative assertion can only
-- be proven by checking the row's *actual* survival through a role that has
-- real visibility into it independent of the delete attempt itself — the
-- denying actor's own SELECT visibility is exactly what was just denied, so
-- checking existence through that same actor's eyes is always going to read
-- "gone" whether the delete worked or was blocked, and would silently pass a
-- broken policy. Assertions 2 and 3 both check ground truth via the bypass
-- role (`reset role`) for this reason, not via the denied actor's own query —
-- confirmed live against this project before writing these assertions (a
-- direct repro of each negative case, checked both ways, is what caught this).
--
-- Fixtures are inserted as the owning role, which bypasses RLS. Only the assertions
-- run as `authenticated`. `request.jwt.claims` must be set *before* the role
-- switch: after it, the session no longer has the privilege to set the GUC on some
-- configurations, and auth.uid() reads that GUC.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. A and D share household H. B is a stranger to A/D and owns an
-- entirely separate household's worth of shop_sessions rows, used to prove
-- "clear all" never reaches outside the caller's own visible set.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-000000000911', true),  -- A: household member
  ('00000000-0000-4000-8000-000000000912', true),  -- D: same household as A
  ('00000000-0000-4000-8000-000000000913', true);  -- B: stranger, owns unrelated rows

insert into public.households (id, name) values
  ('90000000-0000-4000-8000-000000000011', 'Test Household H'),
  ('90000000-0000-4000-8000-000000000012', 'Test Household B-only');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-000000000911', '90000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000912', '90000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000913', '90000000-0000-4000-8000-000000000012');

insert into public.locations (id, name, lat, lng, created_by) values
  ('91000000-0000-4000-8000-000000000011',
   'Test Supermarket 2', -43.5321, 172.6362,
   '00000000-0000-4000-8000-000000000911');

-- ---------------------------------------------------------------------------
-- Assertion 0 — positive control: A deletes A's own personal row.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000911","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('94000000-0000-4000-8000-000000000001',
     '91000000-0000-4000-8000-000000000011', null, null,
     array['Milk'], array['Milk']);

  delete from public.shop_sessions
  where id = '94000000-0000-4000-8000-000000000001';

  if exists (select 1 from public.shop_sessions
             where id = '94000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: A could not delete A''s own personal shop_sessions row (positive control)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — equal-rank: D (household member, not the row's owner) deletes
-- a household-scoped row A created.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000911","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('94000000-0000-4000-8000-000000000002',
     '91000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000011', null,
     array['Eggs'], array['Eggs']);
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000912","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  delete from public.shop_sessions
  where id = '94000000-0000-4000-8000-000000000002';

  if exists (select 1 from public.shop_sessions
             where id = '94000000-0000-4000-8000-000000000002') then
    raise exception 'FAIL: D (household member, not owner) could not delete A''s household-scoped shop_sessions row — equal-rank invariant broken for DELETE';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 — stranger denial: B cannot delete a row belonging to A's
-- household.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000911","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('94000000-0000-4000-8000-000000000003',
     '91000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000011', null,
     array['Bread'], array['Bread']);
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000913","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  delete from public.shop_sessions
  where id = '94000000-0000-4000-8000-000000000003';
end $$;

-- Ground truth via the bypass role, not via B's own query — see header. B has
-- no SELECT visibility into this row either way, so checking through B's own
-- eyes would always read "gone" whether the delete worked or was blocked.
reset role;

do $$
begin
  if not exists (select 1 from public.shop_sessions
                 where id = '94000000-0000-4000-8000-000000000003') then
    raise exception 'FAIL: B (a stranger to A''s household) deleted A''s household-scoped shop_sessions row — DELETE policy leaked across households';
  end if;
end $$;

-- Clean up assertion 2's fixture so it doesn't interfere with the "clear all"
-- assertions below (already running as the bypass role).
delete from public.shop_sessions where id = '94000000-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- Assertion 3 — personal row stays owner-only even to a household mate: D
-- cannot delete A's personal row.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000911","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('94000000-0000-4000-8000-000000000004',
     '91000000-0000-4000-8000-000000000011', null, null,
     array['Cheese'], array['Cheese']);
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000912","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  delete from public.shop_sessions
  where id = '94000000-0000-4000-8000-000000000004';
end $$;

-- Ground truth via the bypass role, not via D's own query — see header. D is
-- a household mate but this row is personal (household_id null), so D has no
-- SELECT visibility into it either way.
reset role;

do $$
begin
  if not exists (select 1 from public.shop_sessions
                 where id = '94000000-0000-4000-8000-000000000004') then
    raise exception 'FAIL: D (household mate, not owner) deleted A''s personal shop_sessions row — personal rows must stay owner-only even inside a shared household';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertions 4-5 — "clear all" scope: an unfiltered-under-RLS delete (the
-- app's own `deleteAllShopSessions` issues `.delete().not('id','is',null)`,
-- a filter that matches every row) removes exactly the caller's own visible
-- set and nothing belonging to an entirely separate household.
-- ---------------------------------------------------------------------------

-- A's personal row from assertion 3's setup was deleted by D in assertion 3's
-- own attempt (rejected — still present). Give A one more personal row and
-- one more household row so "clear all" has more than one row to remove.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000911","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('94000000-0000-4000-8000-000000000005',
     '91000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000011', null,
     array['Rice'], array['Rice']);
end $$;

reset role;

-- B's own, entirely separate household's row — must survive A's clear-all.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000913","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('94000000-0000-4000-8000-000000000006',
     '91000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000012', null,
     array['Butter'], array['Butter']);
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000911","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  -- A's own currently-visible set at this point: assertion 3's personal row
  -- (94...004, still present — D's delete attempt was rejected) and the two
  -- household rows just inserted (94...002 was already deleted in assertion 1,
  -- so only 94...005 remains) plus 94...004. Delete every row RLS lets A see,
  -- with no id filter at all.
  delete from public.shop_sessions where id is not null;

  if exists (select 1 from public.shop_sessions
             where id in ('94000000-0000-4000-8000-000000000004',
                          '94000000-0000-4000-8000-000000000005')) then
    raise exception 'FAIL: "clear all" (unfiltered delete under RLS) left one of A''s own visible rows behind';
  end if;
end $$;

reset role;

do $$
begin
  if not exists (select 1 from public.shop_sessions
                 where id = '94000000-0000-4000-8000-000000000006') then
    raise exception 'FAIL: A''s "clear all" removed B''s row from a completely separate household — DELETE policy is not actually scoped by RLS, an unfiltered delete reached rows outside the caller''s visible set';
  end if;
end $$;

rollback;
