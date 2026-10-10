-- Issue #106, Slice 4a (Migration C1, location side): checks for Ant to paste into
-- the Supabase SQL editor against project chacavfoewyiwrfgvxtj, around the
-- production run of supabase/migrations/20261011000000_location_items_fold.sql.
--
-- Every PRE and POST block below is ONE read-only statement (the editor shows only
-- the last result, so run them one at a time) and returns a single JSON value.
-- Post each result on #106. Nothing here writes, creates or locks anything.
--
-- RUNBOOK, in order:
--   PRE-1  counts (every "must_be_zero" field must be 0; any other value: stop)
--   PRE-2  preview of what the merge and the re-key will do
--   PRE-3  readiness and the constraint inventory (nothing already applied, no long
--          transaction open, exactly one lower(btrim) CHECK on each table and one FK)
--   PRE-4  manual: the app footer on the Live site shows 0.0.54 or higher, and the
--          Supabase dashboard, Settings, API, "Exposed schemas" lists only public
--          and graphql_public.
--   then   DRY RUN of the migration (uncomment its cartel.dry_run line; expect the
--          error "DRY RUN OK, rolled back" with a JSON summary that matches PRE-1),
--          then the REAL RUN
--   POST-1 structure and results
--   POST-2 run the test files (below), dry-run the revert once, then the iPhone
--          checklist on #106
--
-- The migration copies its own backup into schema migration_106 (kept 30 days after
-- Migration C2, then dropped). The PRs for this slice are merged only after the real
-- run, so main matches production.

-- ---------------------------------------------------------------------------
-- PRE-1: counts. Needs Migration A (fold_item_name) and slice 3.
-- EXPECTATION, not yet confirmed for this slice (this PRE-1 has not been run):
-- a read-only count on 2026-10-10 suggested about 54 tags and 1 pending vote, and
-- the slice 1 pre-flight found 0 collision groups (47 tags then), so expect 0 merges
-- and 0 D13 votes. Whatever PRE-1 returns is the truth. tags_rekeyed is the number
-- of tags whose stored name changes.
-- must_be_zero fields: tag_empty_fold, tag_fold_length_out_of_range,
-- tag_fold_not_stable, vote_fold_length_out_of_range, vote_rekey_collisions,
-- vote_orphans_after_rekey, checkoff_elements_empty_fold.
-- ---------------------------------------------------------------------------

with
t as (
  select i.id, i.location_id, i.name, i.section, i.created_at,
         public.fold_item_name(i.name) as f,
         row_number() over (
           partition by i.location_id, public.fold_item_name(i.name)
           order by i.created_at, i.id
         ) as rn
  from public.location_items i
),
loser as (
  select id, location_id, name from t where rn > 1
),
vt as (
  select v.id, v.location_id, v.item_name, v.proposed_section, v.voter_id,
         public.fold_item_name(v.item_name) as f
  from public.location_item_votes v
),
vkeep as (
  select * from vt
  where not exists (
    select 1 from loser l
    where l.location_id = vt.location_id and l.name = vt.item_name
  )
)
select json_build_object(
  'tags', (select count(*) from t),
  'tags_merged_away', (select count(*) from loser),
  'tags_rekeyed', (select count(*) from t where rn = 1 and name <> f),
  'votes', (select count(*) from vt),
  'votes_on_losing_tags_d13', (select count(*) from vt) - (select count(*) from vkeep),
  'votes_rekeyed', (select count(*) from vkeep where item_name <> f),
  'checkoff_rows_changing', (
    select count(*) from public.location_checkoffs c
    where exists (
      select 1 from unnest(c.item_names) as e(x)
      where e.x <> public.fold_item_name(e.x))),
  'must_be_zero', json_build_object(
    'tag_empty_fold', (select count(*) from t where f = ''),
    'tag_fold_length_out_of_range', (select count(*) from t where length(f) not between 1 and 120),
    'tag_fold_not_stable', (select count(*) from t where public.fold_item_name(f) <> f),
    'vote_fold_length_out_of_range', (select count(*) from vt where length(f) not between 1 and 120),
    'vote_rekey_collisions', (
      select count(*) from (
        select 1 from vkeep
        group by location_id, f, proposed_section, voter_id
        having count(*) > 1) z),
    'vote_orphans_after_rekey', (
      select count(*) from vkeep k
      where not exists (
        select 1 from t
        where t.rn = 1 and t.location_id = k.location_id and t.f = k.f)),
    'checkoff_elements_empty_fold', (
      select count(*) from public.location_checkoffs c, unnest(c.item_names) as e(x)
      where public.fold_item_name(e.x) = '')
  )
);

