-- RLS/grant tests for public.location_checkoffs (Slice 7 — Route Learning &
-- Auto-Ordering).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- WHAT IT IS REALLY GUARDING. `public.location_checkoffs` (migration
-- 20260811000001) is deliberately global and anonymous, same class as
-- `public.location_items`/`public.locations` per 03-SPEC.md § 0 — assertion 1 is
-- this file's direct analogue of rls_location_items.sql's assertion 1: a stranger
-- who shares nothing with the checkoff's author must still see it. Assertion 2
-- checks the stronger anonymity claim structurally, at the schema level, rather
-- than only behaviourally — there is no creator, household, or list column to
-- withhold in the first place, not merely one that is withheld from a grant.
-- Assertion 3 checks that a client cannot write a checkoff directly at all: the
-- INSERT grant was revoked in migration 20260906000000, so the only write path is
-- the `finish_shopping` function (before that, this assertion read "no household
-- required to write"; the older version of this file also inserted its fixtures as
-- `authenticated`, which that revoke broke). Assertion 4 checks the foreign key
-- does real work. Assertion 5 checks the cascade-delete behaviour this table
-- deliberately chose over `lists.location_id`'s set-null. Assertions 6-7 check the
-- two check constraints — non-empty array and folded elements (`item_names` must
-- equal `fold_item_name` of itself element by element since #106 slice 4a,
-- migration 20261011000000) — do real enforcement work rather than being
-- decorative.
--
-- Fixtures are the premise, not the thing under test, so the location rows AND the
-- checkoff rows are inserted as the owning role, which bypasses RLS and the grants.
-- Only the read assertions run as `authenticated`. The constraint assertions run as
-- the owner too and catch one specific SQLSTATE, so they cannot pass for a
-- different reason (a missing grant, say). `request.jwt.claims` must be set
-- *before* the role switch: after it, the session no longer has the privilege to
-- set the GUC on some configurations, and auth.uid() reads that GUC.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. E and F share nothing — no household, no prior relationship. One
-- location L, created by E for convenience (created_by is not under test here).
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000e1', true),  -- E
  ('00000000-0000-4000-8000-0000000000f1', true);  -- F

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('80000000-0000-4000-8000-000000000001',
   'Test Supermarket', -36.8485, 174.7633, 'new_world',
   '00000000-0000-4000-8000-0000000000e1');

-- ---------------------------------------------------------------------------
-- Assertion 0 — positive control. The owner records a checkoff; as E (any
-- authenticated user), it must be visible. Without this, the "must be visible"
-- assertion below would prove nothing if the policy hid everything.
-- ---------------------------------------------------------------------------

insert into public.location_checkoffs (location_id, item_names)
values ('80000000-0000-4000-8000-000000000001', array['milk', 'bread']);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.location_checkoffs
      where location_id = '80000000-0000-4000-8000-000000000001'
        and item_names = array['milk', 'bread']) <> 1 then
    raise exception 'FAIL: E cannot see the checkoff the owner inserted';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — THE core property. As F, who shares no household with E and did
-- not write the row: the checkoff must still be visible, with item_names intact,
-- on a plain select scoped to location L.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select item_names from public.location_checkoffs
      where location_id = '80000000-0000-4000-8000-000000000001'
        and item_names = array['milk', 'bread']) <> array['milk', 'bread'] then
    raise exception 'FAIL: F cannot see the checkoff, or item_names was not intact — location_checkoffs is not actually global (it is scoping visibility by author or household when it must not, or should never have had one to begin with)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 — anonymity, structurally. No column on this table can name a
-- creator, household, or list, not merely one withheld from a grant. Metadata
-- query, no role switch needed.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'location_checkoffs'
      and column_name in (
        'created_by', 'user_id', 'owner_id', 'household_id', 'list_id',
        'tagged_by', 'author_id'
      )
  ) then
    raise exception 'FAIL: public.location_checkoffs has a creator/household/list-shaped column — this table must never attribute a completed shop to anyone';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 3 — no direct client write. As F, a raw insert must be refused with
-- insufficient_privilege (the INSERT grant was revoked in 20260906000000): the
-- only way a checkoff is written is finish_shopping.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  st text;
begin
  begin
    insert into public.location_checkoffs (location_id, item_names)
    values ('80000000-0000-4000-8000-000000000001', array['eggs']);
  exception when others then
    st := sqlstate;
  end;

  if st is distinct from '42501' then
    raise exception 'FAIL: F''s direct insert into location_checkoffs gave sqlstate % (null = accepted), expected 42501 — the INSERT grant is back, or the failure has another cause', st;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — the foreign key does real work. As the owner, an insert against a
-- nonexistent location_id must raise a foreign-key violation.
-- ---------------------------------------------------------------------------

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.location_checkoffs (location_id, item_names)
    values ('99999999-0000-4000-8000-000000000000', array['milk']);
  exception when foreign_key_violation then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: inserting a checkoff against a nonexistent location_id succeeded — the foreign key constraint is not enforced';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 5 — cascade delete. A second location M (not L, so this doesn't
-- disturb the other assertions' state) with its own checkoff row; deleting M
-- as the owner (no delete grant exists for `authenticated` on `locations`) must
-- take the checkoff row with it.
-- ---------------------------------------------------------------------------

insert into public.locations (id, name, lat, lng, chain, created_by) values
  ('80000000-0000-4000-8000-000000000002',
   'Test Superette', -36.85, 174.76, 'new_world',
   '00000000-0000-4000-8000-0000000000e1');

insert into public.location_checkoffs (location_id, item_names)
values ('80000000-0000-4000-8000-000000000002', array['butter']);

delete from public.locations where id = '80000000-0000-4000-8000-000000000002';

do $$
begin
  if (select count(*) from public.location_checkoffs
      where location_id = '80000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FAIL: deleting location M left its checkoff row behind — on delete cascade is not working';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 6 — the non-empty-array check constraint does real work: an empty
-- array must be refused with a check violation.
-- ---------------------------------------------------------------------------

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.location_checkoffs (location_id, item_names)
    values ('80000000-0000-4000-8000-000000000001', '{}'::text[]);
  exception when check_violation then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: an empty item_names array was accepted — the cardinality(item_names) > 0 check constraint is not enforced';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 7 — the folded-element check constraint does real work. A
-- capitalised element ('Milk') and an accented one (Cafe with an acute e) must
-- each be refused with a check violation from the item_names constraint, not
-- silently stored or normalised; an already folded array is accepted.
-- ---------------------------------------------------------------------------

do $$
declare
  st text;
  cn text;
  v text;
begin
  foreach v in array array['Milk', U&'caf\00E9'] loop
    st := null; cn := null;
    begin
      insert into public.location_checkoffs (location_id, item_names)
      values ('80000000-0000-4000-8000-000000000001', array[v]);
    exception when others then
      get stacked diagnostics cn = constraint_name;
      st := sqlstate;
    end;

    if st is distinct from '23514' or cn not like 'location_checkoffs_item_names%' then
      raise exception 'FAIL: a non-folded element gave (sqlstate %, constraint %), expected (23514, location_checkoffs_item_names...) — the item_names_are_normalized check constraint is not enforced', st, cn;
    end if;
  end loop;

  insert into public.location_checkoffs (location_id, item_names)
  values ('80000000-0000-4000-8000-000000000001', array['milk', 'cafe']);
end $$;

rollback;
