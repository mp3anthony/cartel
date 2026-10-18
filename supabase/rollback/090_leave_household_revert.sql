-- Issue #90, Slice 1 revert. DRAFTED, NEVER APPLIED, and kept outside
-- supabase/migrations on purpose (the CLI ignores this folder). Paste it into the
-- Supabase SQL editor (or send it through the MCP) only if
-- 20261018000000_leave_household.sql must be undone.
--
-- It drops public.leave_household(boolean, boolean) and puts public.redeem_invite(text)
-- back to its original body from 20260810000000_household_identity.sql (the body below
-- is a verbatim copy; keep the two in step if that ever changes). EXECUTE on
-- redeem_invite stays revoked from public and anon and granted to authenticated.
-- That is the live state: migration 20260810000001 already revoked it from public and
-- anon and granted it to authenticated, so the revert leaves the grants alone.
--
-- ORDER: take the app's Leave household button out first (revert the Slice 2 app
-- release), otherwise the button calls a function that no longer exists.
--
-- WHAT IT CANNOT UNDO
--   * Households a user left stay left, and households deleted by a last-member
--     leave stay deleted (no backup exists, by design).
--   * Lists and shop_sessions whose owner_id moved to a remaining member stay with
--     that member. Harmless: household_id never changed, so every member still sees
--     and edits them.
--   * Personal copies made by "copy my lists" stay as ordinary personal lists.
--
-- DRY RUN: uncomment the cartel.dry_run line below; the run then ends with the
-- error "DRY RUN OK, rolled back" instead of committing.
-- ASCII only (clipboard mangling lesson in docs/lessons.md).

begin;

-- set local cartel.dry_run = 'on';

drop function if exists public.leave_household(boolean, boolean);

create or replace function public.redeem_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_household uuid;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.household_members where user_id = caller) then
    raise exception 'already_in_household';
  end if;

  -- Claiming the invite is the same statement that validates it. Splitting the
  -- check from the update would let two people redeem the same single-use code
  -- concurrently, both passing the check before either wrote.
  update public.household_invites
  set redeemed_at = now(),
      redeemed_by = caller
  where code = upper(trim(invite_code))
    and redeemed_at is null
    and expires_at > now()
  returning household_id into target_household;

  if target_household is null then
    raise exception 'invalid_or_expired_code';
  end if;

  insert into public.household_members (user_id, household_id)
  values (caller, target_household);

  return target_household;
end;
$$;

revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'leave_household'
  ) then
    raise exception 'FAIL: leave_household still exists';
  end if;

  if pg_get_functiondef('public.redeem_invite(text)'::regprocedure) ilike '%key share%' then
    raise exception 'FAIL: redeem_invite still has the lock';
  end if;

  if current_setting('cartel.dry_run', true) = 'on' then
    raise exception 'DRY RUN OK, rolled back: revert would succeed';
  end if;
end $$;

commit;
