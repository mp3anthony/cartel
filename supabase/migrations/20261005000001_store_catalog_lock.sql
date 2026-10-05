-- #107 (slice S4, Migration B): lock the Store catalog. Schema + grants + policies only; no data change.
--
-- Stores are seeded by Cartel (ADR 0007); clients only read them. This file:
--   * drops locations_insert_own (20260810000005) and locations_update_chain (#54, 20260823000001);
--   * re-asserts the whole door: revoke everything from anon/authenticated, re-grant the column-level SELECT;
--   * retires the 'other' chain value and makes chain NOT NULL (one of the five brands);
--   * makes name unique (canonical names, ADR 0007).
-- No row is deleted or moved, so no FK (lists, location_items, location_checkoffs, shop_sessions) is touched.
-- created_by is kept as provenance metadata (NULL for seeded rows), still withheld from SELECT.
-- Run as one script: Postgres runs a multi-statement script as one implicit transaction, so any failure leaves nothing applied.

do $$
declare bad text;
begin
  select string_agg(name || ' (' || coalesce(chain, 'null') || ')', ', ') into bad
    from public.locations
   where chain is null or chain not in ('new_world', 'paknsave', 'four_square', 'woolworths', 'freshchoice');
  if bad is not null then
    raise exception 'store catalog lock: rows with a null or retired chain: %', bad;
  end if;

  select string_agg(name, ', ') into bad from (
    select name from public.locations group by name having count(*) > 1
  ) d;
  if bad is not null then
    raise exception 'store catalog lock: duplicate store names: %', bad;
  end if;

  if (select count(*) from public.locations where id in (
        'f2bbd013-791d-4acc-88d7-fa4ec8fc24d3',
        'd53f3384-f6b2-4462-886e-b38b36fe16b7',
        'bd56e348-c0ad-4fea-ae37-c333ea6ccf1a')) <> 3 then
    raise exception 'store catalog lock: one of the three original stores is missing; stop and ask Ant';
  end if;
end $$;

drop policy locations_insert_own on public.locations;
drop policy locations_update_chain on public.locations;

revoke all on table public.locations from anon, authenticated;
grant select (id, name, lat, lng, created_at, chain) on table public.locations to authenticated;

alter table public.locations
  drop constraint locations_chain_check,
  alter column chain set not null,
  add constraint locations_chain_check
    check (chain in ('new_world', 'paknsave', 'four_square', 'woolworths', 'freshchoice')),
  add constraint locations_name_key unique (name);

-- ROLLBACK (commented; run by hand only if Ant asks). Restores the 0.0.42 state.
-- alter table public.locations
--   drop constraint locations_name_key,
--   drop constraint locations_chain_check,
--   alter column chain drop not null,
--   add constraint locations_chain_check check (chain is null or chain in (
--     'new_world', 'paknsave', 'four_square', 'woolworths', 'freshchoice', 'other'));
-- create policy locations_insert_own on public.locations
--   for insert to authenticated with check (created_by = (select auth.uid()));
-- create policy locations_update_chain on public.locations
--   for update to authenticated using (true) with check (true);
-- grant insert on table public.locations to authenticated;
-- grant update (chain) on table public.locations to authenticated;
