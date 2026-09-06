-- Issue #58 — Partial finish keeps list active; history marks items not bought.
--
-- Replaces ShoppingScreen.finishShopping()'s sequential direct-table-write shape
-- (archiveList() claim -> refresh() -> recordLocationCheckoff() ->
-- recordShopSession()) with one `security definer` RPC, for the reason
-- 20260817000000's own header can no longer claim once a partial finish stops
-- setting archived_at: that migration's conditional `.is('archived_at', null)`
-- UPDATE was atomic *because* every successful finish set that one column.
-- A partial finish must NOT set it, so there is no longer a single column whose
-- null-to-non-null transition can serve as the claim. This function follows
-- vote_location_item_correction()'s precedent (20260811000002) instead: lock the
-- rows this call needs, re-check live state against those locks, then act — the
-- "check, then write" invariant this spans (list.archived_at, list_items.deleted_at,
-- location_checkoffs, shop_sessions, all one shop) cannot be expressed as a plain
-- RLS predicate.
--
-- Concurrency: two concurrent calls for the same list serialize on the list row's
-- `for update` lock. The second caller, once unblocked, re-reads the row's
-- post-commit state (Postgres re-tests a FOR UPDATE query's predicate against the
-- latest committed version once a blocking lock is granted, under the database's
-- default READ COMMITTED isolation) rather than anything read before it queued —
-- so it either sees archived_at already set (raises already_finished) or sees the
-- previously-checked items already gone (raises nothing_checked if none remain
-- checked). Neither caller can ever write either row twice for the same shop.
--
-- This also retires the compensating-unarchive story entirely: there is no longer
-- a multi-step client sequence that can fail halfway. One transaction, one commit
-- or one rollback.
--
-- Authorization is re-implemented inline (owner_id = caller or household_id =
-- current_household_id()), matching lists_update_visible's own predicate exactly,
-- because a security-definer function is not subject to RLS at all — same
-- reasoning promote_to_household() and vote_location_item_correction() already
-- established.

create or replace function public.finish_shopping(p_list_id uuid)
returns table (archived boolean, checked_count integer, total_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_household_id uuid;
  v_location_id uuid;
  v_archived_at timestamptz;
  v_all_item_names text[];
  v_checked_item_names text[];
  v_checked_ids uuid[];
  v_checked_count int;
  v_total_count int;
  v_all_checked boolean;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select l.household_id, l.location_id, l.archived_at
  into v_household_id, v_location_id, v_archived_at
  from public.lists l
  where l.id = p_list_id
    and l.deleted_at is null
    and (l.owner_id = caller or l.household_id = public.current_household_id())
  for update;

  if not found then
    raise exception 'list_not_found';
  end if;

  if v_archived_at is not null then
    raise exception 'already_finished';
  end if;

  if v_location_id is null then
    raise exception 'no_location';
  end if;

  -- Locks every non-deleted item row for this list before this function reads
  -- any of them, so a concurrent second call queues here (or on the list lock
  -- above) rather than reading a half-updated item set. `for update` cannot be
  -- combined with aggregates in the same query, hence the separate `perform`.
  perform 1
  from public.list_items li
  where li.list_id = p_list_id
    and li.deleted_at is null
  for update;

  select
    coalesce(array_agg(li.name order by li.position, li.id), '{}'),
    coalesce(array_agg(li.name order by li.checked_at, li.id)
      filter (where li.checked_at is not null), '{}'),
    coalesce(array_agg(li.id) filter (where li.checked_at is not null), '{}'),
    count(*) filter (where li.checked_at is not null),
    count(*)
  into v_all_item_names, v_checked_item_names, v_checked_ids, v_checked_count, v_total_count
  from public.list_items li
  where li.list_id = p_list_id
    and li.deleted_at is null;

  if v_checked_count = 0 then
    raise exception 'nothing_checked';
  end if;

  v_all_checked := v_checked_count = v_total_count;

  insert into public.location_checkoffs (location_id, item_names)
  values (
    v_location_id,
    (select array_agg(lower(btrim(name))) from unnest(v_checked_item_names) as name)
  );

  insert into public.shop_sessions (owner_id, household_id, location_id, list_id, item_names, checked_item_names)
  values (caller, v_household_id, v_location_id, p_list_id, v_all_item_names, v_checked_item_names);

  if v_all_checked then
    update public.lists set archived_at = now() where id = p_list_id;
  else
    update public.list_items set deleted_at = now() where id = any(v_checked_ids);
  end if;

  return query select v_all_checked, v_checked_count, v_total_count;
end;
$$;

revoke execute on function public.finish_shopping(uuid) from public, anon;
grant execute on function public.finish_shopping(uuid) to authenticated;

-- Tightening: with the RPC above as the one and only writer of these three
-- columns/tables going forward (archiveList()/unarchiveList()/
-- recordLocationCheckoff()/recordShopSession() are all deleted from the client —
-- see mobile/src/lib/lists.ts, locationCheckoffs.ts, shopSessions.ts), the grants
-- that made direct client writes to them possible are now stray permissions with
-- no legitimate caller — same "no client-facing write path outside the definer
-- function" bar 20260811000002's header set for location_item_votes. Revoking
-- them closes the surface rather than leaving an unused door open.
revoke update (archived_at) on table public.lists from authenticated;
revoke insert on table public.location_checkoffs from authenticated;
revoke insert on table public.shop_sessions from authenticated;
