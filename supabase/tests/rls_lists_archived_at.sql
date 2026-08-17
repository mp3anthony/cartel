-- RLS/grant tests for lists.archived_at (Batch C — "Finish shopping lifecycle", #33 + #35).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- WHAT IT IS REALLY GUARDING. Migration 20260817000000 adds `lists.archived_at`
-- without touching `lists_update_visible` — same claim as `location_id`
-- (rls_lists_locations.sql) before it: the existing owner-or-household-member
-- predicate already covers the new column with no policy change, and the
-- column-level UPDATE grant added alongside it is what makes the column writable
-- at all. Assertions 1-2 are the positive half (owner can archive; a household
-- member who is NOT the owner can too, because 03-SPEC.md's "all members equal
-- rank" applies here exactly as it does to check-off and to `location_id`);
-- assertions 3-4 are the negative half (a household mate cannot reach a list
-- outside their household, a stranger cannot reach either list). Assertion 5 is
-- the one this file adds that `rls_lists_locations.sql` has no equivalent of: it
-- proves the conditional-update guard `archiveList()` (`mobile/src/lib/lists.ts`)
-- relies on for #35's duplicate-recording protection is atomic at the SQL level,
-- independent of anything the application code does — a second `... where
-- archived_at is null` UPDATE against an already-archived row affects zero rows,
-- full stop, not because the client happened to check first.
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
  ('00000000-0000-4000-8000-00000000006a', true),  -- A: household member, owns both lists below
  ('00000000-0000-4000-8000-00000000006d', true),  -- D: same household as A, owns neither list
  ('00000000-0000-4000-8000-00000000006b', true);  -- B: no household, no relation to A or D

insert into public.households (id, name) values
  ('50000000-0000-4000-8000-000000000002', 'Test Household (archived_at)');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-00000000006a', '50000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-00000000006d', '50000000-0000-4000-8000-000000000002');

insert into public.lists (id, owner_id, household_id, name) values
  ('70000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-00000000006a', null,
   'A personal (archived_at test)'),
  ('70000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-00000000006a', '50000000-0000-4000-8000-000000000002',
   'A household (archived_at test)');

-- ---------------------------------------------------------------------------
-- Assertion 0 — positive control, as A.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.lists
      where id in ('70000000-0000-4000-8000-000000000003',
                    '70000000-0000-4000-8000-000000000004')) <> 2 then
    raise exception 'FAIL: A cannot see A''s own two lists (policies hiding everything; the assertions below would prove nothing)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — owner A archives A's own personal list.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.lists
  set archived_at = now()
  where id = '70000000-0000-4000-8000-000000000003'
    and archived_at is null;

  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000003') is null then
    raise exception 'FAIL: A could not archive A''s own personal list';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 — a household member who is NOT the owner (D) archives A's
-- household-shared list too (equal-rank invariant).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000006d","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.lists
  set archived_at = now()
  where id = '70000000-0000-4000-8000-000000000004'
    and archived_at is null;

  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000004') is null then
    raise exception 'FAIL: D (household member, not owner) could not archive A''s household list — equal-rank invariant broken';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 — D, a household mate of A on the SHARED list, is not a member
-- of A's PERSONAL list and cannot reach/archive it (already archived by
-- assertion 1; D's attempt to null it back out must have zero effect).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000006d","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.lists
  set archived_at = null
  where id = '70000000-0000-4000-8000-000000000003';
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000003') is null then
    raise exception 'FAIL: D un-archived A''s personal list''s archived_at — D can reach a list outside their household';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — B, a stranger to both A and D, cannot reach or archive either
-- list (attempts to null both back out; neither must move).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000006b","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  update public.lists set archived_at = null
  where id = '70000000-0000-4000-8000-000000000003';

  update public.lists set archived_at = null
  where id = '70000000-0000-4000-8000-000000000004';
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000003') is null then
    raise exception 'FAIL: B un-archived A''s personal list''s archived_at — a stranger reached a personal list';
  end if;

  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000004') is null then
    raise exception 'FAIL: B un-archived A''s household list''s archived_at — a stranger reached a household list';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 — the conditional-update guard is atomic at the SQL level.
-- A's personal list is already archived (assertion 1); the exact same
-- `... where archived_at is null` UPDATE `archiveList()` runs, run again by
-- its own owner, must affect zero rows — proving two concurrent
-- finishShopping() calls can never both see themselves as the one that
-- claimed the archive, independent of any application-level check.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000006a","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  affected int;
begin
  update public.lists
  set archived_at = now()
  where id = '70000000-0000-4000-8000-000000000003'
    and archived_at is null;

  get diagnostics affected = row_count;

  if affected <> 0 then
    raise exception 'FAIL: re-running the conditional archive UPDATE against an already-archived list affected % row(s), expected 0 — the atomic claim guard is broken', affected;
  end if;
end $$;

reset role;

rollback;
