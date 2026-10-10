-- Issue #106, Slice 4a revert. DRAFTED, NEVER APPLIED, and kept outside
-- supabase/migrations on purpose (the CLI ignores this folder). Paste it into the
-- Supabase SQL editor only if the slice 4a production run must be undone.
--
-- It undoes 20261011000000_location_items_fold.sql using the backup tables that
-- migration created in schema migration_106:
--   * drops the location_items_tidy trigger and function and the two fold CHECKs
--     and the foreign key;
--   * gives every tag and vote its old spelling back (a name is restored only where
--     it still equals the fold of the backed-up name);
--   * re-inserts the merge losers by id with their old name, section and
--     created_at, and re-inserts the votes deleted with them (D13) where the voter
--     still exists;
--   * restores each check-off array that is still the folded form of its backup;
--   * puts back the old item_names_are_normalized and vote_location_item_correction
--     bodies, copied from 20260811000001 and 20260811000002 (comments ASCII-fied);
--   * re-adds the three dropped constraints under their old names, from the
--     definitions the migration logged.
-- Votes cast since the run are repointed to the restored spelling of their tag (a
-- vote that would then duplicate another, or that matches no tag, is dropped).
-- Tags added or corrections applied since the run are kept as they are.
-- Use it only before Migration C2 is applied; C2 changes the vote function and the
-- label data again, and this script does not know about that.
-- It leaves schema migration_106 in place, including migration_106.c1_run and every
-- c1_* and location_*_before table: drop those by hand (or the whole schema) before
-- applying C1 again, or its guard will refuse ("migration C1 already applied").
--
-- DRY RUN: uncomment the cartel.dry_run line below; the run then ends with the
-- error "DRY RUN OK, rolled back" instead of committing. Dry-run it once right
-- after the real migration, so the revert is known to work before it is needed.
-- ASCII only (clipboard mangling lesson in docs/lessons.md).

begin;

-- set local cartel.dry_run = 'on';

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if to_regclass('migration_106.c1_run') is null
     or to_regclass('migration_106.c1_dropped_constraints') is null then
    raise exception 'FAIL: migration_106.c1_run is missing, nothing to revert from';
  end if;

  if (select count(*) from migration_106.c1_dropped_constraints) <> 3 then
    raise exception 'FAIL: expected exactly 3 logged dropped constraints';
  end if;
end $$;

lock table public.location_items, public.location_item_votes, public.location_checkoffs
  in access exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. Remove what C1 added. The foreign key goes by the name it had (logged).
-- ---------------------------------------------------------------------------

drop trigger if exists location_items_tidy on public.location_items;
drop function if exists public.location_items_tidy();

alter table public.location_items
  drop constraint if exists location_items_name_folded;
alter table public.location_item_votes
  drop constraint if exists location_item_votes_item_name_folded;

do $$
declare
  v_fk text := (
    select conname from migration_106.c1_dropped_constraints
    where table_name = 'location_item_votes' and condef like 'FOREIGN KEY%'
  );
begin
  execute format('alter table public.location_item_votes drop constraint if exists %I', v_fk);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Old function bodies. item_names_are_normalized goes back first: the old
-- check-off arrays are not folded, and the CHECK that calls it must accept them.
-- ---------------------------------------------------------------------------

create or replace function public.item_names_are_normalized(names text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from unnest(names) as raw_name
    where raw_name <> lower(btrim(raw_name))
  );
$$;

revoke execute on function public.item_names_are_normalized(text[]) from public, anon;
grant execute on function public.item_names_are_normalized(text[]) to authenticated;

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
-- 3. Data back. Names first (no constraint or trigger is in the way now), then the
-- votes that point at them (including votes cast since the run), then the deleted
-- tags and their votes, then check-offs.
-- ---------------------------------------------------------------------------

update public.location_items l
set name = b.name
from migration_106.location_items_before b
where l.id = b.id
  and l.name <> b.name
  and l.name = public.fold_item_name(b.name);

update public.location_item_votes v
set item_name = b.item_name
from migration_106.location_item_votes_before b
where v.id = b.id
  and v.item_name <> b.item_name
  and v.item_name = public.fold_item_name(b.item_name);

-- Votes cast after the run carry the FOLDED item_name. Where no tag has exactly
-- that name any more (its tag just got its old spelling back), repoint the vote to
-- the oldest tag in that store whose fold is the vote's name. This runs BEFORE the
-- merge losers are re-inserted, so in a store that had a merge group the only match
-- is the survivor, which is where the vote was cast. A repointed vote that would
-- duplicate an existing vote on the same (store, item, section, voter) is dropped,
-- and so is any vote that matches no tag at all (a notice gives that count), so the
-- foreign key can be re-added in step 4.
create temp table c1_revert_repoint on commit drop as
select v.id,
       (select t.name
        from public.location_items t
        where t.location_id = v.location_id
          and public.fold_item_name(t.name) = v.item_name
        order by t.created_at, t.id
        limit 1) as new_name
