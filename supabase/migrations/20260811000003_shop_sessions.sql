-- Slice 9 — Shop History & List Templates.
--
-- `public.shop_sessions` is the household-attributed shop-history table
-- 03-SPEC.md § 1 originally sketched and Slice 7 deliberately split off into
-- the anonymous, global `location_checkoffs` instead (migration
-- 20260811000001's header explains why) — this is that table, built now that
-- a slice actually needs it. Its access shape mirrors `public.lists` exactly
-- (migration 20260810000003): `owner_id` defaults to auth.uid(), `household_id`
-- is nullable (null means personal, the only record of scope, same as
-- `lists.household_id`), and the SELECT/INSERT policies below are the same
-- `owner_id = (select auth.uid()) or household_id = current_household_id()`
-- shape `lists_select_visible`/`lists_insert_own` already established.
--
-- This is a genuinely separate table from `location_checkoffs`, not a
-- reinterpretation of it, and both get written on "Finish shopping" going
-- forward (ShoppingScreen.tsx) — 03-SPEC.md § 0's hard invariant that
-- location-global and household-private data must never share an
-- access-control path means one insert can never serve both consumers.
-- `location_checkoffs` stays exactly as Slice 7 left it (anonymous,
-- unattributed, feeds route learning); this table is new, household-visible,
-- and feeds history/copy.
--
-- `location_id not null ... on delete cascade`, matching
-- `location_checkoffs.location_id`'s own cascade (not `lists.location_id`'s
-- set-null): a shop_session is a historical record of a specific location
-- visit — the same directional relationship a checkoff row has to its
-- location — not the live "which location is this list currently pointed at"
-- relationship `lists.location_id` records.
--
-- `list_id`, unlike `location_id`, is nullable with `on delete set null` —
-- mirrors `lists.location_id`'s own set-null (migration 20260810000006): a
-- shop_session is a durable historical record that must outlive the list it
-- was made from being renamed, altered, or removed later. Losing the
-- back-reference is acceptable; losing the history itself is not.
--
-- `item_names`/`checked_item_names` are deliberately NOT normalized (unlike
-- `location_checkoffs`' array): store the original item text exactly as
-- typed. That table's array is a global cross-household lookup/join key
-- against `location_items.name`; this one is never joined against anything —
-- it is read back either for display (History) or fed straight into
-- `addItems()` (lists.ts) to recreate list rows a person will see, where
-- silently lowercasing "Milk" into "milk" would be a visible regression.
--
-- `cardinality(...) > 0` on both arrays mirrors `location_checkoffs`' own
-- non-empty check, and matches this table's one real write path
-- (`ShoppingScreen.finishShopping`, gated on the list already having at
-- least one item, and on "Finish shopping" itself being disabled until at
-- least one item is checked) — enforced at the schema too, not only trusted
-- to the client's disabled button.
--
-- No UPDATE or DELETE policy or grant at all, matching `location_checkoffs`'
-- append-only stance exactly: a shop_session is an immutable record of one
-- completed shop.
--
-- The INSERT policy adds one clause beyond `lists_insert_own`'s own shape:
-- `list_id is null or exists (select 1 from public.lists l where l.id =
-- list_id)`, verbatim the same pattern `list_items_insert_visible` (migration
-- 20260810000003) already uses to gate a child row against its parent's own
-- visibility — a client may reference a list_id only if `public.lists`' own
-- SELECT policy (evaluated as the same querying user, since policy
-- expressions run as the caller) would let them see that row at all.
--
-- Added to the `supabase_realtime` publication in this same migration:
-- `shop_sessions` needs live sync from the moment it exists (03-SPEC.md § 0:
-- any slice touching shared household data must use a live subscription).
--
-- `public.current_household_id()` is already granted to `authenticated`
-- (migration 20260810000002) — no new grant needed for it here.

create table public.shop_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  list_id uuid references public.lists (id) on delete set null,
  item_names text[] not null check (cardinality(item_names) > 0),
  checked_item_names text[] not null check (cardinality(checked_item_names) > 0),
  completed_at timestamptz not null default now()
);

create index shop_sessions_owner_id_idx on public.shop_sessions (owner_id);
create index shop_sessions_household_id_idx on public.shop_sessions (household_id);

alter table public.shop_sessions enable row level security;

create policy shop_sessions_select_visible on public.shop_sessions
  for select to authenticated
  using (owner_id = (select auth.uid()) or household_id = public.current_household_id());

create policy shop_sessions_insert_own on public.shop_sessions
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (household_id is null or household_id = public.current_household_id())
    and (list_id is null or exists (select 1 from public.lists l where l.id = list_id))
  );

-- No UPDATE or DELETE policy — see header.

revoke all on table public.shop_sessions from anon, authenticated;

grant select, insert on table public.shop_sessions to authenticated;

alter publication supabase_realtime add table public.shop_sessions;
