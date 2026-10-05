-- Data checks for the seeded Christchurch Store catalog (#107, Migration A,
-- 20261005000000_store_catalog_seed.sql).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or the dashboard SQL editor. Success
-- is silence: every check raises only when it fails, so a run that returns without
-- a `FAIL:` exception is a pass. Read-only; wrapped in begin ... rollback anyway.
--
-- Ground truth is read as the owning (bypass-RLS) role, never as a denied actor
-- (docs/lessons.md): execute_sql runs as that role, so plain selects below see
-- every row. Only the last check switches to `authenticated`.
--
-- Run it after Migration A. It describes the catalog at seed time: the row count
-- (52) is the CSV's, so it will need updating once stores are added or retired.

begin;

do $$
declare
  n integer;
  bad text;
begin
  -- 1. Row count equals the CSV (supabase/seed/store-catalog-christchurch.csv).
  select count(*) into n from public.locations;
  if n <> 52 then
    raise exception 'FAIL: expected 52 locations (the CSV row count), found %', n;
  end if;

  -- 2. Every chain is one of the five brands (no null, no 'other').
  select string_agg(name, ', ') into bad from public.locations
   where chain is null or chain not in ('new_world', 'paknsave', 'four_square', 'woolworths', 'freshchoice');
  if bad is not null then
    raise exception 'FAIL: locations with a missing or unexpected chain: %', bad;
  end if;

  -- 3. Names are unique (exact match).
  select string_agg(name, ', ') into bad from (
    select name from public.locations group by name having count(*) > 1
  ) d;
  if bad is not null then
    raise exception 'FAIL: duplicate location names: %', bad;
  end if;

  -- 4. Every name starts with its chain's brand label.
  select string_agg(name, ', ') into bad from public.locations
   where name not like case chain
           when 'new_world' then 'New World %'
           when 'paknsave' then 'PAK''nSAVE %'
           when 'four_square' then 'Four Square %'
           when 'woolworths' then 'Woolworths %'
           when 'freshchoice' then 'FreshChoice %'
         end;
  if bad is not null then
    raise exception 'FAIL: names that do not start with their chain brand label: %', bad;
  end if;

  -- 5. Coordinates sit inside the Christchurch box (-43.70..-43.25, 172.30..172.80).
  select string_agg(name, ', ') into bad from public.locations
   where lat not between -43.70 and -43.25 or lng not between 172.30 and 172.80;
  if bad is not null then
    raise exception 'FAIL: locations outside the Christchurch bounding box: %', bad;
  end if;

  -- 6. The three matched production rows were renamed in place (same ids).
  if not exists (select 1 from public.locations
      where id = 'f2bbd013-791d-4acc-88d7-fa4ec8fc24d3' and name = 'Woolworths Northlands' and chain = 'woolworths'
        and lat = -43.491464 and lng = 172.611749) then
    raise exception 'FAIL: f2bbd013... is not ''Woolworths Northlands''';
  end if;
  if not exists (select 1 from public.locations
      where id = 'd53f3384-f6b2-4462-886e-b38b36fe16b7' and name = 'PAK''nSAVE Papanui' and chain = 'paknsave'
        and lat = -43.485578 and lng = 172.614722) then
    raise exception 'FAIL: d53f3384... is not ''PAK''''nSAVE Papanui''';
  end if;
  if not exists (select 1 from public.locations
      where id = 'bd56e348-c0ad-4fea-ae37-c333ea6ccf1a' and name = 'New World Durham Street' and chain = 'new_world'
        and lat = -43.538731 and lng = 172.633136) then
    raise exception 'FAIL: bd56e348... is not ''New World Durham Street''';
  end if;

  -- 7. FK reference counts on the three matched stores did not shrink. Pre-flight
  --    snapshot (Northlands / PAK'nSAVE Papanui / Durham Street):
  --      lists.location_id        9 / 7 / 2
  --      location_items           12 / 31 / 0
  --      location_checkoffs       7 / 5 / 1
  --      shop_sessions            6 / 3 / 1
  --    Counts may legitimately grow with use, so assert >=, never =.
  if (select count(*) from public.lists where location_id = 'f2bbd013-791d-4acc-88d7-fa4ec8fc24d3') < 9
     or (select count(*) from public.lists where location_id = 'd53f3384-f6b2-4462-886e-b38b36fe16b7') < 7
     or (select count(*) from public.lists where location_id = 'bd56e348-c0ad-4fea-ae37-c333ea6ccf1a') < 2 then
    raise exception 'FAIL: lists.location_id references to a matched store dropped below the pre-flight 9/7/2';
  end if;
  if (select count(*) from public.location_items where location_id = 'f2bbd013-791d-4acc-88d7-fa4ec8fc24d3') < 12
     or (select count(*) from public.location_items where location_id = 'd53f3384-f6b2-4462-886e-b38b36fe16b7') < 31 then
    -- Durham Street's pre-flight count is 0, so nothing can be asserted for it.
    raise exception 'FAIL: location_items for a matched store dropped below the pre-flight 12/31/(0)';
  end if;
  if (select count(*) from public.location_checkoffs where location_id = 'f2bbd013-791d-4acc-88d7-fa4ec8fc24d3') < 7
     or (select count(*) from public.location_checkoffs where location_id = 'd53f3384-f6b2-4462-886e-b38b36fe16b7') < 5
     or (select count(*) from public.location_checkoffs where location_id = 'bd56e348-c0ad-4fea-ae37-c333ea6ccf1a') < 1 then
    raise exception 'FAIL: location_checkoffs for a matched store dropped below the pre-flight 7/5/1';
  end if;
  if (select count(*) from public.shop_sessions where location_id = 'f2bbd013-791d-4acc-88d7-fa4ec8fc24d3') < 6
     or (select count(*) from public.shop_sessions where location_id = 'd53f3384-f6b2-4462-886e-b38b36fe16b7') < 3
     or (select count(*) from public.shop_sessions where location_id = 'bd56e348-c0ad-4fea-ae37-c333ea6ccf1a') < 1 then
    raise exception 'FAIL: shop_sessions for a matched store dropped below the pre-flight 6/3/1';
  end if;
end $$;

-- 8. Catalog is readable by an authenticated client (global SELECT, no scoping).
--    A bare anonymous user suffices: locations has no household predicate.
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000d1', true);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.locations) <> 52 then
    raise exception 'FAIL: an authenticated user with no household does not see all 52 catalog stores';
  end if;
end $$;

reset role;

rollback;
