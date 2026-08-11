-- Slice 8 — Location Correction Voting.
--
-- `public.location_item_votes` is global in the same sense `public.location_items`
-- (migration 20260811000000) and `public.location_checkoffs` (migration
-- 20260811000001) are — no `household_id`, no `list_id` — but it is NOT
-- attribution-free the way those two tables are. `voter_id` is a real, durable
-- per-vote identity column, because this slice has a concrete functional need
-- those two never had: telling a proposer apart from an *independent* second
-- confirmer requires knowing, across two separate calls, whether the same person
-- made both. The issue's acceptance test ("a second, independent user") cannot be
-- checked without storing *some* identity per vote.
--
-- That identity is stored but never surfaced, mirroring `locations.created_by`
-- (migration 20260810000005) rather than `location_items`' complete absence of a
-- creator column. `location_items`' own header named store-and-withhold as the
-- weaker of the two claims and chose the stronger one because it had no
-- functional need for identity at all. This table does have that need, so it
-- makes the weaker-but-still-real claim `locations` already established works:
-- withheld from every SELECT grant below, never reachable through this table's
-- own RLS policy, read only from inside this migration's own `security definer`
-- function body. Nothing a client can query ever learns who proposed or
-- confirmed a correction.
--
-- ONE table serves both "propose" and "confirm" — there is no separate
-- corrections table. A "proposed correction" is not a first-class row; it is the
-- distinct-values grouping of `(location_id, item_name, proposed_section)` that
-- emerges from whichever vote rows currently exist. The first vote for a tuple
-- that doesn't exist yet *is* the proposal; a second, independent vote for the
-- same tuple *is* the confirmation. This follows 03-SPEC.md § 1's own sketch
-- ("proposed correction → supporting user ids, until quorum") literally: one row
-- per supporting user, not one row per proposal plus a separate collection of
-- supporters.
--
-- A single item can therefore have more than one *different* proposed correction
-- pending at once — two users independently deciding the same item moved, to two
-- different new sections, without knowing about each other. Both are tracked as
-- genuinely separate corrections, each needing its own independent quorum of 2.
-- Nothing in this schema or the function below privileges one over the other or
-- limits an item to one pending correction at a time.
--
-- `unique (location_id, item_name, proposed_section, voter_id)` is this slice's
-- entire independence story, and it is a stronger guarantee than a runtime check
-- could give: because a voter may appear at most once per tuple, any tuple that
-- ever reaches two rows is *structurally* guaranteed to hold two distinct voters.
-- There is no separate "is the confirmer different from the proposer" check
-- anywhere in the function below, because the constraint already makes it
-- impossible to construct a same-voter pair. A user's second attempt to vote for
-- their own proposal (a second device, a second tab under the same anonymous
-- identity, or literally re-tapping) collides with this constraint and is
-- translated to a clear `already_voted` exception rather than silently
-- succeeding — unlike `location_items`' own `tagItemLocation`, whose 23505
-- leniency is *wrong* for this table specifically: a duplicate vote from the same
-- user is not equivalent to a second independent vote reaching quorum, so
-- treating it as silent success would mislead the user into believing the
-- correction progressed when it did not.
--
-- Whoever's tag actually won `location_items`' own first-tag-wins race is
-- unknowable — that table has no creator column at all — so there is no attempt
-- anywhere in this slice to stop "the original tagger" from proposing a
-- correction to their own tag. That is not a gap: it was never knowable, so it
-- was never a real constraint to enforce.
--
-- `foreign key (location_id, item_name) references public.location_items
-- (location_id, name) on delete cascade` — a single composite FK, not a separate
-- plain FK to `locations(id)`. `location_items`' own `unique (location_id, name)`
-- constraint (migration 20260811000000) is a valid FK target, and referencing it
-- transitively guarantees `location_id` is also a real location
-- (location_items.location_id already FKs to `locations(id)`), so a second,
-- separate FK would only repeat a guarantee this one already gives. This also
-- means "you may only vote on an item that is already tagged" is enforced at the
-- schema level, not only inside the function below — cheap to have both. `on
-- delete cascade` matches `location_items.location_id`'s own cascade reasoning: a
-- vote for a tag that no longer exists is meaningless, not orphaned data worth
-- preserving.
--
-- `item_name` repeats `location_items.name`'s exact normalization contract
-- (`length between 1 and 120`, `= lower(btrim(name))`) for the same reason that
-- column gives: it is a lookup/join key against `location_items.name`, not
-- display text. `proposed_section` mirrors `location_items.section`'s own check
-- (`length(trim(...)) between 1 and 60`) for the same reason that column gives:
-- it is display-only text a shopper will eventually read as-is.
--
-- Proposing a `proposed_section` that exactly matches (after trim, case
-- preserved) the item's *current* `location_items.section` is rejected outright
-- (`correction_matches_current`) rather than accepted as a no-op vote — there is
-- nothing to correct. The comparison is trim-only, not case-folded: a proposal
-- that only fixes capitalization or spacing ("aisle 4" vs "Aisle 4") is a
-- legitimate correction here, because unlike `name`, `section` has never had a
-- case-folding contract anywhere in this schema.
--
-- No RLS INSERT/UPDATE/DELETE policy or grant on this table at all, deliberately
-- stronger than `location_items`' "not built yet" stance. Every write happens
-- exclusively inside `vote_location_item_correction`'s `security definer` body
-- below, which runs with this migration's own privileges and is not subject to
-- RLS or table grants. A policy permitting a direct client INSERT would let a
-- client accumulate two independent voters' rows without ever running the
-- quorum-check-and-apply step that only this function performs — nothing else in
-- this schema watches this table for a quorum event, so a bypassed write path
-- would leave a genuinely-reached quorum permanently unapplied. This is the "real
-- atomicity/authorization invariant RLS can't express" bar every prior
-- migration's header has cited (most recently 20260811000000's and
-- 20260811000001's) — the first migration in this schema where that bar is
-- actually met rather than ruled out.
--
-- For the same reason, `public.location_items` itself gets NO new UPDATE policy
-- or grant in this migration, contradicting that table's own header comment
-- ("Slice 8 will add an UPDATE policy for its correction mechanism"). That
-- comment predated this design: an UPDATE policy reachable by any authenticated
-- client would let anyone rewrite `section` directly, completely bypassing
-- quorum. Instead, `location_items.section` is writable in exactly one place —
-- inside the function below, which needs no grant to write a table the same role
-- already owns, the same way `create_household`/`redeem_invite` (migration
-- 20260810000000) write `households`/`household_members` with no grant beyond
-- their own EXECUTE.
--
-- No new row in `supabase_realtime`'s publication membership — 0-for-3 so far
-- (`locations`, `location_items`, `location_checkoffs` all opted out for the same
-- reason) and this slice's acceptance test reads the same way: "User B ...
-- confirms ... the tag now reflects the new location for all users" is satisfied
-- by a fresh `ShoppingScreen` load, exactly like Slice 6's own acceptance test
-- was, not by a live push mid-shop.
--
-- The function's parameters are prefixed `p_location_id`/`p_item_name`/
-- `p_proposed_section`, matching `nearby_locations`' own prefix convention
-- (migration 20260810000005) and for the identical reason that migration's header
-- gives: the function body compares these against `location_items`' own
-- `location_id`/`name` columns in bare, unqualified WHERE clauses, and an
-- identically-named parameter would make that comparison ambiguously
-- self-referential (or, worse, silently always-true) rather than raise an error —
-- prefixing avoids the trap outright rather than relying on qualification
-- discipline everywhere.
--
-- No extension operator is used anywhere below (plain uuid/text comparison and
-- count(*) only), so the `set search_path = ''` trap `nearby_locations()` hit
-- (migration 20260810000005's header — bare extension-provided operators don't
-- resolve under a pinned empty search_path even when function calls do) does not
-- apply here. Noted explicitly rather than silently assumed, per that migration's
-- own warning.
--
-- Concurrency note on the apply step: two independent, truly concurrent
-- confirmations landing on the same tuple (three or more distinct voters
-- arriving within the same race window) can each independently observe "quorum
-- reached" and both run the UPDATE + DELETE. This is safe, not merely tolerated:
-- the UPDATE sets `section` to the same value both times (idempotent, and
-- Postgres row-level locking serializes the two UPDATEs rather than corrupting
-- either), and a second DELETE of an already-deleted tuple deletes zero rows
-- without error. The one accepted, vanishingly rare edge case: a third voter's
-- own INSERT can land in the narrow window between the winning pair's apply and
-- its own quorum count, leaving that one vote row orphaned at count 1, pointing
-- at a `proposed_section` that (by the time anyone reads it) already equals the
-- new current value. It is inert, not incorrect — nobody can vote it to quorum in
-- a way that changes anything, any *new* proposal for that item is still checked
-- against the true current value, and the client-side
-- `pendingCorrectionsForItemName` (mobile/src/lib/locationItemVotes.ts) filters
-- out any group whose proposed value already equals the current one, so this
-- orphan is never even rendered. Not otherwise engineered around: an advisory
-- lock or `serializable` isolation to close a three-way race on a household
-- grocery app is disproportionate to the cost of one harmless, invisible leftover
-- row.

