-- Issue #90 (Leave household), Slice 1: database only.
--
-- WHAT THIS ADDS
--   public.leave_household(p_copy_lists boolean, p_allow_delete boolean)
--       returns table (outcome text, copied_lists integer)
--     Removes the caller from their household. outcome is 'left' (someone else
--     remains) or 'deleted' (the caller was the last member and the household was
--     deleted, which cascades). Optionally first copies every live shared list into
--     a personal list owned by the caller (the same "copy" rule as the app's
--     list-detail copy: same name and store, current items with Quantity, unticked).
--   public.redeem_invite(text)  REDEFINED (same signature, return type and grants).
--     It now locks the target household row FOR KEY SHARE before claiming the code,
--     so a join cannot interleave with the last member leaving.
--
-- No table, column, index, trigger or RLS policy changes. Nothing here touches
-- locations, location_items, location_item_votes or location_checkoffs (ADR 0002).
-- Decision record: docs/adr/0009-leaving-a-household.md. Revert:
-- supabase/rollback/090_leave_household_revert.sql.
--
-- WHY AN RPC. Clients have no write access to household_members, and a leave
-- spans several tables (copy lists, move ownership, delete membership, maybe delete
-- the household). It must be one transaction, and the "last member" decision must
-- be made under a lock, not from a stale client-side member count.
--
-- OWNERSHIP RULE (no RLS change). When someone else remains, the leaver's shared
-- lists (live and soft-deleted) and household shop_sessions move to the remaining
-- member who joined earliest (ties by user_id). Only owner_id changes: household_id
-- never does, so no shared list becomes personal (ADR 0006). Rewriting every list
-- and shop policy and the finish_shopping / reset_list checks to cope with a
-- leaver-owned row was rejected. The owner_id update does not bump
-- lists.last_activity_at (lists_touch_activity ignores owner_id). The leaver's
-- personal lists and personal shop_sessions are never touched.
--
-- CASCADE ON LAST MEMBER. Deleting the households row cascades to
-- household_members, household_invites, lists (and through them list_items) and
-- shop_sessions. shop_sessions.list_id is ON DELETE SET NULL, so the leaver's own
-- PERSONAL shop_sessions rows that point at a deleted shared list keep existing
-- with a null list_id. The delete is irreversible and there is no backup. The
-- function refuses it unless the caller passes p_allow_delete = true, and the
-- check happens before any write.
--
-- REALTIME. A hard delete emits Realtime DELETE events (no RLS applies to DELETE)
-- that carry only row ids (default replica identity). Accepted; the existing
-- shop_sessions hard delete has the same property.
--
-- LOCK ORDER (the load-bearing part). finish_shopping and reset_list lock
-- list_items rows, then the lists row, and only then insert a shop_sessions row
-- (whose foreign key takes an implicit KEY SHARE on the households row).
-- setChecked locks an item row and then, through the activity trigger, the lists
-- row. leave_household therefore takes, in this order:
--     1. list_items rows of the household's lists   (FOR UPDATE, ORDER BY id)
--     2. lists rows of the household                (FOR UPDATE, ORDER BY id)
--     3. the households row                         (FOR UPDATE)
--   and redeem_invite takes: households row (FOR KEY SHARE), then the invite row.
-- Table-level order is compatible across all paths (items -> lists -> households), so:
--   * leave vs finish_shopping / reset_list / setChecked cannot deadlock at table
--     level; the cascade delete also waits for them. At ITEM level a rare deadlock
--     is still possible: leave locks list_items ORDER BY id, while finish_shopping
--     and reset_list lock the live items in scan order. If that happens, Postgres's
--     deadlock detector aborts one side with 40P01 and nothing is corrupted (the
--     aborted call rolls back and can be retried);
--   * join vs leave cannot deadlock: FOR UPDATE on households conflicts with
--     redeem_invite's KEY SHARE, so a join either completes before the leave's lock
--     (then it is counted among the other members) or waits and, if the household
--     was deleted, fails cleanly with invalid_or_expired_code;
--   * two concurrent leaves (or a double tap) serialise on the households lock; the
--     loser re-reads its membership after acquiring it and gets not_in_household.
-- Step 3 must be FOR UPDATE: FOR KEY SHARE conflicts only with FOR UPDATE (not with
-- FOR NO KEY UPDATE), and it is the join's FOR KEY SHARE that has to be excluded.
-- These interleavings (leave vs finish, join vs leave) CANNOT be exercised by the
-- SQL test harness, where each call commits on its own. They rest on this argument
-- and on the Code Reviewer checking both function bodies.
--
-- ACCEPTED SMALL RACES
--   * A shared list the leaver creates in the same instant (after the lists lock
--     statement took its snapshot) may stay owned by the leaver in a household they
--     have left. Their client is mid-leave; negligible.
--   * create_invite from another member blocked behind a deleting leave surfaces a
--     raw foreign-key error instead of a friendly one. Negligible.
--   * The leaver's unredeemed, unexpired invite codes stay valid for up to 24 hours
--     (any member can invite; agreed on #90).
--
-- Applying: orchestrator only, after pre-flight and a rolled-back dry run, and only
-- with Ant's go (security change that deletes data, docs/environment.md).
-- Additive for the live app: an old client has no Leave button.

-- ---------------------------------------------------------------------------
-- 1. leave_household
-- ---------------------------------------------------------------------------

create or replace function public.leave_household(p_copy_lists boolean, p_allow_delete boolean)
returns table (outcome text, copied_lists integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_household uuid;
  v_member_household uuid;
  v_others integer;
  v_successor uuid;
  v_copied integer := 0;
  v_src record;
  v_new_list uuid;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  if p_copy_lists is null or p_allow_delete is null then
    raise exception 'invalid_leave_request';
  end if;

  select hm.household_id
  into v_household
  from public.household_members hm
  where hm.user_id = v_caller;

  if v_household is null then
    raise exception 'not_in_household';
  end if;

  -- Locks, in the order set out in the header: items, lists, household.
  perform 1
  from public.list_items li
  where li.list_id in (
    select l.id from public.lists l where l.household_id = v_household
  )
  order by li.id
  for update of li;

  perform 1
  from public.lists l
  where l.household_id = v_household
  order by l.id
  for update of l;

  perform 1
  from public.households h
  where h.id = v_household
  for update of h;

  -- Re-read membership in a new statement (READ COMMITTED sees what committed while
  -- we waited): a concurrent leave by the same user, or the household's deletion,
  -- shows up here. If the user somehow moved to another household in the gap, the
  -- locks above are on the wrong one, so treat that as not_in_household too.
  select hm.household_id
  into v_member_household
  from public.household_members hm
  where hm.user_id = v_caller;

  if v_member_household is distinct from v_household then
    raise exception 'not_in_household';
  end if;

  select count(*)
  into v_others
  from public.household_members hm
  where hm.household_id = v_household
    and hm.user_id <> v_caller;

  if v_others = 0 and not p_allow_delete then
    raise exception 'household_would_be_deleted';
  end if;

  -- Optional copy. Live shared lists only, oldest activity first. The insert
  -- triggers run as usual (they force server columns, clear recorded_at and tidy
  -- names). The unique live-name index is per list, so a fresh list cannot collide.
  if p_copy_lists then
    for v_src in
      select l.id, l.name, l.location_id, l.last_activity_at
      from public.lists l
      where l.household_id = v_household
        and l.deleted_at is null
      order by l.last_activity_at, l.id
    loop
      insert into public.lists (owner_id, household_id, name, location_id)
      values (v_caller, null, v_src.name, v_src.location_id)
      returning id into v_new_list;

      insert into public.list_items (list_id, name, position, quantity)
      select v_new_list, li.name, li.position, li.quantity
      from public.list_items li
      where li.list_id = v_src.id
        and li.deleted_at is null;

      -- The insert trigger forced last_activity_at to now() and the item inserts
      -- bumped it again; put the source's value back so the copies keep their
      -- order on the Lists screen. (Updating last_activity_at alone fires no
      -- activity trigger.)
      update public.lists l
      set last_activity_at = v_src.last_activity_at
      where l.id = v_new_list;

      v_copied := v_copied + 1;
    end loop;
  end if;

  if v_others = 0 then
    -- Last member: the household goes, and the cascade takes everything in it.
    delete from public.households h where h.id = v_household;

    return query select 'deleted'::text, v_copied;
    return;
  end if;

  select hm.user_id
  into v_successor
  from public.household_members hm
  where hm.household_id = v_household
    and hm.user_id <> v_caller
  order by hm.joined_at, hm.user_id
  limit 1;

  -- No deleted_at filter: soft-deleted shared lists move too, so no row is left
  -- owned by someone outside the household.
  update public.lists l
  set owner_id = v_successor
  where l.household_id = v_household
    and l.owner_id = v_caller;

  update public.shop_sessions s
  set owner_id = v_successor
  where s.household_id = v_household
    and s.owner_id = v_caller;

  delete from public.household_members hm where hm.user_id = v_caller;

  return query select 'left'::text, v_copied;
end;
$$;

revoke execute on function public.leave_household(boolean, boolean) from public, anon;
grant execute on function public.leave_household(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. redeem_invite: same signature and return type. Differences from
-- 20260810000000_household_identity.sql: the target household is resolved first,
-- locked FOR KEY SHARE (see LOCK ORDER above), and the claim also requires the
-- invite to belong to that household. The already_in_household check stays before
-- the lock and the code is still matched on upper(trim(invite_code)).
-- Lock order here: households row, then the invite row.
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
  claimed_household uuid;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.household_members where user_id = caller) then
    raise exception 'already_in_household';
  end if;

  select i.household_id
  into target_household
  from public.household_invites i
  where i.code = upper(trim(invite_code))
    and i.redeemed_at is null
    and i.expires_at > now();

  if target_household is null then
    raise exception 'invalid_or_expired_code';
  end if;

  -- Conflicts with leave_household's FOR UPDATE: waits for a leave in progress, and
  -- finds no row if that leave deleted the household.
  perform 1
  from public.households h
  where h.id = target_household
  for key share of h;

  if not found then
    raise exception 'invalid_or_expired_code';
  end if;

  -- Claiming the invite is still one statement that validates and claims, so two
  -- people cannot redeem the same single-use code concurrently.
  update public.household_invites i
  set redeemed_at = now(),
      redeemed_by = caller
  where i.code = upper(trim(invite_code))
    and i.redeemed_at is null
    and i.expires_at > now()
    and i.household_id = target_household
  returning i.household_id into claimed_household;

  if claimed_household is null then
    raise exception 'invalid_or_expired_code';
  end if;

  insert into public.household_members (user_id, household_id)
  values (caller, claimed_household);

  return claimed_household;
end;
$$;

revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
