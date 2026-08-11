-- RLS/grant tests for public.shop_sessions (Slice 9 — Shop History & List
-- Templates, migration 20260811000003).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- WHAT IT IS REALLY GUARDING. `shop_sessions_select_visible` and
-- `shop_sessions_insert_own` are the same `owner_id = (select auth.uid()) or
-- household_id = current_household_id()` shape `lists_select_visible`/
-- `lists_insert_own` already established (see `rls_lists_locations.sql` for the
-- sibling test of that same shape on `lists.location_id`) — assertions 0-4 confirm
-- that shape holds here too: A sees A's own rows (0), a household mate sees a
-- household-scoped row (1), a personal row stays private even from a household
-- mate (2), a stranger sees neither (3), and two strangers' own personal rows
-- (both household_id null) never leak to each other — the "null = null is not
-- true" property the whole owner-or-household shape depends on (4). Assertion 5
-- is the INSERT-side equal-rank check: any household member, not only the row's
-- own owner, may insert a household-scoped row. Assertion 6 is the INSERT-side
-- negative: a non-member cannot smuggle in a household_id they don't belong to.
-- Assertions 7-8 are the one clause this table's INSERT policy adds beyond
-- `lists_insert_own`'s own shape — `list_id is null or exists (select 1 from
-- lists where id = list_id)` — checked both ways: a list the caller cannot see is
-- rejected (7), a list the caller can see is accepted (8). Assertion 9 checks the
-- `location_id` foreign key does real work, not just a UI-level convenience.
-- Assertion 10 checks `list_id`'s `on delete set null` — deliberately the
-- opposite of `location_id`'s `on delete cascade`, per the migration's own header.
-- Assertions 11-12 confirm there is no UPDATE or DELETE path at all, not even for
-- a row's own owner: this table is append-only by design (matching
-- `location_checkoffs`' own stance), and the absence of a policy or grant for
-- either statement is the entire enforcement mechanism — nothing else in this
-- schema stops a client from mutating its own history otherwise.
--
-- Fixtures are the premise, not the thing under test, so they are inserted as the
-- owning role, which bypasses RLS. Only the assertions run as `authenticated`.
-- `request.jwt.claims` must be set *before* the role switch: after it, the session
-- no longer has the privilege to set the GUC on some configurations, and auth.uid()
-- reads that GUC.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. A and D share household H. B and C are strangers to A, D, and each
-- other. LOC1 is one location. LIST_A_PERSONAL is A's own private list;
-- LIST_A_HOUSEHOLD is A's list already shared with H.
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-000000000901', true),  -- A: household member
  ('00000000-0000-4000-8000-000000000902', true),  -- D: same household as A
  ('00000000-0000-4000-8000-000000000903', true),  -- B: stranger to A/D and to C
  ('00000000-0000-4000-8000-000000000904', true);  -- C: stranger to A/D and to B

insert into public.households (id, name) values
  ('90000000-0000-4000-8000-000000000001', 'Test Household');

insert into public.household_members (user_id, household_id) values
  ('00000000-0000-4000-8000-000000000901', '90000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000902', '90000000-0000-4000-8000-000000000001');

insert into public.locations (id, name, lat, lng, created_by) values
  ('91000000-0000-4000-8000-000000000001',
   'Test Supermarket', -43.5321, 172.6362,
   '00000000-0000-4000-8000-000000000901');

insert into public.lists (id, owner_id, household_id, name) values
  ('92000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000901', null,
   'A personal'),
  ('92000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000901', '90000000-0000-4000-8000-000000000001',
   'A household');

-- ---------------------------------------------------------------------------
-- Assertion 0 — positive control, as A: insert a personal row, see it.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('93000000-0000-4000-8000-000000000001',
     '91000000-0000-4000-8000-000000000001', null, null,
     array['Milk', 'Bread'], array['Milk']);

  if (select count(*) from public.shop_sessions
      where id = '93000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FAIL: A cannot see the personal shop_sessions row A just inserted (positive control; the assertions below would prove nothing)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — household visibility: A inserts a household-scoped row, D sees it.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('93000000-0000-4000-8000-000000000002',
     '91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', null,
     array['Eggs'], array['Eggs']);
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000902","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.shop_sessions
      where id = '93000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'FAIL: D cannot see A''s household-scoped shop_sessions row — household visibility broken';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 — personal stays private inside a household: D cannot see A's
-- personal row from assertion 0.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000902","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.shop_sessions
      where id = '93000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FAIL: D can see A''s personal shop_sessions row — a personal row leaked to a household mate';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 — stranger denial: B cannot see either of A's two rows.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000903","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.shop_sessions
      where id in ('93000000-0000-4000-8000-000000000001',
                    '93000000-0000-4000-8000-000000000002')) <> 0 then
    raise exception 'FAIL: B (a stranger) can see one of A''s shop_sessions rows';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — null = null: B and C each insert their own personal row;
-- neither can see the other's.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000903","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('93000000-0000-4000-8000-000000000004',
     '91000000-0000-4000-8000-000000000001', null, null,
     array['Cheese'], array['Cheese']);
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000904","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('93000000-0000-4000-8000-000000000005',
     '91000000-0000-4000-8000-000000000001', null, null,
     array['Butter'], array['Butter']);

  if (select count(*) from public.shop_sessions
      where id = '93000000-0000-4000-8000-000000000004') <> 0 then
    raise exception 'FAIL: C can see B''s personal shop_sessions row — null household_id is being treated as a shared bucket';
  end if;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000903","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.shop_sessions
      where id = '93000000-0000-4000-8000-000000000005') <> 0 then
    raise exception 'FAIL: B can see C''s personal shop_sessions row — null household_id is being treated as a shared bucket';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 — INSERT, equal-rank: D (not A, not the row's owner) inserts a
-- household-scoped row and sees it.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000902","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('93000000-0000-4000-8000-000000000003',
     '91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', null,
     array['Yogurt'], array['Yogurt']);

  if (select count(*) from public.shop_sessions
      where id = '93000000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'FAIL: D (household member, not owner) could not insert or see a household-scoped shop_sessions row — equal-rank invariant broken';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 — INSERT smuggling denial: B cannot claim household_id = H.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000903","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.shop_sessions
      (id, location_id, household_id, list_id, item_names, checked_item_names)
    values
      ('93000000-0000-4000-8000-000000000008',
       '91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', null,
       array['Smuggled'], array['Smuggled']);
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: B could insert a shop_sessions row claiming household_id = H without being a member — insert policy household check bypassed';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 7 — list_id visibility check, negative: B cannot reference a list
-- B cannot see.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000903","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.shop_sessions
      (id, location_id, household_id, list_id, item_names, checked_item_names)
    values
      ('93000000-0000-4000-8000-000000000009',
       '91000000-0000-4000-8000-000000000001', null,
       '92000000-0000-4000-8000-000000000001',
       array['Smuggled'], array['Smuggled']);
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: B could insert a shop_sessions row referencing list_id = LIST_A_PERSONAL, a list B cannot see — list_id visibility check bypassed';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 8 — list_id visibility check, positive: A can reference a list
-- A can see.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('93000000-0000-4000-8000-000000000006',
     '91000000-0000-4000-8000-000000000001', null,
     '92000000-0000-4000-8000-000000000001',
     array['Flour'], array['Flour']);

  if (select count(*) from public.shop_sessions
      where id = '93000000-0000-4000-8000-000000000006') <> 1 then
    raise exception 'FAIL: A could not insert a shop_sessions row referencing A''s own visible list_id';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 9 — the location_id foreign key does real work.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.shop_sessions
      (id, location_id, household_id, list_id, item_names, checked_item_names)
    values
      ('93000000-0000-4000-8000-000000000010',
       '99999999-0000-4000-8000-000000000000', null, null,
       array['X'], array['X']);
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: inserting a shop_sessions row with a nonexistent location_id succeeded — the foreign key constraint is not enforced';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 10 — list_id "on delete set null": hard-deleting the referenced
-- list nulls out the shop_sessions row's list_id rather than blocking the
-- delete or cascading it away.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.shop_sessions
    (id, location_id, household_id, list_id, item_names, checked_item_names)
  values
    ('93000000-0000-4000-8000-000000000007',
     '91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
     '92000000-0000-4000-8000-000000000002',
     array['Rice'], array['Rice']);
end $$;

reset role;

-- Hard-delete LIST_A_HOUSEHOLD as the bypass/fixture role. There is no DELETE
-- grant for `authenticated` on `lists` at all (see lists.ts's removeList() —
-- removal is a soft-delete UPDATE), so this step runs outside the RLS-scoped
-- role deliberately, standing in for whatever mechanism eventually hard-deletes
-- a `lists` row.
delete from public.lists where id = '92000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select list_id from public.shop_sessions
      where id = '93000000-0000-4000-8000-000000000007') is not null then
    raise exception 'FAIL: shop_sessions.list_id did not go null after its referenced list was hard-deleted — "on delete set null" is not working';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 11 — no UPDATE path, not even for the row's own owner.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    update public.shop_sessions
    set completed_at = now()
    where id = '93000000-0000-4000-8000-000000000001';
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: A could UPDATE a shop_sessions row A owns — there is no UPDATE grant/policy on this table and there should be none';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 12 — no DELETE path, not even for the row's own owner.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    delete from public.shop_sessions
    where id = '93000000-0000-4000-8000-000000000001';
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: A could DELETE a shop_sessions row A owns — there is no DELETE grant/policy on this table and there should be none';
  end if;
end $$;

reset role;

rollback;
