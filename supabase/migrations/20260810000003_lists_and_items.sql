-- Slice 2 — Lists & Items.
--
-- Access shape: writes go DIRECT TO TABLE under RLS `with check` here, deliberately
-- unlike Slice 1's write-through-RPC split. That split exists for invariants RLS
-- cannot express atomically, and this slice has none — "you may only write a list you
-- can see" and "you may only create a household list in *your* household" are both
-- plain check expressions. Promotion is the one exception: it has real conditions
-- (owner only, own household only, caller must be a member), so it keeps its RPC.
--
-- `deleted_at` is never referenced in any policy, and must not be. Removal is a soft
-- delete, i.e. an UPDATE. Realtime authorises each event against the subscriber's
-- SELECT policy evaluated on the *new* row, so a policy saying `deleted_at is null`
-- would filter out the very UPDATE that performs the deletion — other household
-- members would never see the removal, and soft delete would have bought nothing.
-- Filtering `deleted_at` is the client query's job. The accepted consequence is that
-- soft-deleted rows stay readable by household members; "deleted" here means hidden
-- by the client, which is a weaker claim than the word suggests.
--
-- Every membership test uses `=`, never `is not distinct from`. For a user with no
-- household `current_household_id()` returns null, so `household_id = null` is null →
-- false and personal lists match on ownership alone. Written the other way,
-- `null is not distinct from null` is *true* and every householdless user would see
-- every other householdless user's lists. `supabase/tests/rls_lists.sql` asserts this.
--
-- The column-level UPDATE grants below are the enforcement mechanism for "no
-- demotion, no reassignment". A `with check` expression cannot see the OLD row, so it
-- cannot express "household_id may not change". Withholding the column privilege can:
-- a direct client update touching `lists.household_id`, `lists.owner_id`,
-- `list_items.list_id` or `list_items.id` fails with "permission denied for column",
-- while promote_to_household() is unaffected because SECURITY DEFINER runs it as the
-- function owner. Demotion has no function and deliberately gets none — the want
-- behind it is copy, which is Slice 9's job.

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- household_id is the *only* record of scope; null means personal. There is no
  -- `type` column, which would be the same fact stored twice with two of its four
  -- states invalid.
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index lists_owner_id_idx on public.lists (owner_id);
create index lists_household_id_idx on public.lists (household_id);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  -- Fractional base-62 key, sorted `order by position, id`. Declared collate "C"
  -- because base-62 sorts correctly only under byte order; this database is
  -- en_US.UTF-8 under ICU, where 'a1' < 'A1' is true and byte order says the
  -- opposite. The key generator and the column must agree on collation or neither
  -- is correct. Left to the default the ordering goes silently wrong, and only once
  -- mixed-case keys exist — around the sixty-third insert into one list.
  position text collate "C" not null,
  -- Replaces the `checked` boolean: strictly more information for one column.
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index list_items_list_id_position_idx
  on public.list_items (list_id, position, id);

alter table public.lists enable row level security;
alter table public.list_items enable row level security;

create policy lists_select_visible on public.lists
  for select to authenticated
  using (owner_id = (select auth.uid()) or household_id = public.current_household_id());

create policy lists_insert_own on public.lists
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (household_id is null or household_id = public.current_household_id())
  );

create policy lists_update_visible on public.lists
  for update to authenticated
  using (owner_id = (select auth.uid()) or household_id = public.current_household_id())
  with check (owner_id = (select auth.uid()) or household_id = public.current_household_id());

-- No DELETE policy on either table. Removal is a soft delete, so hard delete must be
-- *unavailable*, not merely unused: Supabase does not apply RLS to DELETE statements,
-- so a hard delete would broadcast to every subscriber of the table regardless of
-- household.

-- Item visibility delegates to the parent list's, rather than restating it. RLS on
-- public.lists applies inside this subquery because policy expressions run as the
-- querying user, so a row whose list is invisible has no visible items.
create policy list_items_select_visible on public.list_items
  for select to authenticated
  using (exists (select 1 from public.lists l where l.id = public.list_items.list_id));

create policy list_items_insert_visible on public.list_items
  for insert to authenticated
  with check (exists (select 1 from public.lists l where l.id = public.list_items.list_id));

create policy list_items_update_visible on public.list_items
  for update to authenticated
  using (exists (select 1 from public.lists l where l.id = public.list_items.list_id))
  with check (exists (select 1 from public.lists l where l.id = public.list_items.list_id));

-- Promotion is one-way and confirmed in the UI before it runs. It publishes existing
-- item text to the household, which is why it is a deliberate act with conditions
-- rather than an editable column.
create or replace function public.promote_to_household(target_list_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_household uuid;
  list_owner uuid;
  current_scope uuid;
begin
  if caller is null then raise exception 'not_authenticated'; end if;

  select household_id into caller_household
  from public.household_members
  where user_id = caller;

  if caller_household is null then raise exception 'not_in_household'; end if;

  select owner_id, household_id into list_owner, current_scope
  from public.lists
  where id = target_list_id and deleted_at is null;

  if list_owner is null then raise exception 'list_not_found'; end if;
  if list_owner <> caller then raise exception 'not_list_owner'; end if;
  if current_scope is not null then raise exception 'already_shared'; end if;

  update public.lists set household_id = caller_household where id = target_list_id;
end;
$$;

-- Supabase's default privileges grant ALL on new public-schema tables to anon and
-- authenticated, so without the blanket revoke the grants below would be additions to
-- an already-open door rather than the whole of the door. Same reasoning as migration
-- 20260810000001 applied to tables instead of functions.
revoke all on table public.lists from anon, authenticated;
revoke all on table public.list_items from anon, authenticated;
revoke execute on function public.promote_to_household(uuid) from public, anon;

grant select, insert on table public.lists to authenticated;
grant update (name, deleted_at) on table public.lists to authenticated;

grant select, insert on table public.list_items to authenticated;
grant update (name, position, checked_at, deleted_at) on table public.list_items to authenticated;

grant execute on function public.promote_to_household(uuid) to authenticated;
