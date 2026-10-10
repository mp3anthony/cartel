-- Issue #106, Slice 4b (Migration C2) revert. DRAFTED, NEVER APPLIED, and kept
-- outside supabase/migrations on purpose (the CLI ignores this folder). Paste it into
-- the Supabase SQL editor (or send it through the MCP) only if the slice 4b
-- production run must be undone.
--
-- It undoes 20261012000000_location_labels_votes.sql using the backups and logs that
-- migration created in schema migration_106:
--   * the data half is migration_106.c2_revert_data(null), a function the migration
--     created so supabase/tests/location_labels_transform.sql can run it on fixture
--     rows. It re-inserts the cleared tags by id (switching the C1 tidy trigger off
--     for the insert, so their old labels are not capitalised; a store that has been
--     re-tagged for that item since is left alone), puts each rewritten label back
--     only where the tag still carries what C2 wrote (a correction applied since the
--     run stays), deletes the votes C2 rewrote and re-inserts every backed-up vote
--     that is missing where its voter still exists (guarded on auth.users: the
--     voter_id foreign key cascades, and ON CONFLICT does not cover foreign-key
--     errors), its tag exists and the proposal differs from the tag's label. Votes
--     cast since the run are kept;
--   * the vote function goes back to the definition stored in
--     migration_106.c2_prior_vote_function just before C2 ran (the C1 body; read from
--     the live database, not copied here), with EXECUTE re-granted as it was.
-- A vote consumed by a correction applied after the run can come back as a stale
-- pending vote; it is harmless but can be confirmed by a new voter. Nothing C2 did to
-- the schema's structure needs undoing: it added no constraint, trigger or policy.
-- The 4a revert (106_location_items_revert.sql) does NOT work once C2 has run; this
-- script does not undo C1.
-- It leaves schema migration_106 in place, including migration_106.c2_run and every
-- c2_* object and location_*_before_c2 table: drop those by hand (or the whole
-- schema) before applying C2 again, or its guard will refuse ("migration C2 already
-- applied").
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
  if to_regclass('migration_106.c2_run') is null
     or to_regclass('migration_106.c2_prior_vote_function') is null
     or to_regprocedure('migration_106.c2_revert_data(uuid[])') is null then
    raise exception 'FAIL: migration_106.c2_run or c2_revert_data is missing, nothing to revert from';
  end if;

  if (select count(*) from migration_106.c2_prior_vote_function) <> 1 then
    raise exception 'FAIL: expected exactly one stored prior vote function definition';
  end if;
end $$;

-- Same locks as the migration: the tags EXCLUSIVE (it conflicts with the vote
-- function's FOR UPDATE), the votes SHARE ROW EXCLUSIVE.
lock table public.location_items in exclusive mode;
lock table public.location_item_votes in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. Data back.
-- ---------------------------------------------------------------------------

select migration_106.c2_revert_data(null);

-- ---------------------------------------------------------------------------
-- 2. The vote function as it was just before C2.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text := (select def from migration_106.c2_prior_vote_function);
begin
  execute v_def;
end $$;

revoke execute on function public.vote_location_item_correction(uuid, text, text)
  from public, anon;
grant execute on function public.vote_location_item_correction(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Checks.
-- ---------------------------------------------------------------------------

do $$
begin
  if pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
     is distinct from (select def from migration_106.c2_prior_vote_function) then
    raise exception 'FAIL: vote_location_item_correction is not the stored prior definition';
  end if;

  if not (select p.prosecdef from pg_proc p
          where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure) then
    raise exception 'FAIL: vote_location_item_correction is not security definer';
  end if;

  if has_function_privilege('anon', 'public.vote_location_item_correction(uuid, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.vote_location_item_correction(uuid, text, text)', 'execute') then
    raise exception 'FAIL: vote_location_item_correction must be executable by authenticated only';
  end if;

  -- Every tag cleared by C2 is back unless its store was re-tagged for that item
  -- since.
  if exists (
    select 1
    from migration_106.c2_tag_changes tc
    join migration_106.location_items_before_c2 b on b.id = tc.id
    where tc.new_section is null
      and not exists (select 1 from public.location_items x
                      where x.id = tc.id
                         or (x.location_id = tc.location_id and x.name = tc.name))
      and exists (select 1 from public.locations loc where loc.id = tc.location_id)
  ) then
    raise exception 'FAIL: a cleared tag was not restored';
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