-- ---------------------------------------------------------------------------
-- PRE-2: preview. merge_groups has one entry per fold group with more than one tag
-- (the survivor is the oldest by created_at, id; the others are hard-deleted, and
-- votes on them are deleted, D13). rekeyed_tags lists every tag whose stored name
-- changes, with the store, the old name and the new name. Empty lists ([]) mean
-- nothing to do. Ant spot-checks the rekeyed names before the real run.
-- ---------------------------------------------------------------------------

with
t as (
  select i.id, i.location_id, i.name, i.section, i.created_at,
         public.fold_item_name(i.name) as f,
         row_number() over (
           partition by i.location_id, public.fold_item_name(i.name)
           order by i.created_at, i.id
         ) as rn
  from public.location_items i
),
g as (
  select location_id, f,
         count(*) as copies,
         json_agg(json_build_object('name', name, 'section', section, 'created_at', created_at)
                  order by created_at, id) as spellings,
         (array_agg(section order by created_at, id))[1] as survivor_section,
         (select count(*) from public.location_item_votes v
          where v.location_id = t.location_id
            and v.item_name in (select x.name from t x
                                where x.location_id = t.location_id and x.f = t.f and x.rn > 1)
         ) as votes_to_delete
  from t
  group by location_id, f
  having count(*) > 1
)
select json_build_object(
  'merge_groups', (
    select coalesce(json_agg(json_build_object(
      'store', l.name,
      'fold_key', g.f,
      'copies', g.copies,
      'spellings', g.spellings,
      'survivor_section', g.survivor_section,
      'votes_to_delete', g.votes_to_delete
    ) order by l.name, g.f), '[]'::json)
    from g join public.locations l on l.id = g.location_id),
  'rekeyed_tags', (
    select coalesce(json_agg(json_build_object(
      'store', l.name,
      'old_name', t.name,
      'new_name', t.f,
      'section', t.section
    ) order by l.name, t.f), '[]'::json)
    from t join public.locations l on l.id = t.location_id
    where t.rn = 1 and t.name <> t.f)
);

-- ---------------------------------------------------------------------------
-- PRE-3: readiness and inventory. Expect: slice1_functions_present true;
-- slice3_applied true; every "already" field false; long_open_transactions 0 (a
-- transaction open for over a minute would make the table locks time out);
-- items_lower_btrim_checks 1, votes_lower_btrim_checks 1, votes_fk_to_items 1 (the
-- migration finds its three constraints by definition and fails on any other count);
-- vote_fn_uses_lower_btrim true.
-- ---------------------------------------------------------------------------

select json_build_object(
  'slice1_functions_present',
    to_regprocedure('public.fold_item_name(text)') is not null
    and to_regprocedure('public.capitalise_first(text)') is not null,
  'slice3_applied',
    to_regclass('migration_106.run') is not null
    and to_regclass('public.list_items_live_name_key') is not null,
  'c1_run_already', to_regclass('migration_106.c1_run') is not null,
  'trigger_already', exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_tidy' and not tgisinternal),
  'long_open_transactions', (
    select count(*) from pg_stat_activity
    where pid <> pg_backend_pid()
      and xact_start < now() - interval '1 minute'
      and state <> 'idle'),
  'items_lower_btrim_checks', (
    select count(*) from pg_constraint
    where conrelid = 'public.location_items'::regclass and contype = 'c'
      and strpos(pg_get_constraintdef(oid), 'lower(btrim(name))') > 0),
  'votes_lower_btrim_checks', (
    select count(*) from pg_constraint
    where conrelid = 'public.location_item_votes'::regclass and contype = 'c'
      and strpos(pg_get_constraintdef(oid), 'lower(btrim(item_name))') > 0),
  'votes_fk_to_items', (
    select count(*) from pg_constraint
    where conrelid = 'public.location_item_votes'::regclass and contype = 'f'
      and confrelid = 'public.location_items'::regclass),
  'constraints', (
    select json_agg(json_build_object(
      'table', conrelid::regclass::text, 'name', conname,
      'type', contype, 'def', pg_get_constraintdef(oid)
    ) order by conrelid::regclass::text, conname)
    from pg_constraint
    where conrelid in ('public.location_items'::regclass,
                       'public.location_item_votes'::regclass,
                       'public.location_checkoffs'::regclass)),
  'non_internal_triggers', (
    select coalesce(json_agg(json_build_object(
      'table', tgrelid::regclass::text, 'trigger', tgname, 'enabled', tgenabled
    ) order by tgrelid::regclass::text, tgname), '[]'::json)
    from pg_trigger
    where tgrelid in ('public.location_items'::regclass,
                      'public.location_item_votes'::regclass,
                      'public.location_checkoffs'::regclass)
      and not tgisinternal),
  'vote_fn_uses_lower_btrim',
    pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
      like '%lower(btrim(p_item_name))%',
  'db_schemas_setting_best_effort', (
    select rolconfig from pg_roles where rolname = 'authenticator')
);

