-- RLS/grant tests for public.location_items (Slice 6 — Crowdsourced Location
-- Tagging).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- WHAT IT IS REALLY GUARDING. `public.location_items` (migration 20260811000000)
-- is deliberately global and anonymous, same class as `public.locations` per
-- 03-SPEC.md § 0 — assertion 1 is this file's direct analogue of
-- rls_locations.sql's assertion 1 and the issue's own acceptance test: a stranger
-- who shares nothing with the tag's author must still see it. Assertion 2 checks
-- the stronger anonymity claim structurally, at the schema level, rather than only
-- behaviourally — there is no creator column to withhold in the first place, not
-- merely one that is withheld from a grant. Assertion 3 is the race-arbitration
-- story migration 20260811000000's header describes: `unique (location_id, name)`
-- is the only thing standing between two shoppers' concurrent tags on the same
-- untagged item, so this checks both halves — the loser's INSERT actually raises,
-- and the winner's section text is genuinely undisturbed afterwards, not merely
-- that an error was thrown. Assertion 4 checks that tagging needs no household at
-- all, matching this table's own "are you authenticated" bar
-- (`location_items_insert_all`). Assertion 5 checks the foreign key does real
-- enforcement work. Assertion 6 checks names are stored folded (#106 slice 4a,
-- migration 20261011000000): a differently spelled twin of an existing tag hits the
-- unique key instead of becoming a second tag, and a new name is stored as its fold.
--
-- Fixtures are the premise, not the thing under test, so the location row is
-- inserted as the owning role, which bypasses RLS. Only the assertions run as
-- `authenticated`. `request.jwt.claims` must be set *before* the role switch:
-- after it, the session no longer has the privilege to set the GUC on some
-- configurations, and auth.uid() reads that GUC.

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
-- Assertion 0 — positive control, as E. Without this, the "must be visible"
-- assertions below would prove nothing if the policy hid everything, including
-- from the row's own author.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.location_items (location_id, name, section)
  values ('80000000-0000-4000-8000-000000000001', 'milk', 'Aisle 3');

  if (select count(*) from public.location_items
      where location_id = '80000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 1 then
    raise exception 'FAIL: E cannot see the tag E just inserted';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — THE core property. As F, who shares no household with E and did
-- not create the row: E's tag must still be visible on a plain select scoped to
-- location L. This is the direct analogue of the issue's acceptance test.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select section from public.location_items
      where location_id = '80000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 'Aisle 3' then
    raise exception 'FAIL: F cannot see E''s tag — location_items is not actually global (it is scoping visibility by author or household when it must not, or should never have had one to begin with)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 — anonymity, structurally. No column on this table can name a
-- creator, not merely one withheld from a grant. Metadata query, no role switch
-- needed.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'location_items'
      and column_name in ('created_by', 'user_id', 'owner_id', 'tagged_by', 'author_id')
  ) then
    raise exception 'FAIL: public.location_items has a creator-shaped column — this table must never attribute a tag to anyone';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 3 — insert-race / first-tag-wins. As F, attempting to tag the same
-- (location, normalized name) E already tagged must raise (the unique
-- constraint), and E's stored section must be left completely undisturbed.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.location_items (location_id, name, section)
    values ('80000000-0000-4000-8000-000000000001', 'milk', 'Aisle 7');
  exception when unique_violation then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: F''s racing insert for the same (location, name) succeeded — the unique constraint is not arbitrating the race';
  end if;
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select section from public.location_items
      where location_id = '80000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 'Aisle 3' then
    raise exception 'FAIL: E''s winning section was overwritten by F''s losing insert — first-tag-wins is broken';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — no household required to write. As F, who has no household at
-- all, inserting a new, different tag at L must succeed and be visible.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into public.location_items (location_id, name, section)
  values ('80000000-0000-4000-8000-000000000001', 'bread', 'Aisle 1');

  if (select count(*) from public.location_items
      where location_id = '80000000-0000-4000-8000-000000000001'
        and name = 'bread') <> 1 then
    raise exception 'FAIL: F (no household at all) could not tag an item, or cannot see the tag F just inserted';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 — the foreign key does real work.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.location_items (location_id, name, section)
    values ('99999999-0000-4000-8000-000000000000', 'eggs', 'Aisle 2');
  exception when foreign_key_violation then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: inserting a tag against a nonexistent location_id succeeded — the foreign key constraint is not enforced';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 — names are stored folded (location_items_tidy, then the
-- location_items_name_folded check). As E, 'Milk' next to the existing 'milk' is
-- the same item and must fail with a unique violation (not be stored as a second
-- tag); 'Eggs ' (capital, trailing space) is stored as 'eggs'.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.location_items (location_id, name, section)
    values ('80000000-0000-4000-8000-000000000001', 'Milk', 'Aisle 9');
  exception when unique_violation then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: Milk was accepted next to milk (or failed for another reason) — the folded name must hit the unique key';
  end if;

  if (select count(*) from public.location_items
      where location_id = '80000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 1 then
    raise exception 'FAIL: the refused Milk insert left a second milk tag behind';
  end if;

  insert into public.location_items (location_id, name, section)
  values ('80000000-0000-4000-8000-000000000001', 'Eggs ', 'Aisle 2');

  if (select count(*) from public.location_items
      where location_id = '80000000-0000-4000-8000-000000000001'
        and name = 'eggs') <> 1 then
    raise exception 'FAIL: Eggs with a trailing space was not stored as eggs';
  end if;
end $$;

reset role;

rollback;
