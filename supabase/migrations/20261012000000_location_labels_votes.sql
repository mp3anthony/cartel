-- Issue #106 -- Slice 4b (Migration C2) and issue #155. Item location labels are
-- moved onto the standard set, pending corrections are tidied to match, and the
-- vote function learns the case-only rule.
--
-- THIS IS A PRODUCTION MIGRATION THAT DELETES USER DATA (labels that map to nothing
-- are cleared, and the pending corrections on them go with them). It is applied via
-- the Supabase MCP by the orchestrator (after a clean dry run and Ant's explicit
-- go), or by Ant in the Supabase SQL editor (project chacavfoewyiwrfgvxtj), never by
-- CI. Runbook, in order:
--   PRE-1..PRE-4 (supabase/checks/106_slice4b_preflight_and_postflight.sql), then a
--   DRY RUN of this file (uncomment the cartel.dry_run line right after `begin`;
--   the run must end with the error "DRY RUN OK, rolled back" and a JSON summary
--   that matches PRE-1), then the REAL RUN (the same file with that line left
--   commented), then POST-1 and POST-2, then the iPhone checklist. Only apply once
--   the Live footer shows 0.0.55 or higher.
-- The file is ASCII only on purpose: raw non-ASCII text is mangled by some
-- clipboard routes (docs/lessons.md). It needs Migration A (20261008000000),
-- slice 3 (20261010000000) and Migration C1 (20261011000000) applied first, and
-- never redefines fold_item_name or capitalise_first.
-- Undo: supabase/rollback/106_c2_revert.sql (drafted, never applied).
--
-- WHAT THIS DOES (all in one transaction; any failure rolls everything back)
--   1  Locks location_items (EXCLUSIVE: it conflicts with the vote function's
--      SELECT ... FOR UPDATE, which SHARE ROW EXCLUSIVE would not) and
--      location_item_votes (SHARE ROW EXCLUSIVE).
--   2  Creates the backup and log tables in the closed schema migration_106 (no
--      access for API roles; they hold voter_id; keep them 30 days, then drop the
--      whole schema) and the helper functions c2_standard_labels, c2_is_standard,
--      c2_target_label, c2_transform, c2_check and c2_revert_data. The data
--      transforms live in functions, not inline, so that
--      supabase/tests/location_labels_transform.sql can run exactly this code on
--      fixture rows inside a rolled-back transaction (there is no disposable copy
--      of production, docs/lessons.md); the revert's data step is a function for the
--      same reason. They sit in the closed schema and die with it.
--   3  Stores the live definition of vote_location_item_correction, so the revert
--      restores whatever was running just before this migration.
--   4  Runs c2_transform over every store (below).
--   5  Redefines vote_location_item_correction (below).
--   6  Post-assertions (c2_check over every store, function and privilege checks),
--      then, on a dry run, a deliberate error carrying a JSON summary.
--
-- THE LABEL RULES (#155; vocabulary in docs/context/locations.md). The standard set
-- is Fruit & Veg, Butchery, Seafood, Deli, Bakery, Dairy, Chilled, Frozen, Health &
-- Beauty, Pharmacy, Beer & Wine and "Aisle N" (N 1..999, no leading zero). A label
-- maps to a target by, in order:
--   key   k0 = fold_item_name(label); k1 = k0 without a leading "the ", without a
--         trailing " section|department|dept|area|counter|aisle|isle|bay", with
--         " and " turned into " & " (the same key the PRE-0 count used);
--   1     k1 equals the fold of a standard label: that label ("dairy section" to
--         Dairy, "fruit and veg" to Fruit & Veg);
--   2     k0 reads as an aisle number ("aisle 4", "isle 04", "aisle no. 4",
--         "aisle #4"): "Aisle 4". "Aisle 4a", "Aisle 4-5" and a bare "Aisle" do not;
--   3     k1 is a key of migration_106.c2_label_map, the list Ant approved after the
--         read-only count (PRE-0): a handful of synonyms and bare numbers;
--   else  cleared: the tag row is deleted (section is NOT NULL), its pending
--         corrections go with it, and the item is re-tagged from Shopping Mode.
--         Check-offs and route learning are untouched.
-- Approved map: "15" to Aisle 15, "23" to Aisle 23, "Fruit & Vegetables" to Fruit &
-- Veg, "Meat" to Butchery. "Dali" is deliberately not in the map, so it is cleared.
--
-- PENDING CORRECTIONS (location_item_votes), per store and item, in this order:
--   a  votes on a cleared tag are deleted ('tag_cleared');
--   b  a proposal that maps to nothing is deleted ('proposal_unmapped'; Q3: else it
--      could be confirmed back into a non-standard label);
--   c  votes that become the same (store, item, proposal, voter) after mapping keep
--      the oldest by (created_at, id) ('duplicate'); this runs BEFORE the rewrite,
--      because the unique key is not deferrable;
--   d  the remaining proposals are rewritten to their target ('proposal_rewritten');
--      tags are rewritten to theirs;
--   e  a vote equal to its tag's label is deleted ('equals_current');
--   f  D6 (Ant, 2026-10-10; Q4 extends it to tuples that reach two voters only
--      through this mapping): where a proposal now has two or more distinct voters,
--      it is APPLIED (the one with most voters, then the earliest first vote, then
--      the label), logged in c2_applied, and every vote on that item is deleted
--      ('applied_d6').
--
-- NO RLS, POLICY OR GRANT CHANGE on any public table (a post-check proves the table
-- and function privileges are exactly what they were; the vote function's EXECUTE
-- is re-granted as it is now). No CHECK to the standard set is added: free text
-- stays possible until the Item location picker (#154) removes typing, so labels
-- outside the set can reappear (Q2 accepted this; a sweep follows #154).
--
-- THE VOTE FUNCTION (replaces the C1 body). New: (1) a proposal differing from the
-- current label only by case or whitespace is applied at once, with no second user,
-- and clears that item's pending votes (Q5; the accepted trade-off is that any
-- signed-in user can restyle a label's case alone, e.g. "Aisle 4" to "AISLE 4",
-- without a second voter); (2) the proposal is stored with its first letter
-- capitalised, like every label; (3) the tag row is locked FOR UPDATE, so a case-only
-- apply and a quorum apply on one item serialise (this closes most of the old
-- orphan-third-vote race); (4) every object is public.-qualified (search_path = '').
-- The comparison against the current label is exact after that capitalisation, so
-- proposing "dairy" on "Dairy" is still refused (correction_matches_current). Error
-- codes are unchanged, so no client change is needed. The function does NOT enforce
-- the standard set.
--
-- After a Postgres MAJOR upgrade re-run scripts/check-item-name-parity.mjs and the
-- fold tests (the fold is IMMUTABLE only as far as the server's Unicode tables).

begin;

-- DRY RUN: uncomment the next line to run everything and roll back at the end.
-- set local cartel.dry_run = 'on';

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 0. Guards.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.fold_item_name(text)') is null
     or to_regprocedure('public.capitalise_first(text)') is null then
    raise exception 'FAIL: public.fold_item_name(text) or public.capitalise_first(text) is missing; apply 20261008000000_item_name_fold.sql (slice 1) first';
  end if;

  if to_regclass('migration_106.c1_run') is null
     or to_regclass('migration_106.location_items_before') is null then
    raise exception 'FAIL: migration C1 is not applied (migration_106.c1_run or location_items_before is missing); apply 20261011000000_location_items_fold.sql first';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_tidy'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.location_items'::regclass
      and conname = 'location_items_name_folded'
      and convalidated
  ) then
    raise exception 'FAIL: migration C1 is not applied (trigger location_items_tidy or constraint location_items_name_folded is missing)';
  end if;

  if to_regclass('migration_106.c2_run') is not null
     or to_regclass('migration_106.location_items_before_c2') is not null then
    raise exception 'FAIL: migration C2 already applied (migration_106.c2_run or location_items_before_c2 exists)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Locks. EXCLUSIVE on the tags conflicts with ROW SHARE, which is what the vote
-- function's FOR UPDATE takes; SHARE ROW EXCLUSIVE would let it through. A
-- concurrent vote or tag write waits for the run; if one holds a lock for over 5s
-- (or a deadlock is detected) the run fails with nothing changed: run it again.
-- ---------------------------------------------------------------------------

lock table public.location_items in exclusive mode;
lock table public.location_item_votes in share row exclusive mode;

-- The table and function privileges as they are now; compared again at the end.
select set_config('cartel.c2_grants', (
  select json_agg(x.v order by x.k)::text
  from (
    select r || '|' || t || '|' || p as k,
           has_table_privilege(r, 'public.' || t, p) as v
    from unnest(array['anon', 'authenticated']) as r,
         unnest(array['location_items', 'location_item_votes', 'location_checkoffs']) as t,
         unnest(array['select', 'insert', 'update', 'delete']) as p
    union all
    select r || '|' || f,
           has_function_privilege(r, f, 'execute')
    from unnest(array['anon', 'authenticated']) as r,
         unnest(array[
           'public.vote_location_item_correction(uuid, text, text)',
           'public.item_names_are_normalized(text[])',
           'public.fold_item_name(text)',
           'public.capitalise_first(text)'
         ]) as f
  ) x
), true);

-- ---------------------------------------------------------------------------
-- 2. Backup and log tables in the closed schema (slice 3 created the schema).
-- The two *_before_c2 tables are filled by c2_transform for the stores it runs on.
-- ---------------------------------------------------------------------------

create table migration_106.c2_run (
  applied_at timestamptz not null
);
insert into migration_106.c2_run (applied_at) values (now());

create table migration_106.location_items_before_c2 as
  select * from public.location_items where false;
alter table migration_106.location_items_before_c2 add primary key (id);

create table migration_106.location_item_votes_before_c2 as
  select * from public.location_item_votes where false;
alter table migration_106.location_item_votes_before_c2 add primary key (id);

-- The approved label map, keyed on k1 (see THE LABEL RULES). Rules 1 and 2 stay in
-- code; only what Ant approved after PRE-0 is listed here.
create table migration_106.c2_label_map (
  from_key text primary key,
  to_label text not null
);
insert into migration_106.c2_label_map (from_key, to_label) values
  ('15', 'Aisle 15'),
  ('23', 'Aisle 23'),
  ('fruit & vegetables', 'Fruit & Veg'),
  ('meat', 'Butchery');

-- One row per tag whose label changes; new_section null means cleared.
create table migration_106.c2_tag_changes (
  id uuid primary key,
  location_id uuid not null,
  name text not null,
  old_section text not null,
  new_section text
);

-- One row per vote that C2 rewrote or deleted. A vote that is rewritten and then
-- deleted has two rows. new_proposed is set only for the rewrite.
create table migration_106.c2_vote_changes (
  id uuid not null,
  old_proposed text not null,
  new_proposed text,
  reason text not null
    check (reason in ('tag_cleared', 'proposal_unmapped', 'duplicate',
                      'proposal_rewritten', 'equals_current', 'applied_d6')),
  check ((new_proposed is not null) = (reason = 'proposal_rewritten'))
);

-- D6: a correction applied by C2 because it reached two voters through the mapping.
create table migration_106.c2_applied (
  location_id uuid not null,
  item_name text not null,
  old_section text not null,
  new_section text not null,
  voters integer not null,
  primary key (location_id, item_name)
);

-- The vote function as it was running just before C2 (restored by the revert).
create table migration_106.c2_prior_vote_function (
  def text not null
);

revoke all on schema migration_106 from public, anon, authenticated;
revoke all on all tables in schema migration_106 from public, anon, authenticated;
alter table migration_106.c2_run enable row level security;
alter table migration_106.location_items_before_c2 enable row level security;
alter table migration_106.location_item_votes_before_c2 enable row level security;
alter table migration_106.c2_label_map enable row level security;
alter table migration_106.c2_tag_changes enable row level security;
alter table migration_106.c2_vote_changes enable row level security;
alter table migration_106.c2_applied enable row level security;
alter table migration_106.c2_prior_vote_function enable row level security;

-- ---------------------------------------------------------------------------
-- 2b. The label helpers.
-- ---------------------------------------------------------------------------

create function migration_106.c2_standard_labels()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['Fruit & Veg', 'Butchery', 'Seafood', 'Deli', 'Bakery', 'Dairy',
               'Chilled', 'Frozen', 'Health & Beauty', 'Pharmacy', 'Beer & Wine']::text[]
$$;

-- True for a label in the standard set or "Aisle N" (N 1..999, no leading zero).
create function migration_106.c2_is_standard(p_label text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_label = any (migration_106.c2_standard_labels())
         or p_label ~ '^Aisle [1-9][0-9]{0,2}$'
$$;

-- The target of a label: a standard label, "Aisle N", or null (cleared). See THE
-- LABEL RULES in the header. Stable, not immutable: rule 3 reads c2_label_map.
create function migration_106.c2_target_label(p_label text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select s.label
     from unnest(migration_106.c2_standard_labels()) as s(label)
     where public.fold_item_name(s.label) = k.k1),
    'Aisle ' || k.aisle_n,
    (select m.to_label from migration_106.c2_label_map m where m.from_key = k.k1)
  )
  from (
    select b.k0,
           replace(
             regexp_replace(b.k0,
               '^the | (section|department|dept|area|counter|aisle|isle|bay)$', '', 'g'),
             ' and ', ' & ') as k1,
           (regexp_match(b.k0,
             '^(?:aisle|isle|ailse|asile) ?(?:no\.?|number|#)? ?0*([1-9][0-9]{0,2})$'))[1] as aisle_n
    from (select public.fold_item_name(p_label) as k0) b
  ) k
$$;

-- ---------------------------------------------------------------------------
-- 2c. c2_transform(p_scope): the destructive data steps. p_scope is the list of
-- store ids to work on; null means every store (the real run). Each step logs what
-- it does, and uses a data-modifying CTE so the log row and the change cannot
-- disagree. Called once by this migration and by the fixture test.
-- ---------------------------------------------------------------------------

create function migration_106.c2_transform(p_scope uuid[] default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Backups of the rows in scope, taken before anything changes.
  insert into migration_106.location_items_before_c2
  select * from public.location_items li
  where p_scope is null or li.location_id = any (p_scope);

  insert into migration_106.location_item_votes_before_c2
  select * from public.location_item_votes v
  where p_scope is null or v.location_id = any (p_scope);

  -- The tag plan: only tags whose label changes (new_section null = cleared).
  insert into migration_106.c2_tag_changes (id, location_id, name, old_section, new_section)
  select li.id, li.location_id, li.name, li.section,
         migration_106.c2_target_label(li.section)
  from public.location_items li
  where (p_scope is null or li.location_id = any (p_scope))
    and migration_106.c2_target_label(li.section) is distinct from li.section;

  -- a. Votes on a tag that is about to be cleared go with it.
  with d as (
    delete from public.location_item_votes v
    using migration_106.c2_tag_changes tc
    where tc.new_section is null
      and tc.location_id = v.location_id
      and tc.name = v.item_name
      and (p_scope is null or v.location_id = any (p_scope))
    returning v.id, v.proposed_section
  )
  insert into migration_106.c2_vote_changes (id, old_proposed, new_proposed, reason)
  select d.id, d.proposed_section, null, 'tag_cleared' from d;

  delete from public.location_items li
  using migration_106.c2_tag_changes tc
  where tc.id = li.id
    and tc.new_section is null
    and (p_scope is null or li.location_id = any (p_scope));

  -- b. A proposal that maps to nothing is deleted (Q3).
  with d as (
    delete from public.location_item_votes v
    where (p_scope is null or v.location_id = any (p_scope))
      and migration_106.c2_target_label(v.proposed_section) is null
    returning v.id, v.proposed_section
  )
  insert into migration_106.c2_vote_changes (id, old_proposed, new_proposed, reason)
  select d.id, d.proposed_section, null, 'proposal_unmapped' from d;

  -- c. Votes that become identical after mapping: keep the oldest. This must run
  -- before the rewrite (the unique key is not deferrable).
  with ranked as (
    select v.id,
           row_number() over (
             partition by v.location_id, v.item_name,
                          migration_106.c2_target_label(v.proposed_section), v.voter_id
             order by v.created_at, v.id) as rn
    from public.location_item_votes v
    where p_scope is null or v.location_id = any (p_scope)
  ),
  d as (
    delete from public.location_item_votes v
    using ranked r
    where r.id = v.id and r.rn > 1
    returning v.id, v.proposed_section
  )
  insert into migration_106.c2_vote_changes (id, old_proposed, new_proposed, reason)
  select d.id, d.proposed_section, null, 'duplicate' from d;

  -- d. Rewrite the surviving proposals and the tags to their targets. The tidy
  -- trigger fires on insert and on an update of name only, not here.
  with u as (
    update public.location_item_votes v
    set proposed_section = migration_106.c2_target_label(v.proposed_section)
    where (p_scope is null or v.location_id = any (p_scope))
      and v.proposed_section is distinct from migration_106.c2_target_label(v.proposed_section)
    returning v.id, v.proposed_section
  )
  insert into migration_106.c2_vote_changes (id, old_proposed, new_proposed, reason)
  select u.id, b.proposed_section, u.proposed_section, 'proposal_rewritten'
  from u
  join migration_106.location_item_votes_before_c2 b on b.id = u.id;

  update public.location_items li
  set section = tc.new_section
  from migration_106.c2_tag_changes tc
  where tc.id = li.id
    and tc.new_section is not null
    and li.section is distinct from tc.new_section
    and (p_scope is null or li.location_id = any (p_scope));

  -- e. A vote equal to its tag's label has nothing left to correct.
  with d as (
    delete from public.location_item_votes v
    using public.location_items li
    where li.location_id = v.location_id
      and li.name = v.item_name
      and li.section = v.proposed_section
      and (p_scope is null or v.location_id = any (p_scope))
    returning v.id, v.proposed_section
  )
  insert into migration_106.c2_vote_changes (id, old_proposed, new_proposed, reason)
  select d.id, d.proposed_section, null, 'equals_current' from d;

  -- f. D6: a proposal with two or more distinct voters is applied, and every vote
  -- on that item is deleted. One proposal per item: most voters, then the earliest
  -- first vote, then the label.
  with g_all as (
    select v.location_id, v.item_name, v.proposed_section,
           count(distinct v.voter_id)::integer as voters,
           min(v.created_at) as first_at
    from public.location_item_votes v
    where p_scope is null or v.location_id = any (p_scope)
    group by v.location_id, v.item_name, v.proposed_section
    having count(distinct v.voter_id) >= 2
  ),
  picked as (
    select distinct on (g.location_id, g.item_name)
           g.location_id, g.item_name, g.proposed_section, g.voters
    from g_all g
    order by g.location_id, g.item_name, g.voters desc, g.first_at, g.proposed_section
  ),
  cur as (
    select p.location_id, p.item_name, p.proposed_section, p.voters, li.section as old_section
    from picked p
    join public.location_items li
      on li.location_id = p.location_id and li.name = p.item_name
  ),
  applied as (
    update public.location_items li
    set section = c.proposed_section
    from cur c
    where li.location_id = c.location_id and li.name = c.item_name
    returning li.location_id, li.name
  )
  insert into migration_106.c2_applied (location_id, item_name, old_section, new_section, voters)
  select c.location_id, c.item_name, c.old_section, c.proposed_section, c.voters
  from cur c
  join applied a on a.location_id = c.location_id and a.name = c.item_name;

  with d as (
    delete from public.location_item_votes v
    using migration_106.c2_applied a
    where a.location_id = v.location_id
      and a.item_name = v.item_name
      and (p_scope is null or v.location_id = any (p_scope))
    returning v.id, v.proposed_section
  )
  insert into migration_106.c2_vote_changes (id, old_proposed, new_proposed, reason)
  select d.id, d.proposed_section, null, 'applied_d6' from d;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2d. c2_check(p_scope): the invariants after c2_transform. Raises 'FAIL: ...' on the
-- first violation; otherwise returns a JSON summary. Run by this migration over every
-- store and by the fixture test over its own store.
-- ---------------------------------------------------------------------------

create function migration_106.c2_check(p_scope uuid[] default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_tags_before bigint;
  v_tags_after bigint;
  v_tags_cleared bigint;
  v_votes_before bigint;
  v_votes_after bigint;
  v_votes_deleted bigint;
begin
  select count(*) into v_tags_before
  from migration_106.location_items_before_c2 b
  where p_scope is null or b.location_id = any (p_scope);

  select count(*) into v_tags_after
  from public.location_items li
  where p_scope is null or li.location_id = any (p_scope);

  select count(*) into v_tags_cleared
  from migration_106.c2_tag_changes tc
  where tc.new_section is null
    and (p_scope is null or tc.location_id = any (p_scope));

  select count(*) into v_votes_before
  from migration_106.location_item_votes_before_c2 b
  where p_scope is null or b.location_id = any (p_scope);

  select count(*) into v_votes_after
  from public.location_item_votes v
  where p_scope is null or v.location_id = any (p_scope);

  select count(*) into v_votes_deleted
  from migration_106.c2_vote_changes c
  join migration_106.location_item_votes_before_c2 b on b.id = c.id
  where c.new_proposed is null
    and (p_scope is null or b.location_id = any (p_scope));

  -- Labels.
  if exists (
    select 1 from public.location_items li
    where (p_scope is null or li.location_id = any (p_scope))
      and not migration_106.c2_is_standard(li.section)
  ) then
    raise exception 'FAIL: a tag label is not in the standard set or Aisle N';
  end if;

  if exists (
    select 1 from public.location_item_votes v
    where (p_scope is null or v.location_id = any (p_scope))
      and not migration_106.c2_is_standard(v.proposed_section)
  ) then
    raise exception 'FAIL: a pending proposal is not in the standard set or Aisle N';
  end if;

  -- Tags: count, identity, and exactly the planned label.
  if v_tags_after <> v_tags_before - v_tags_cleared then
    raise exception 'FAIL: tag count % is not backup count % minus cleared %',
      v_tags_after, v_tags_before, v_tags_cleared;
  end if;

  if exists (
    select 1
    from migration_106.c2_tag_changes tc
    join public.location_items li on li.id = tc.id
    where tc.new_section is null
      and (p_scope is null or tc.location_id = any (p_scope))
  ) then
    raise exception 'FAIL: a cleared tag still exists';
  end if;

  if exists (
    select 1
    from migration_106.location_items_before_c2 b
    left join public.location_items l on l.id = b.id
    left join migration_106.c2_tag_changes tc on tc.id = b.id
    left join migration_106.c2_applied a
      on a.location_id = b.location_id and a.item_name = b.name
    where (p_scope is null or b.location_id = any (p_scope))
      and not (tc.id is not null and tc.new_section is null)
      and (l.id is null
           or l.location_id is distinct from b.location_id
           or l.name is distinct from b.name
           or l.created_at is distinct from b.created_at
           or l.section is distinct from coalesce(a.new_section, tc.new_section, b.section))
  ) then
    raise exception 'FAIL: a surviving tag lost its row, changed store, name or created_at, or does not carry the planned label';
  end if;

  -- Votes: count, identity, and exactly the planned proposal.
  if v_votes_after <> v_votes_before - v_votes_deleted then
    raise exception 'FAIL: vote count % is not backup count % minus logged deletes %',
      v_votes_after, v_votes_before, v_votes_deleted;
  end if;

  if exists (
    select 1
    from migration_106.c2_vote_changes c
    left join migration_106.location_item_votes_before_c2 b on b.id = c.id
    where b.id is null
  ) then
    raise exception 'FAIL: the vote log names a vote that is not in the backup';
  end if;

  if exists (
    select 1
    from migration_106.c2_vote_changes c
    join public.location_item_votes v on v.id = c.id
    where c.new_proposed is null
      and (p_scope is null or v.location_id = any (p_scope))
  ) then
    raise exception 'FAIL: a vote logged as deleted still exists';
  end if;

  if exists (
    select 1
    from public.location_item_votes v
    left join migration_106.location_item_votes_before_c2 b on b.id = v.id
    where (p_scope is null or v.location_id = any (p_scope))
      and (b.id is null
           or b.location_id is distinct from v.location_id
           or b.item_name is distinct from v.item_name
           or b.voter_id is distinct from v.voter_id
           or b.created_at is distinct from v.created_at
           or v.proposed_section is distinct from coalesce(
                (select c.new_proposed from migration_106.c2_vote_changes c
                 where c.id = v.id and c.reason = 'proposal_rewritten' limit 1),
                b.proposed_section))
  ) then
    raise exception 'FAIL: a surviving vote was lost or changed beyond its logged rewrite';
  end if;

  -- What a pending correction may still look like.
  if exists (
    select 1
    from public.location_item_votes v
    join public.location_items li
      on li.location_id = v.location_id and li.name = v.item_name
    where (p_scope is null or v.location_id = any (p_scope))
      and li.section = v.proposed_section
  ) then
    raise exception 'FAIL: a pending vote equals its tag''s current label';
  end if;

  if exists (
    select 1
    from public.location_item_votes v
    join public.location_items li
      on li.location_id = v.location_id and li.name = v.item_name
    where (p_scope is null or v.location_id = any (p_scope))
      and lower(btrim(regexp_replace(li.section, '\s+', ' ', 'g')))
        = lower(btrim(regexp_replace(v.proposed_section, '\s+', ' ', 'g')))
  ) then
    raise exception 'FAIL: a pending vote differs from its tag''s label only by case or whitespace';
  end if;

  if exists (
    select 1 from public.location_item_votes v
    where p_scope is null or v.location_id = any (p_scope)
    group by v.location_id, v.item_name, v.proposed_section
    having count(distinct v.voter_id) >= 2
  ) then
    raise exception 'FAIL: a pending proposal still has two or more voters';
  end if;

  if exists (
    select 1 from public.location_item_votes v
    where p_scope is null or v.location_id = any (p_scope)
    group by v.location_id, v.item_name, v.proposed_section, v.voter_id
    having count(*) > 1
  ) then
    raise exception 'FAIL: two votes share the same (store, item, proposal, voter)';
  end if;

  if exists (
    select 1
    from public.location_item_votes v
    left join public.location_items t
      on t.location_id = v.location_id and t.name = v.item_name
    where (p_scope is null or v.location_id = any (p_scope))
      and t.id is null
  ) then
    raise exception 'FAIL: a vote points at no tag';
  end if;

  return jsonb_build_object(
    'tags_before', v_tags_before,
    'tags_after', v_tags_after,
    'tags_cleared', v_tags_cleared,
    'tags_rewritten', (
      select count(*) from migration_106.c2_tag_changes tc
      where tc.new_section is not null
        and (p_scope is null or tc.location_id = any (p_scope))),
    'tags_applied_d6', (
      select count(*) from migration_106.c2_applied a
      where p_scope is null or a.location_id = any (p_scope)),
    'votes_before', v_votes_before,
    'votes_after', v_votes_after,
    'votes_rewritten', (
      select count(*) from migration_106.c2_vote_changes c
      join migration_106.location_item_votes_before_c2 b on b.id = c.id
      where c.reason = 'proposal_rewritten'
        and (p_scope is null or b.location_id = any (p_scope))),
    'votes_deleted', v_votes_deleted,
    'votes_deleted_by_reason', (
      select coalesce(jsonb_object_agg(z.reason, z.n), '{}'::jsonb)
      from (
        select c.reason, count(*) as n
        from migration_106.c2_vote_changes c
        join migration_106.location_item_votes_before_c2 b on b.id = c.id
        where c.new_proposed is null
          and (p_scope is null or b.location_id = any (p_scope))
        group by c.reason
      ) z),
    'cleared_labels', (
      select coalesce(jsonb_agg(jsonb_build_object('label', z.old_section, 'tags', z.n)
                                order by z.old_section), '[]'::jsonb)
      from (
        select tc.old_section, count(*) as n
        from migration_106.c2_tag_changes tc
        where tc.new_section is null
          and (p_scope is null or tc.location_id = any (p_scope))
        group by tc.old_section
      ) z),
    'rewritten_labels', (
      select coalesce(jsonb_agg(jsonb_build_object('from', z.old_section, 'to', z.new_section,
                                                   'tags', z.n)
                                order by z.old_section), '[]'::jsonb)
      from (
        select tc.old_section, tc.new_section, count(*) as n
        from migration_106.c2_tag_changes tc
        where tc.new_section is not null
          and (p_scope is null or tc.location_id = any (p_scope))
        group by tc.old_section, tc.new_section
      ) z),
    'applied_d6', (
      select coalesce(jsonb_agg(jsonb_build_object('from', a.old_section, 'to', a.new_section,
                                                   'voters', a.voters)
                                order by a.item_name), '[]'::jsonb)
      from migration_106.c2_applied a
      where p_scope is null or a.location_id = any (p_scope))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2e. c2_revert_data(p_scope): the data half of the undo, called by
-- supabase/rollback/106_c2_revert.sql (it lives here so the fixture test can
-- exercise it). It works from the *_before_c2 backups and never overwrites later
-- work:
--   * cleared tags are re-inserted by id (the C1 tidy trigger is switched off for
--     the insert, or it would capitalise their old labels), unless the store has
--     since been re-tagged for that item;
--   * a label is put back only where the tag still carries what C2 wrote (so a
--     correction applied since the run stays);
--   * votes C2 rewrote are deleted, and every backed-up vote that is missing is
--     re-inserted where its voter still exists (the voter_id foreign key cascades on
--     auth.users, and ON CONFLICT does not cover foreign-key errors), its tag exists
--     and the proposal differs from the tag's label; votes cast since the run stay.
-- ---------------------------------------------------------------------------

create function migration_106.c2_revert_data(p_scope uuid[] default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_trigger_on boolean := exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_tidy'
      and not tgisinternal
      and tgenabled = 'O');
begin
  if v_trigger_on then
    alter table public.location_items disable trigger location_items_tidy;
  end if;

  insert into public.location_items (id, location_id, name, section, created_at)
  select b.id, b.location_id, b.name, b.section, b.created_at
  from migration_106.location_items_before_c2 b
  join migration_106.c2_tag_changes tc on tc.id = b.id and tc.new_section is null
  where (p_scope is null or b.location_id = any (p_scope))
    and not exists (
      select 1 from public.location_items x
      where x.id = b.id or (x.location_id = b.location_id and x.name = b.name))
    and exists (select 1 from public.locations loc where loc.id = b.location_id);

  update public.location_items l
  set section = b.section
  from migration_106.location_items_before_c2 b
  left join migration_106.c2_tag_changes tc on tc.id = b.id
  left join migration_106.c2_applied a
    on a.location_id = b.location_id and a.item_name = b.name
  where l.id = b.id
    and (p_scope is null or b.location_id = any (p_scope))
    and l.section is distinct from b.section
    and l.section = coalesce(a.new_section, tc.new_section);

  if v_trigger_on then
    alter table public.location_items enable trigger location_items_tidy;
  end if;

  delete from public.location_item_votes v
  using migration_106.location_item_votes_before_c2 b
  where b.id = v.id
    and (p_scope is null or v.location_id = any (p_scope))
    and v.proposed_section is distinct from b.proposed_section;

  insert into public.location_item_votes
    (id, location_id, item_name, proposed_section, voter_id, created_at)
  select b.id, b.location_id, b.item_name, b.proposed_section, b.voter_id, b.created_at
  from migration_106.location_item_votes_before_c2 b
  where (p_scope is null or b.location_id = any (p_scope))
    and not exists (select 1 from public.location_item_votes x where x.id = b.id)
    and exists (select 1 from auth.users u where u.id = b.voter_id)
    and exists (
      select 1 from public.location_items t
      where t.location_id = b.location_id
        and t.name = b.item_name
        and t.section <> b.proposed_section)
  on conflict do nothing;
end;
$$;

revoke execute on function migration_106.c2_standard_labels() from public, anon, authenticated;
revoke execute on function migration_106.c2_is_standard(text) from public, anon, authenticated;
revoke execute on function migration_106.c2_target_label(text) from public, anon, authenticated;
revoke execute on function migration_106.c2_transform(uuid[]) from public, anon, authenticated;
revoke execute on function migration_106.c2_check(uuid[]) from public, anon, authenticated;
revoke execute on function migration_106.c2_revert_data(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2f. Data that would break the run stops it before anything changes.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from migration_106.c2_label_map m
    where m.from_key <> public.fold_item_name(m.from_key)
       or m.from_key <> replace(
            regexp_replace(m.from_key,
              '^the | (section|department|dept|area|counter|aisle|isle|bay)$', '', 'g'),
            ' and ', ' & ')
       or not migration_106.c2_is_standard(m.to_label)
  ) then
    raise exception 'FAIL: a c2_label_map key is not in its normal form (k1) or its target is not a standard label or Aisle N';
  end if;

  if exists (
    select 1 from public.location_items
    where length(migration_106.c2_target_label(section)) > 60
  ) then
    raise exception 'FAIL: a label target is longer than 60 characters';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The vote function as it is running now, kept for the revert.
-- ---------------------------------------------------------------------------

insert into migration_106.c2_prior_vote_function (def)
select pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure);

-- ---------------------------------------------------------------------------
-- 4. The data steps, over every store.
-- ---------------------------------------------------------------------------

select migration_106.c2_transform(null);

-- ---------------------------------------------------------------------------
-- 5. vote_location_item_correction(p_location_id uuid, p_item_name text,
-- p_proposed_section text). Same signature, security definer, empty search_path.
-- Differences from the C1 body: the proposal is capitalised, the tag row is locked,
-- a case-or-whitespace-only change is applied at once, and every object is
-- public.-qualified.
-- ---------------------------------------------------------------------------

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
  v_item_name text := public.fold_item_name(p_item_name);
  v_proposed_section text := public.capitalise_first(p_proposed_section);
  v_current_section text;
  v_vote_count int;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  -- The tag row is locked for the rest of the call, so a case-only apply and a
  -- quorum apply on one item cannot interleave.
  select section into v_current_section
  from public.location_items
  where location_id = p_location_id
    and name = v_item_name
  for update;

  if v_current_section is null then
    raise exception 'item_not_tagged';
  end if;

  if v_current_section = v_proposed_section then
    raise exception 'correction_matches_current';
  end if;

  -- A change of case or spacing only needs no second opinion: apply it at once and
  -- clear this item's pending votes, as a quorum apply does.
  if lower(btrim(regexp_replace(v_current_section, '\s+', ' ', 'g')))
     = lower(btrim(regexp_replace(v_proposed_section, '\s+', ' ', 'g'))) then
    update public.location_items
    set section = v_proposed_section
    where location_id = p_location_id
      and name = v_item_name;

    delete from public.location_item_votes
    where location_id = p_location_id
      and item_name = v_item_name;

    return;
  end if;

  -- The insert attempt IS the independence check - see the header of
  -- 20260811000002. Splitting a pre-check from the write would let two truly
  -- concurrent identical requests both pass the check before either wrote, the
  -- same race redeem_invite (migration 20260810000000) already avoids by making
  -- its claiming UPDATE the validation.
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

    -- Every pending vote for this item, not only this tuple's own two: applying
    -- one correction moots the others (see the header of 20260811000002).
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

-- ---------------------------------------------------------------------------
-- 6. Post-assertions. Any FAIL rolls the whole migration back. On a dry run
-- (cartel.dry_run = 'on') the last act is a deliberate error that also rolls
-- back and carries a JSON summary to read.
-- ---------------------------------------------------------------------------

do $$
declare
  v_summary jsonb := migration_106.c2_check(null);
  v_def text := pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure);
  v_grants_before text := current_setting('cartel.c2_grants', true);
  v_grants_after text;
  v_tbl text;
  v_fn text;
begin
  -- The vote function.
  if not (select p.prosecdef from pg_proc p
          where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure) then
    raise exception 'FAIL: vote_location_item_correction is no longer security definer';
  end if;

  if (select array_to_string(p.proconfig, ',') from pg_proc p
      where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure)
     not like '%search_path=""%' then
    raise exception 'FAIL: vote_location_item_correction does not have search_path = ''''';
  end if;

  if v_def not like '%public.fold_item_name(p_item_name)%'
     or v_def not like '%public.capitalise_first(p_proposed_section)%'
     or v_def not ilike '%for update%' then
    raise exception 'FAIL: vote_location_item_correction does not fold the name, capitalise the proposal and lock the tag';
  end if;

  if has_function_privilege('anon', 'public.vote_location_item_correction(uuid, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.vote_location_item_correction(uuid, text, text)', 'execute') then
    raise exception 'FAIL: vote_location_item_correction must be executable by authenticated only';
  end if;

  if not exists (select 1 from migration_106.c2_prior_vote_function
                 where def ilike 'create or replace function%') then
    raise exception 'FAIL: the prior vote function definition was not stored';
  end if;

  -- Triggers all still enabled.
  if exists (
    select 1 from pg_trigger
    where tgrelid in ('public.location_items'::regclass,
                      'public.location_item_votes'::regclass,
                      'public.location_checkoffs'::regclass)
      and not tgisinternal
      and tgenabled <> 'O'
  ) then
    raise exception 'FAIL: a trigger on location_items, location_item_votes or location_checkoffs is not enabled';
  end if;

  -- Privileges: exactly what they were, the backup schema and its tables and
  -- functions unreachable by any API role.
  select json_agg(x.v order by x.k)::text into v_grants_after
  from (
    select r || '|' || t || '|' || p as k,
           has_table_privilege(r, 'public.' || t, p) as v
    from unnest(array['anon', 'authenticated']) as r,
         unnest(array['location_items', 'location_item_votes', 'location_checkoffs']) as t,
         unnest(array['select', 'insert', 'update', 'delete']) as p
    union all
    select r || '|' || f,
           has_function_privilege(r, f, 'execute')
    from unnest(array['anon', 'authenticated']) as r,
         unnest(array[
           'public.vote_location_item_correction(uuid, text, text)',
           'public.item_names_are_normalized(text[])',
           'public.fold_item_name(text)',
           'public.capitalise_first(text)'
         ]) as f
  ) x;

  if v_grants_before is null or v_grants_after is distinct from v_grants_before then
    raise exception 'FAIL: table or function privileges changed during the run';
  end if;

  if has_schema_privilege('anon', 'migration_106', 'usage')
     or has_schema_privilege('authenticated', 'migration_106', 'usage') then
    raise exception 'FAIL: anon or authenticated can use schema migration_106';
  end if;

  foreach v_tbl in array array[
    'c2_run', 'location_items_before_c2', 'location_item_votes_before_c2',
    'c2_label_map', 'c2_tag_changes', 'c2_vote_changes', 'c2_applied',
    'c2_prior_vote_function'
  ] loop
    if has_table_privilege('anon', 'migration_106.' || v_tbl, 'select')
       or has_table_privilege('authenticated', 'migration_106.' || v_tbl, 'select') then
      raise exception 'FAIL: anon or authenticated can read migration_106.%', v_tbl;
    end if;
  end loop;

  foreach v_fn in array array[
    'migration_106.c2_standard_labels()', 'migration_106.c2_is_standard(text)',
    'migration_106.c2_target_label(text)', 'migration_106.c2_transform(uuid[])',
    'migration_106.c2_check(uuid[])', 'migration_106.c2_revert_data(uuid[])'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute')
       or exists (
         select 1 from pg_proc p, aclexplode(p.proacl) a
         where p.oid = v_fn::regprocedure and a.grantee = 0) then
      raise exception 'FAIL: an API role or public can execute %', v_fn;
    end if;
  end loop;

  if current_setting('cartel.dry_run', true) = 'on' then
    raise exception 'DRY RUN OK, rolled back: %', v_summary::text;
  end if;
end $$;

commit;