create table public.location_item_votes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  item_name text not null
    check (length(item_name) between 1 and 120)
    check (item_name = lower(btrim(item_name))),
  proposed_section text not null
    check (length(trim(proposed_section)) between 1 and 60),
  voter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (location_id, item_name, proposed_section, voter_id),
  foreign key (location_id, item_name)
    references public.location_items (location_id, name)
    on delete cascade
);

-- No separate index on (location_id, item_name) or (location_id, item_name,
-- proposed_section): the unique constraint above already creates a composite
-- index with those as its leading columns, serving both this function's
-- per-tuple count query and the client's per-location read
-- (`loadLocationItemVotes`) exactly as well as a dedicated index would, for free
-- — same reasoning as `location_items`' own single composite-index-does-double-
-- duty note (migration 20260811000000).

alter table public.location_item_votes enable row level security;

create policy location_item_votes_select_all on public.location_item_votes
  for select to authenticated
  using (true);

-- No insert/update/delete policy — see header: every write happens inside
-- vote_location_item_correction()'s security-definer body, never through a
-- client-facing policy.

revoke all on table public.location_item_votes from anon, authenticated;

grant select (id, location_id, item_name, proposed_section, created_at)
  on table public.location_item_votes to authenticated;

-- The one write path for this table and the one write path for
-- `location_items.section`, both at once. See header for why this needs to be
-- `security definer` rather than a plain RLS-gated INSERT: the atomic "add a
-- vote, and if that just reached quorum, apply the correction and clear this
-- item's votes" invariant spans two tables and cannot be expressed as a per-row
-- `with check`.
create or replace function public.vote_location_item_correction(
  p_location_id uuid,
  p_item_name text,
  p_proposed_section text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_item_name text := lower(btrim(p_item_name));
  v_proposed_section text := btrim(p_proposed_section);
  v_current_section text;
  v_vote_count int;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select section into v_current_section
  from public.location_items
  where location_id = p_location_id
    and name = v_item_name;

  if v_current_section is null then
    raise exception 'item_not_tagged';
  end if;

  if v_current_section = v_proposed_section then
    raise exception 'correction_matches_current';
  end if;

  -- The insert attempt IS the independence check — see header. Splitting a
  -- pre-check from the write would let two truly concurrent identical requests
  -- both pass the check before either wrote, the same race `redeem_invite`
  -- (migration 20260810000000) already avoids by making its claiming UPDATE the
  -- validation.
  begin
    insert into public.location_item_votes
      (location_id, item_name, proposed_section, voter_id)
    values
      (p_location_id, v_item_name, v_proposed_section, caller);
  exception when unique_violation then
    raise exception 'already_voted';
  end;

  select count(*) into v_vote_count
  from public.location_item_votes
  where location_id = p_location_id
    and item_name = v_item_name
    and proposed_section = v_proposed_section;

  if v_vote_count >= 2 then
    update public.location_items
    set section = v_proposed_section
    where location_id = p_location_id
      and name = v_item_name;

    -- Every pending vote for this item, not only this tuple's own two — see
    -- header's "applying one correction moots the others" decision. A sibling
    -- proposal that was still short of quorum now points at a section that is
    -- no longer current; keeping it around would be schema nobody reads, the
    -- same bar `location_items`' own header cites from Slice 5's
    -- `shop_sessions` reasoning.
    delete from public.location_item_votes
    where location_id = p_location_id
      and item_name = v_item_name;
  end if;
end;
$$;

revoke execute on function public.vote_location_item_correction(uuid, text, text)
  from public, anon;
grant execute on function public.vote_location_item_correction(uuid, text, text)
  to authenticated;
