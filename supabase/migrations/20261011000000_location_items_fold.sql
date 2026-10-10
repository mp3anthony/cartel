-- Issue #106 -- Slice 4a (Migration C1, location side). Item tags, correction votes
-- and check-offs are keyed by fold_item_name instead of lower(btrim).
--
-- THIS IS A PRODUCTION MIGRATION. It is applied via the Supabase MCP by the
-- orchestrator (after a clean dry run and Ant's explicit go), or by Ant in the
-- Supabase SQL editor (project chacavfoewyiwrfgvxtj), never by CI. Runbook, in order:
--   PRE-1..PRE-4 (supabase/checks/106_slice4a_preflight_and_postflight.sql), then a
--   DRY RUN of this file (uncomment the cartel.dry_run line right after `begin`;
--   the run must end with the error "DRY RUN OK, rolled back"), then the REAL RUN
--   (the same file with that line left commented), then POST-1 and POST-2, then
--   the iPhone checklist. Only apply once the Live footer shows 0.0.54 or higher.
-- The file is ASCII only on purpose: raw non-ASCII text is mangled by some
-- clipboard routes (docs/lessons.md). It calls public.fold_item_name and
-- public.capitalise_first from Migration A (20261008000000_item_name_fold.sql)
-- but never redefines them. It needs slice 3 (20261010000000) applied first.
-- Undo: supabase/rollback/106_location_items_revert.sql (usable until Migration C2).
--
-- WHAT THIS DOES (all in one transaction; any failure rolls everything back)
--   1  Locks location_items, location_item_votes and location_checkoffs (access
--      exclusive, taken up front so nothing can deadlock on a later upgrade).
--   2  Backs up all three tables (voter_id included), a merge log, a vote-delete
--      log and the dropped constraint definitions into schema migration_106 (no
--      access for API roles; keep it 30 days after Migration C2, then drop it).
--   3  Drops the three lower(btrim) constraints: the CHECK on location_items.name,
--      the CHECK on location_item_votes.item_name and the composite FK from votes
--      to tags. They are found by definition in pg_constraint, not by name (all
--      three were auto-named), and exactly one of each must exist.
--   4  Merges tags that share a (location_id, fold_item_name(name)) key (D5): the
--      oldest by (created_at, id) survives with its id, section and created_at.
--      Losing tags are HARD-deleted (the table has no deleted_at); the backup and
--      the merge log are the audit trail, and the revert re-inserts them by id.
--   5  Deletes the correction votes that were cast on a losing tag (D13).
--   6  Re-keys every surviving tag and vote to the fold, and every check-off array
--      element-wise (order kept).
--   7  Replaces item_names_are_normalized so a check-off element must equal its
--      fold, and re-adds the two CHECKs (name = fold, item_name = fold) and the FK
--      under its old name.
--   8  Adds the BEFORE INSERT OR UPDATE OF name trigger location_items_tidy: it
--      stores the fold of the name, refuses an empty fold and capitalises the
--      section on insert.
--   9  Redefines vote_location_item_correction so it folds the item name it is
--      given (the only change to its body).
--
-- NO RLS, POLICY OR GRANT CHANGE on any public table (a post-check proves the
-- table and function privileges are exactly what they were). The new tables sit in
-- the closed schema migration_106 and hold voter_id: unreadable by API roles.
--
-- C1-to-C2 WINDOW: a cached client older than 0.0.52 sends the raw item name to the
-- vote function; the function now folds it, so that edge is closed. A case-only
-- correction still needs a second user until Migration C2. Item catalog names lose
-- their accents until #148 gives them a display name (D11).
--
-- The tidy trigger folds before the CHECKs run, so an old client that sends
-- lower(btrim(name)) is rescued; a name whose fold already exists still raises 23505
-- on unique (location_id, name), which the client treats as success.
--
-- ICU upper() can lengthen a section starting with the sharp s (it becomes SS), so a
-- 60-character section starting with it can fail the 1..60 check as a raw 23514
-- after the trigger capitalises it. Negligible: sections come from a fixed set.
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

  if to_regclass('migration_106.run') is null
     or to_regclass('public.list_items_live_name_key') is null then
    raise exception 'FAIL: slice 3 is not applied (migration_106.run or index list_items_live_name_key is missing); apply 20261010000000_list_items_fold.sql first';
  end if;

  if to_regclass('migration_106.c1_run') is not null then
    raise exception 'FAIL: migration C1 already applied (migration_106.c1_run exists)';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_tidy'
      and not tgisinternal
  ) then
    raise exception 'FAIL: migration C1 already applied (trigger location_items_tidy exists)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Locks. Constraint DDL needs access exclusive, so it is taken once, up front.