-- ---------------------------------------------------------------------------
-- POST-1: after the real run. Expect: items_constraints shows
-- location_items_name_folded (no lower(btrim) CHECK); votes_constraints shows
-- location_item_votes_item_name_folded and the foreign key (ON DELETE CASCADE) under
-- its old name; trigger_exists true with enabled 'O'; the counts equal PRE-1; both
-- schema privileges false; vote_fn_folds true; normalized_fn_uses_fold true.
-- ---------------------------------------------------------------------------

select json_build_object(
  'items_constraints', (
    select json_agg(json_build_object('name', conname, 'type', contype,
                                       'validated', convalidated,
                                       'def', pg_get_constraintdef(oid)) order by conname)
    from pg_constraint
    where conrelid = 'public.location_items'::regclass and contype in ('c', 'u')),
  'votes_constraints', (
    select json_agg(json_build_object('name', conname, 'type', contype,
                                       'validated', convalidated,
                                       'def', pg_get_constraintdef(oid)) order by conname)
    from pg_constraint
    where conrelid = 'public.location_item_votes'::regclass and contype in ('c', 'f', 'u')),
  'trigger', (
    select json_build_object('exists', true, 'enabled', tgenabled, 'def', pg_get_triggerdef(oid))
    from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_tidy' and not tgisinternal),
  'tags_before', (select count(*) from migration_106.location_items_before),
  'tags_merged_away', (select count(*) from migration_106.location_item_merges),
  'tags_after', (select count(*) from public.location_items),
  'tags_rekeyed', (
    select count(*) from migration_106.location_items_before b
    join public.location_items l on l.id = b.id where l.name <> b.name),
  'votes_before', (select count(*) from migration_106.location_item_votes_before),
  'votes_deleted_losing_tag', (select count(*) from migration_106.location_item_votes_deleted),
  'votes_after', (select count(*) from public.location_item_votes),
  'checkoffs_changed', (
    select count(*) from migration_106.location_checkoffs_before b
    join public.location_checkoffs c on c.id = b.id
    where c.item_names is distinct from b.item_names),
  'dropped_constraints_logged', (select count(*) from migration_106.c1_dropped_constraints),
  'anon_can_use_backup_schema', has_schema_privilege('anon', 'migration_106', 'usage'),
  'authenticated_can_use_backup_schema', has_schema_privilege('authenticated', 'migration_106', 'usage'),
  'vote_fn_folds',
    pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
      like '%fold_item_name(p_item_name)%',
  'normalized_fn_uses_fold',
    pg_get_functiondef('public.item_names_are_normalized(text[])'::regprocedure)
      like '%fold_item_name%'
);

-- ---------------------------------------------------------------------------
-- POST-2: run each of these files in the SQL editor (all roll back; success is
-- silence) and post "pass" or the FAIL line on #106:
--   supabase/tests/item_name_fold.sql
--   supabase/tests/item_name_fold_locations.sql
--   supabase/tests/item_name_fold_lists.sql
--   supabase/tests/rls_location_items.sql
--   supabase/tests/rls_location_item_votes.sql
--   supabase/tests/rls_location_checkoffs.sql
--   supabase/tests/rls_item_quantity.sql
--   supabase/tests/rls_finish_shopping.sql   (choose "Run without RLS" in the dialog)
-- Optional: supabase/tests/store_catalog.sql. Its assertion 7 requires the
-- location_items and location_checkoffs counts per store to be AT LEAST the
-- pre-flight counts; a real merge lowers them, so a FAIL there after a run that
-- merged tags is the count check, not breakage (PRE-1 expects 0 merges).
-- Then dry-run supabase/rollback/106_location_items_revert.sql once (uncomment its
-- cartel.dry_run line; expect "DRY RUN OK, rolled back: revert would succeed"), then
-- the iPhone checklist from the plan comment on #106.
-- ---------------------------------------------------------------------------