from public.location_item_votes v
where not exists (
  select 1 from public.location_items e
  where e.location_id = v.location_id and e.name = v.item_name);

delete from public.location_item_votes v
using c1_revert_repoint r
where r.id = v.id
  and r.new_name is not null
  and exists (
    select 1 from public.location_item_votes w
    where w.location_id = v.location_id
      and w.item_name = r.new_name
      and w.proposed_section = v.proposed_section
      and w.voter_id = v.voter_id);

update public.location_item_votes v
set item_name = r.new_name
from c1_revert_repoint r
where r.id = v.id
  and r.new_name is not null
  and v.item_name <> r.new_name;

do $$
declare
  n bigint;
begin
  delete from public.location_item_votes v
  using c1_revert_repoint r
  where r.id = v.id
    and r.new_name is null;
  get diagnostics n = row_count;
  raise notice 'revert: % vote(s) deleted because they match no tag', n;
end $$;

insert into public.location_items (id, location_id, name, section, created_at)
select b.id, b.location_id, b.name, b.section, b.created_at
from migration_106.location_items_before b
where b.id in (select loser_id from migration_106.location_item_merges)
  and not exists (select 1 from public.location_items x where x.id = b.id)
  and exists (select 1 from public.locations loc where loc.id = b.location_id);

insert into public.location_item_votes
  (id, location_id, item_name, proposed_section, voter_id, created_at)
select b.id, b.location_id, b.item_name, b.proposed_section, b.voter_id, b.created_at
from migration_106.location_item_votes_before b
join migration_106.location_item_votes_deleted d on d.id = b.id
where exists (select 1 from auth.users u where u.id = b.voter_id)
  and exists (
    select 1 from public.location_items t
    where t.location_id = b.location_id and t.name = b.item_name)
on conflict do nothing;

update public.location_checkoffs c
set item_names = b.item_names
from migration_106.location_checkoffs_before b
where c.id = b.id
  and c.item_names is distinct from b.item_names
  and c.item_names = (
    select array_agg(public.fold_item_name(e.x) order by e.ord)
    from unnest(b.item_names) with ordinality as e(x, ord));

-- ---------------------------------------------------------------------------
-- 4. Re-add the three dropped constraints from the logged definitions. The two
-- CHECKs use the logged text; the foreign key is spelled out so the referenced
-- table is schema-qualified. All three validate against the restored rows.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select table_name, conname, condef
    from migration_106.c1_dropped_constraints
    where condef like 'CHECK%'
  loop
    execute format('alter table public.%I add constraint %I %s', r.table_name, r.conname, r.condef);
  end loop;

  for r in
    select conname
    from migration_106.c1_dropped_constraints
    where condef like 'FOREIGN KEY%'
  loop
    execute format(
      'alter table public.location_item_votes add constraint %I '
      'foreign key (location_id, item_name) '
      'references public.location_items (location_id, name) on delete cascade',
      r.conname);
  end loop;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid in ('public.location_items'::regclass, 'public.location_item_votes'::regclass)
      and (conname in ('location_items_name_folded', 'location_item_votes_item_name_folded'))
  ) then
    raise exception 'FAIL: a fold CHECK is still present';
  end if;

  if (select count(*) from pg_constraint c
      join migration_106.c1_dropped_constraints d
        on d.conname = c.conname
       and c.conrelid = ('public.' || d.table_name)::regclass
      where c.convalidated) <> 3 then
    raise exception 'FAIL: the three old constraints are not all back and validated';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass and tgname = 'location_items_tidy'
  ) then
    raise exception 'FAIL: trigger location_items_tidy is still present';
  end if;

  if exists (
    select 1 from public.location_checkoffs
    where not public.item_names_are_normalized(item_names)
  ) then
    raise exception 'FAIL: a check-off fails the restored item_names_are_normalized';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid in ('public.location_items'::regclass,
                      'public.location_item_votes'::regclass,
                      'public.location_checkoffs'::regclass)
      and not tgisinternal
      and tgenabled <> 'O'
  ) then
    raise exception 'FAIL: a trigger on a location table is not enabled';
  end if;

  if current_setting('cartel.dry_run', true) = 'on' then
    raise exception 'DRY RUN OK, rolled back: revert would succeed';
  end if;
end $$;

commit;