-- A concurrent vote or tag write waits for the run; if one holds a lock for over
-- 5s (or a deadlock is detected) the run fails with nothing changed: run it again.
-- ---------------------------------------------------------------------------

lock table public.location_items, public.location_item_votes, public.location_checkoffs
  in access exclusive mode;

-- The table and function privileges as they are now; compared again at the end.
select set_config('cartel.c1_grants', (
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
-- 2. Backup tables in the closed schema (slice 3 created the schema).
-- ---------------------------------------------------------------------------

create table migration_106.c1_run (
  applied_at timestamptz not null
);
insert into migration_106.c1_run (applied_at) values (now());

create table migration_106.location_items_before as
  select * from public.location_items;
alter table migration_106.location_items_before add primary key (id);

create table migration_106.location_item_votes_before as
  select * from public.location_item_votes;
alter table migration_106.location_item_votes_before add primary key (id);

create table migration_106.location_checkoffs_before as
  select id, item_names from public.location_checkoffs;
alter table migration_106.location_checkoffs_before add primary key (id);

create table migration_106.location_item_merges (
  loser_id uuid primary key,
  survivor_id uuid not null,
  location_id uuid not null,
  fold_key text not null
);

create table migration_106.location_item_votes_deleted (
  id uuid primary key,
  reason text not null
);

create table migration_106.c1_dropped_constraints (
  table_name text not null,
  conname text not null,
  condef text not null
);

revoke all on schema migration_106 from public, anon, authenticated;
revoke all on all tables in schema migration_106 from public, anon, authenticated;
alter table migration_106.c1_run enable row level security;
alter table migration_106.location_items_before enable row level security;
alter table migration_106.location_item_votes_before enable row level security;
alter table migration_106.location_checkoffs_before enable row level security;
alter table migration_106.location_item_merges enable row level security;
alter table migration_106.location_item_votes_deleted enable row level security;
alter table migration_106.c1_dropped_constraints enable row level security;

-- ---------------------------------------------------------------------------
-- 2b. Data that would break the re-key stops the run before anything changes.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.location_items
    where public.fold_item_name(name) = ''
       or length(public.fold_item_name(name)) not between 1 and 120
       or public.fold_item_name(public.fold_item_name(name)) <> public.fold_item_name(name)
  ) then
    raise exception 'FAIL: a tag name folds to empty, folds outside 1..120 characters or is not stable under the fold';
  end if;

  if exists (
    select 1 from public.location_checkoffs c, unnest(c.item_names) as e(x)
    where public.fold_item_name(e.x) = ''
  ) then
    raise exception 'FAIL: a check-off element folds to empty';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Drop the three lower(btrim) constraints, found by definition. Each name and
-- definition is logged first so the revert can rebuild exactly what was there.
-- ---------------------------------------------------------------------------

insert into migration_106.c1_dropped_constraints (table_name, conname, condef)
select 'location_items', c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
where c.conrelid = 'public.location_items'::regclass
  and c.contype = 'c'
  and strpos(pg_get_constraintdef(c.oid), 'lower(btrim(name))') > 0
union all
select 'location_item_votes', c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
where c.conrelid = 'public.location_item_votes'::regclass
  and c.contype = 'c'
  and strpos(pg_get_constraintdef(c.oid), 'lower(btrim(item_name))') > 0
union all
select 'location_item_votes', c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
where c.conrelid = 'public.location_item_votes'::regclass
  and c.contype = 'f'
  and c.confrelid = 'public.location_items'::regclass;

do $$
declare
  r record;
begin
  if (select count(*) from migration_106.c1_dropped_constraints
      where table_name = 'location_items') <> 1
     or (select count(*) from migration_106.c1_dropped_constraints
         where table_name = 'location_item_votes' and condef like 'CHECK%') <> 1
     or (select count(*) from migration_106.c1_dropped_constraints
         where table_name = 'location_item_votes' and condef like 'FOREIGN KEY%') <> 1 then
    raise exception 'FAIL: expected exactly one lower(btrim) CHECK on location_items, one on location_item_votes and one FK from votes to tags; found %',
      (select json_agg(json_build_object('table', table_name, 'name', conname, 'def', condef))::text
       from migration_106.c1_dropped_constraints);
  end if;

  for r in select table_name, conname from migration_106.c1_dropped_constraints loop
    execute format('alter table public.%I drop constraint %I', r.table_name, r.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Merge log (D5). Survivor = oldest by (created_at, id) per (location, fold).
-- ---------------------------------------------------------------------------

insert into migration_106.location_item_merges (loser_id, survivor_id, location_id, fold_key)
select r.id, r.survivor_id, r.location_id, r.f
from (
  select li.id,
         li.location_id,
         public.fold_item_name(li.name) as f,
         row_number() over w as rn,
         first_value(li.id) over w as survivor_id
  from public.location_items li
  window w as (
    partition by li.location_id, public.fold_item_name(li.name)
    order by li.created_at, li.id
  )
) r
where r.rn > 1;

-- ---------------------------------------------------------------------------
-- 5. D13: votes cast on a losing tag go with it. Logged, then deleted.
-- ---------------------------------------------------------------------------

insert into migration_106.location_item_votes_deleted (id, reason)
select v.id, 'losing_tag'
from public.location_item_votes v
join public.location_items l
  on l.location_id = v.location_id and l.name = v.item_name
join migration_106.location_item_merges m on m.loser_id = l.id;

delete from public.location_item_votes
where id in (select id from migration_106.location_item_votes_deleted);

-- ---------------------------------------------------------------------------
-- 6. Delete the losing tags (before the re-key: the unique key is not deferrable).
-- ---------------------------------------------------------------------------

delete from public.location_items
where id in (select loser_id from migration_106.location_item_merges);

-- ---------------------------------------------------------------------------
-- 7. Re-key the survivors and their votes. A survivor keeps its id, section and
-- created_at. The tidy trigger does not exist yet, and no foreign key is in the
-- way (it is re-added in step 10).
-- ---------------------------------------------------------------------------

update public.location_items
set name = public.fold_item_name(name)
where name <> public.fold_item_name(name);

update public.location_item_votes
set item_name = public.fold_item_name(item_name)
where item_name <> public.fold_item_name(item_name);

-- ---------------------------------------------------------------------------
-- 8. Check-offs: fold each element, keeping the array order (the order IS the
-- datum computeRouteOrder reads). Then item_names_are_normalized is replaced:
-- the CHECK that calls it does not re-test existing rows, hence the re-fold first.
-- ---------------------------------------------------------------------------

update public.location_checkoffs c
set item_names = (
  select array_agg(public.fold_item_name(e.x) order by e.ord)
  from unnest(c.item_names) with ordinality as e(x, ord)
)
where exists (
  select 1 from unnest(c.item_names) as e(x)
  where e.x <> public.fold_item_name(e.x)
);

create or replace function public.item_names_are_normalized(names text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from unnest(names) as raw_name
    where raw_name <> public.fold_item_name(raw_name)
  );
$$;

revoke execute on function public.item_names_are_normalized(text[]) from public, anon;
grant execute on function public.item_names_are_normalized(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Re-add the constraints. The two CHECKs get fixed names; the FK gets the name
-- it had before. All three validate against the re-keyed rows right here.
-- ---------------------------------------------------------------------------

alter table public.location_items
  add constraint location_items_name_folded
  check (name = public.fold_item_name(name));

alter table public.location_item_votes
  add constraint location_item_votes_item_name_folded
  check (item_name = public.fold_item_name(item_name));

do $$
declare
  v_fk text := (
    select conname from migration_106.c1_dropped_constraints
    where table_name = 'location_item_votes' and condef like 'FOREIGN KEY%'
  );
begin
  execute format(
    'alter table public.location_item_votes add constraint %I '
    'foreign key (location_id, item_name) '
    'references public.location_items (location_id, name) on delete cascade',
    v_fk);
end $$;

-- ---------------------------------------------------------------------------
-- 10. Tidy trigger: the stored name is always the fold, a name whose fold is empty
-- (only combining marks, say) is refused, and a new tag's section is capitalised.
-- A BEFORE trigger runs before the CHECKs, which is what rescues old clients.
-- ---------------------------------------------------------------------------

create function public.location_items_tidy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := public.fold_item_name(new.name);
  if new.name = '' then
    raise exception 'invalid_name';
  end if;
  if tg_op = 'INSERT' then
    new.section := public.capitalise_first(new.section);
  end if;
  return new;
end;
$$;

create trigger location_items_tidy
  before insert or update of name on public.location_items
  for each row
  execute function public.location_items_tidy();

revoke execute on function public.location_items_tidy() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. vote_location_item_correction(p_location_id uuid, p_item_name text,
-- p_proposed_section text): body copied from 20260811000002_location_item_votes.sql
-- (comments ASCII-fied). The ONE change: v_item_name is the fold of the name given,
-- not lower(btrim), because tags are now stored folded.
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
-- 12. Post-assertions. Any FAIL rolls the whole migration back. On a dry run
-- (cartel.dry_run = 'on') the last act is a deliberate error that also rolls
-- back and carries a JSON summary to read.
-- ---------------------------------------------------------------------------

do $$
declare
  v_tags_before bigint := (select count(*) from migration_106.location_items_before);
  v_merges bigint := (select count(*) from migration_106.location_item_merges);
  v_tags_after bigint := (select count(*) from public.location_items);
  v_votes_before bigint := (select count(*) from migration_106.location_item_votes_before);
  v_votes_deleted bigint := (select count(*) from migration_106.location_item_votes_deleted);
  v_votes_after bigint := (select count(*) from public.location_item_votes);
  v_cof_before bigint := (select count(*) from migration_106.location_checkoffs_before);
  v_cof_after bigint := (select count(*) from public.location_checkoffs);
  v_grants_before text := current_setting('cartel.c1_grants', true);
  v_grants_after text;
  v_tbl text;
  v_summary text;
begin
  -- Tags.
  if exists (
    select 1 from public.location_items
    where name <> public.fold_item_name(name)
       or name = ''
       or length(name) not between 1 and 120
  ) then
    raise exception 'FAIL: a tag name is not its fold, is empty or is outside 1..120 characters';
  end if;

  if v_tags_after <> v_tags_before - v_merges then
    raise exception 'FAIL: tag count % is not backup count % minus merges %', v_tags_after, v_tags_before, v_merges;
  end if;

  if exists (
    select 1
    from migration_106.location_item_merges m
    join public.location_items l on l.id = m.loser_id
  ) then
    raise exception 'FAIL: a losing tag still exists';
  end if;

  if exists (
    select 1
    from migration_106.location_item_merges m
    left join public.location_items s on s.id = m.survivor_id
    where s.id is null
  ) then
    raise exception 'FAIL: a merge survivor is missing';
  end if;

  -- Every tag that was not a loser keeps its id, store, section and created_at, and
  -- its name is the fold of what it was.
  if exists (
    select 1
    from migration_106.location_items_before b
    left join public.location_items l on l.id = b.id
    where b.id not in (select loser_id from migration_106.location_item_merges)
      and (l.id is null
           or l.location_id is distinct from b.location_id
           or l.section is distinct from b.section
           or l.created_at is distinct from b.created_at
           or l.name is distinct from public.fold_item_name(b.name))
  ) then
    raise exception 'FAIL: a surviving tag lost its row or changed store, section or created_at, or is not the fold of its old name';
  end if;

  if exists (
    select 1 from public.location_items
    group by location_id, name
    having count(*) > 1
  ) then
    raise exception 'FAIL: two tags in one store share a name';
  end if;

  -- Votes.
  if exists (
    select 1 from public.location_item_votes
    where item_name <> public.fold_item_name(item_name)
  ) then
    raise exception 'FAIL: a vote item_name is not its fold';
  end if;

  if v_votes_after <> v_votes_before - v_votes_deleted then
    raise exception 'FAIL: vote count % is not backup count % minus deleted %', v_votes_after, v_votes_before, v_votes_deleted;
  end if;

  if exists (
    select 1 from migration_106.location_item_votes_deleted d
    join public.location_item_votes v on v.id = d.id
  ) then
    raise exception 'FAIL: a vote logged as deleted still exists';
  end if;

  if exists (
    select 1 from migration_106.location_item_votes_deleted d
    left join migration_106.location_item_votes_before b on b.id = d.id
    where b.id is null
  ) then
    raise exception 'FAIL: the vote-delete log names a vote that is not in the backup';
  end if;

  -- Only votes on losing tags may be gone, and every other vote keeps its meaning.
  if exists (
    select 1
    from migration_106.location_item_votes_before b
    left join public.location_item_votes v on v.id = b.id
    where b.id not in (select id from migration_106.location_item_votes_deleted)
      and (v.id is null
           or v.location_id is distinct from b.location_id
           or v.proposed_section is distinct from b.proposed_section
           or v.voter_id is distinct from b.voter_id
           or v.created_at is distinct from b.created_at
           or v.item_name is distinct from public.fold_item_name(b.item_name))
  ) then
    raise exception 'FAIL: a surviving vote was lost or changed beyond its item_name fold';
  end if;

  if exists (
    select 1 from public.location_item_votes
    group by location_id, item_name, proposed_section, voter_id
    having count(*) > 1
  ) then
    raise exception 'FAIL: two votes share the same (store, item, section, voter)';
  end if;

  if exists (
    select 1
    from public.location_item_votes v
    left join public.location_items t
      on t.location_id = v.location_id and t.name = v.item_name
    where t.id is null
  ) then
    raise exception 'FAIL: a vote points at no tag';
  end if;

  -- Check-offs.
  if v_cof_after <> v_cof_before then
    raise exception 'FAIL: check-off count % is not backup count %', v_cof_after, v_cof_before;
  end if;

  if exists (
    select 1
    from migration_106.location_checkoffs_before b
    left join public.location_checkoffs c on c.id = b.id
    where c.id is null
       or c.item_names is distinct from (
            select array_agg(public.fold_item_name(e.x) order by e.ord)
            from unnest(b.item_names) with ordinality as e(x, ord))
  ) then
    raise exception 'FAIL: a check-off is missing or is not the ordered fold of its backup';
  end if;

  if exists (
    select 1 from public.location_checkoffs
    where not public.item_names_are_normalized(item_names)
  ) then
    raise exception 'FAIL: a check-off fails item_names_are_normalized';
  end if;

  if pg_get_functiondef('public.item_names_are_normalized(text[])'::regprocedure) not like '%fold_item_name%' then
    raise exception 'FAIL: item_names_are_normalized does not use fold_item_name';
  end if;

  if (select provolatile from pg_proc
      where oid = 'public.item_names_are_normalized(text[])'::regprocedure) <> 'i' then
    raise exception 'FAIL: item_names_are_normalized is no longer IMMUTABLE';
  end if;

  if pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
       not like '%fold_item_name(p_item_name)%' then
    raise exception 'FAIL: vote_location_item_correction does not fold the item name';
  end if;

  -- Constraints.
  if exists (
    select 1 from pg_constraint
    where conrelid in ('public.location_items'::regclass, 'public.location_item_votes'::regclass)
      and contype = 'c'
      and strpos(pg_get_constraintdef(oid), 'lower(btrim') > 0
  ) then
    raise exception 'FAIL: a lower(btrim) CHECK remains on location_items or location_item_votes';
  end if;

  if (select count(*) from pg_constraint
      where conrelid = 'public.location_items'::regclass
        and conname = 'location_items_name_folded'
        and contype = 'c' and convalidated) <> 1
     or (select count(*) from pg_constraint
         where conrelid = 'public.location_item_votes'::regclass
           and conname = 'location_item_votes_item_name_folded'
           and contype = 'c' and convalidated) <> 1 then
    raise exception 'FAIL: a new fold CHECK is missing or not validated';
  end if;

  if (select count(*) from pg_constraint
      where conrelid = 'public.location_item_votes'::regclass
        and contype = 'f'
        and confrelid = 'public.location_items'::regclass
        and confdeltype = 'c'
        and convalidated) <> 1 then
    raise exception 'FAIL: the vote-to-tag foreign key is missing, not validated or not on delete cascade';
  end if;

  if (select count(*) from migration_106.c1_dropped_constraints) <> 3 then
    raise exception 'FAIL: expected exactly 3 logged dropped constraints';
  end if;

  -- Triggers.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_tidy'
      and not tgisinternal
      and tgenabled = 'O'
  ) then
    raise exception 'FAIL: trigger location_items_tidy is missing or not enabled';
  end if;

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

  -- Privileges: exactly what they were, the tidy trigger function reachable by no
  -- API role, the backup schema and its tables unreadable.
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

  if has_function_privilege('anon', 'public.location_items_tidy()', 'execute')
     or has_function_privilege('authenticated', 'public.location_items_tidy()', 'execute')
     or exists (
       select 1 from pg_proc p, aclexplode(p.proacl) a
       where p.oid = 'public.location_items_tidy()'::regprocedure and a.grantee = 0
     ) then
    raise exception 'FAIL: an API role or public can execute location_items_tidy';
  end if;

  if has_schema_privilege('anon', 'migration_106', 'usage')
     or has_schema_privilege('authenticated', 'migration_106', 'usage') then
    raise exception 'FAIL: anon or authenticated can use schema migration_106';
  end if;

  foreach v_tbl in array array[
    'c1_run', 'location_items_before', 'location_item_votes_before',
    'location_checkoffs_before', 'location_item_merges',
    'location_item_votes_deleted', 'c1_dropped_constraints'
  ] loop
    if has_table_privilege('anon', 'migration_106.' || v_tbl, 'select')
       or has_table_privilege('authenticated', 'migration_106.' || v_tbl, 'select') then
      raise exception 'FAIL: anon or authenticated can read migration_106.%', v_tbl;
    end if;
  end loop;

  select json_build_object(
    'tags_before', v_tags_before,
    'tags_after', v_tags_after,
    'tags_merged_away', v_merges,
    'tags_rekeyed', (
      select count(*)
      from migration_106.location_items_before b
      join public.location_items l on l.id = b.id
      where l.name <> b.name
    ),
    'votes_before', v_votes_before,
    'votes_after', v_votes_after,
    'votes_deleted_losing_tag', v_votes_deleted,
    'votes_rekeyed', (
      select count(*)
      from migration_106.location_item_votes_before b
      join public.location_item_votes v on v.id = b.id
      where v.item_name <> b.item_name
    ),
    'checkoffs_changed', (
      select count(*)
      from migration_106.location_checkoffs_before b
      join public.location_checkoffs c on c.id = b.id
      where c.item_names is distinct from b.item_names
    )
  )::text into v_summary;

  if current_setting('cartel.dry_run', true) = 'on' then
    raise exception 'DRY RUN OK, rolled back: %', v_summary;
  end if;
end $$;

commit;
