-- RLS/grant tests for public.finish_shopping (issue #58 — Partial finish
-- keeps list active; history marks items not bought).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- WHAT IT IS REALLY GUARDING. `public.finish_shopping()` (migration
-- 20260906000000) is this schema's second table-spanning `security definer`
-- function, following `vote_location_item_correction()`'s precedent
-- (20260811000002) rather than `rls_lists_archived_at.sql`'s now-retired
-- conditional-UPDATE claim (see that file's own deletion, noted in this
-- session's HANDOFF entry, since `revoke update (archived_at)` below makes its
-- assertions fail against the new grants). Assertion 1 is the core positive
-- case: a partial finish records both history rows, soft-deletes exactly the
-- checked items, and leaves the list active. Assertion 2 is this project's
-- established sequential-reinvocation idiom for proving atomicity from one SQL
-- script (real concurrent connections aren't practical here) — re-running the
-- call once nothing remains checked must raise `nothing_checked` and write
-- nothing new. Assertion 3 checks the equal-rank invariant (a household member
-- who is not the list's owner may still finish it) on a second, independent
-- list. Assertion 4 checks the full-finish path is unchanged: every item
-- checked still archives the list and leaves items untouched (no soft-delete).
-- Assertion 5 checks authorization: a stranger gets `list_not_found`, not a
-- silent success or a different error. Assertion 6 checks the grant
-- tightening actually landed: a direct client UPDATE of `archived_at` is
-- rejected now that `finish_shopping()` is the only writer.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as
-- the owning role, which bypasses RLS. Only the assertions run as
-- `authenticated`. `request.jwt.claims` must be set *before* the role switch:
-- after it, the session no longer has the privilege to set the GUC on some
-- configurations, and auth.uid() reads that GUC.
--
-- State carries forward between assertions in this file — they are not
-- independent and must not be reordered.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. Household H has members A (owner of both lists below) and D (same
-- household, owns neither list). Stranger B shares nothing with either. One
-- location L.
--
-- List 1 (partial-finish target): 3 items — item1/item2 checked, item3 not.
-- List 2 (equal-rank target, owned by A, tested by D): 2 items — one checked,
-- one not.
-- List 3 (full-finish target, owned by A): 2 items, both checked.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000f5a1', true),  -- A: owns lists 1-3
  ('00000000-0000-4000-8000-00000000f5d1', true),  -- D: same household as A
  ('00000000-0000-4000-8000-00000000f5b1', true);  -- B: stranger

insert into public.households (id, name) values
  ('50000000-0000-4000-8000-000000000058', 'Test Household (finish_shopping)');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-00000000f5a1', '50000000-0000-4000-8000-000000000058'),
  ('00000000-0000-4000-8000-00000000f5d1', '50000000-0000-4000-8000-000000000058');

insert into public.locations (id, name, lat, lng, created_by) values
  ('81000000-0000-4000-8000-000000000058',
   'Test Supermarket (finish_shopping)', -36.8485, 174.7633,
   '00000000-0000-4000-8000-00000000f5a1');

insert into public.lists (id, owner_id, household_id, location_id, name) values
  ('70000000-0000-4000-8000-000000000581',
   '00000000-0000-4000-8000-00000000f5a1', '50000000-0000-4000-8000-000000000058',
   '81000000-0000-4000-8000-000000000058', 'List 1 (partial finish)'),
  ('70000000-0000-4000-8000-000000000582',
   '00000000-0000-4000-8000-00000000f5a1', '50000000-0000-4000-8000-000000000058',
   '81000000-0000-4000-8000-000000000058', 'List 2 (equal-rank)'),
  ('70000000-0000-4000-8000-000000000583',
   '00000000-0000-4000-8000-00000000f5a1', '50000000-0000-4000-8000-000000000058',
   '81000000-0000-4000-8000-000000000058', 'List 3 (full finish)');

insert into public.list_items (id, list_id, name, position, checked_at) values
  ('90000000-0000-4000-8000-000000005811', '70000000-0000-4000-8000-000000000581',
   'item1', 'a0', now()),
  ('90000000-0000-4000-8000-000000005812', '70000000-0000-4000-8000-000000000581',
   'item2', 'a1', now()),
  ('90000000-0000-4000-8000-000000005813', '70000000-0000-4000-8000-000000000581',
   'item3', 'a2', null),
  ('90000000-0000-4000-8000-000000005821', '70000000-0000-4000-8000-000000000582',
   'item4', 'a0', now()),
  ('90000000-0000-4000-8000-000000005822', '70000000-0000-4000-8000-000000000582',
   'item5', 'a1', null),
  ('90000000-0000-4000-8000-000000005831', '70000000-0000-4000-8000-000000000583',
   'item6', 'a0', now()),
  ('90000000-0000-4000-8000-000000005832', '70000000-0000-4000-8000-000000000583',
   'item7', 'a1', now());

-- ---------------------------------------------------------------------------
-- Assertion 1 — positive, partial finish. As A, finish list 1 (2 of 3 items
-- checked). Must return (archived=false, checked_count=2, total_count=3),
-- leave archived_at null, soft-delete exactly the 2 checked items, and write
-- exactly one new location_checkoffs row (2 names) and one shop_sessions row
-- (3 item_names, 2 checked_item_names).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000000581');

  if r.archived <> false or r.checked_count <> 2 or r.total_count <> 3 then
    raise exception 'FAIL: partial finish returned (archived=%, checked_count=%, total_count=%), expected (false, 2, 3)',
      r.archived, r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
begin
  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000581') is not null then
    raise exception 'FAIL: a partial finish archived the list — it must stay active';
  end if;

  if (select count(*) from public.list_items
      where id in ('90000000-0000-4000-8000-000000005811', '90000000-0000-4000-8000-000000005812')
        and deleted_at is not null) <> 2 then
    raise exception 'FAIL: the 2 checked items in list 1 were not soft-deleted by the partial finish';
  end if;

  if (select deleted_at from public.list_items
      where id = '90000000-0000-4000-8000-000000005813') is not null then
    raise exception 'FAIL: the unchecked item in list 1 was soft-deleted — only checked items may be removed';
  end if;

  if (select count(*) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000000581') <> 1 then
    raise exception 'FAIL: expected exactly 1 shop_sessions row for list 1 after the partial finish';
  end if;

  if (select array_length(item_names, 1) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000000581') <> 3 then
    raise exception 'FAIL: shop_sessions.item_names for list 1 does not have cardinality 3 (the full original snapshot)';
  end if;

  if (select array_length(checked_item_names, 1) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000000581') <> 2 then
    raise exception 'FAIL: shop_sessions.checked_item_names for list 1 does not have cardinality 2';
  end if;

  if (select count(*) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000058') <> 1 then
    raise exception 'FAIL: expected exactly 1 location_checkoffs row for the test location after the partial finish';
  end if;

  if (select array_length(item_names, 1) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000058') <> 2 then
    raise exception 'FAIL: location_checkoffs.item_names does not have cardinality 2 (the checked names, normalized)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 2 — re-running the same call. Only item3 (never checked) remains
-- in list 1; calling finish_shopping() again as A must raise `nothing_checked`
-- and must not create a second shop_sessions/location_checkoffs row. This is
-- the concurrency-guard assertion expressed as sequential reinvocation, the
-- same idiom rls_lists_archived_at.sql's own assertion 5 used for
-- archiveList()'s conditional UPDATE.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000581');
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;

  if not raised then
    raise exception 'FAIL: re-running finish_shopping on list 1 (nothing left checked) succeeded — expected nothing_checked';
  end if;

  if msg <> 'nothing_checked' then
    raise exception 'FAIL: re-running finish_shopping on list 1 raised the wrong error (%) — expected nothing_checked', msg;
  end if;
end $$;

reset role;

do $$
begin
  if (select count(*) from public.shop_sessions
      where list_id = '70000000-0000-4000-8000-000000000581') <> 1 then
    raise exception 'FAIL: the rejected re-invocation created a second shop_sessions row for list 1';
  end if;

  if (select count(*) from public.location_checkoffs
      where location_id = '81000000-0000-4000-8000-000000000058') <> 1 then
    raise exception 'FAIL: the rejected re-invocation created a second location_checkoffs row';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 3 — equal-rank. D (household member, not owner) finishes list 2
-- (owned by A, 1 of 2 items checked). Must succeed exactly like A's own call
-- would (03-SPEC.md's "all members equal rank").
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5d1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000000582');

  if r.archived <> false or r.checked_count <> 1 or r.total_count <> 2 then
    raise exception 'FAIL: D (household member, not owner) finishing list 2 returned (archived=%, checked_count=%, total_count=%), expected (false, 1, 2) — equal-rank invariant broken',
      r.archived, r.checked_count, r.total_count;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — full finish, unchanged behavior. A finishes list 3, every
-- item checked. Must archive the list, return archived=true, and leave both
-- items in place (no soft-delete — the archived-list-keeps-its-items
-- invariant from before this issue).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  r record;
begin
  select * into r from public.finish_shopping('70000000-0000-4000-8000-000000000583');

  if r.archived <> true or r.checked_count <> 2 or r.total_count <> 2 then
    raise exception 'FAIL: full finish of list 3 returned (archived=%, checked_count=%, total_count=%), expected (true, 2, 2)',
      r.archived, r.checked_count, r.total_count;
  end if;
end $$;

reset role;

do $$
begin
  if (select archived_at from public.lists
      where id = '70000000-0000-4000-8000-000000000583') is null then
    raise exception 'FAIL: a full finish did not archive list 3';
  end if;

  if (select count(*) from public.list_items
      where list_id = '70000000-0000-4000-8000-000000000583'
        and deleted_at is not null) <> 0 then
    raise exception 'FAIL: a full finish soft-deleted items on list 3 — an archived list must keep all its items';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 5 — authorization negative. B (a stranger to A and D) calls
-- finish_shopping against A's list 2 id (still has 1 unchecked item left, so
-- a permission bypass would otherwise succeed as a partial finish). Must
-- raise list_not_found, not a silent success or a different error.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5b1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  msg text;
begin
  begin
    perform public.finish_shopping('70000000-0000-4000-8000-000000000582');
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;

  if not raised then
    raise exception 'FAIL: stranger B could call finish_shopping against A''s list — no exception raised';
  end if;

  if msg <> 'list_not_found' then
    raise exception 'FAIL: stranger B''s call raised the wrong error (%) — expected list_not_found', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 — grant tightening. As A, a direct client UPDATE of
-- archived_at must now fail: finish_shopping() is the only write path left.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000f5a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    update public.lists set archived_at = now()
    where id = '70000000-0000-4000-8000-000000000581';
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: A could directly UPDATE lists.archived_at — the revoke update (archived_at) grant tightening did not land';
  end if;
end $$;

reset role;

rollback;
