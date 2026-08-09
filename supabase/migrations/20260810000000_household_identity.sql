-- Slice 1 — Household Identity & Pairing.
--
-- Access shape: clients READ through RLS and WRITE only through the security-definer
-- functions at the bottom. There are deliberately no insert/update/delete policies.
-- Every write here has an invariant attached to it (you may only be in one household;
-- a code may only be redeemed once) and invariants enforced in client code are
-- invariants that hold until the first bug. Routing writes through functions makes
-- them atomic and checkable in one place.
--
-- Anonymous users carry the `authenticated` role in Supabase. A policy granted to
-- `authenticated` would therefore be granted to everyone on the internet, so no
-- policy below tests for being signed in — they all test for membership.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

-- user_id is the primary key, not a component of a composite one. That IS the
-- "one household per user" decision: it is structurally impossible to hold two
-- memberships, rather than merely discouraged.
create table public.household_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  joined_at timestamptz not null default now()
);

create index household_members_household_id_idx
  on public.household_members (household_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null
);

create index household_invites_household_id_idx
  on public.household_invites (household_id);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

-- Resolving the caller's household by querying household_members from inside a
-- policy ON household_members would recurse forever. This reads it once, outside
-- RLS, which is the standard way out of that trap.
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id
  from public.household_members
  where user_id = (select auth.uid());
$$;

create policy households_select_own on public.households
  for select to authenticated
  using (id = public.current_household_id());

create policy household_members_select_own on public.household_members
  for select to authenticated
  using (household_id = public.current_household_id());

-- Invites are readable only by people already inside the household. Someone
-- redeeming a code is by definition not yet a member, so redemption cannot be a
-- client-side select — it goes through redeem_invite() below. Making invites
-- readable by code instead would let anyone enumerate them.
create policy household_invites_select_own on public.household_invites
  for select to authenticated
  using (household_id = public.current_household_id());

-- Ambiguous glyphs (I, L, O, 0, 1) are excluded: these codes get read aloud and
-- retyped, and "was that a zero or an oh" is the failure this avoids.
create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  new_household_id uuid;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.household_members where user_id = caller) then
    raise exception 'already_in_household';
  end if;

  insert into public.households (name)
  values (household_name)
  returning id into new_household_id;

  insert into public.household_members (user_id, household_id)
  values (caller, new_household_id);

  return new_household_id;
end;
$$;

create or replace function public.create_invite()
returns public.household_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_household uuid;
  invite public.household_invites;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select household_id into caller_household
  from public.household_members
  where user_id = caller;

  if caller_household is null then
    raise exception 'not_in_household';
  end if;

  -- Six characters from a 31-letter alphabet collide rarely, but "rarely" is not
  -- "never" and the column is unique. Retry rather than surface a random failure.
  for attempt in 1..10 loop
    begin
      insert into public.household_invites (household_id, code, created_by, expires_at)
      values (
        caller_household,
        public.generate_invite_code(),
        caller,
        now() + interval '24 hours'
      )
      returning * into invite;

      return invite;
    exception when unique_violation then
      null;
    end;
  end loop;

  raise exception 'could_not_generate_code';
end;
$$;

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

revoke execute on function public.current_household_id() from public, anon, authenticated;
revoke execute on function public.generate_invite_code() from public, anon, authenticated;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
