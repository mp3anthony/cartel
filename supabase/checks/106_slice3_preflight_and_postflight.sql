-- Issue #106, Slice 3 (Migration B, list side): checks for Ant to paste into the
-- Supabase SQL editor against project chacavfoewyiwrfgvxtj, around the production
-- run of supabase/migrations/20261010000000_list_items_fold.sql.
--
-- Every PRE and POST block below is ONE read-only statement (the editor shows only
-- the last result, so run them one at a time) and returns a single JSON value.
-- Post each result on #106. Nothing here writes, creates or locks anything.
--
-- RUNBOOK, in order:
--   PRE-1  counts (every "must be 0" field must be 0)
--   PRE-2  preview of what the merge will do, group by group
--   PRE-3  readiness (nothing already applied, no long transaction open)
--   PRE-4  manual: Supabase dashboard, Settings, API, "Exposed schemas" lists only
--          public and graphql_public; and the app footer on the Live site shows
--          0.0.53 or higher.
--   then   DRY RUN of the migration (uncomment its cartel.dry_run line; expect the
--          error "DRY RUN OK, rolled back" with a JSON summary), then the REAL RUN
--   POST-1 structure and results
--   POST-2 run the four test files (below), then the iPhone checklist on #106
--
-- The migration copies its own backup into schema migration_106 (kept 30 days
-- after Migration C2, then dropped). The PRs for this slice are merged only after
-- the real run, so main matches production.

-- ---------------------------------------------------------------------------
-- PRE-1: counts. Needs Migration A (fold_item_name, capitalise_first).
-- must_be_zero fields: empty_fold_items, capitalise_changes_fold_key,
-- capitalise_length_out_of_range. Any other value means stop and post it.
-- ---------------------------------------------------------------------------

with
li as (
  select i.id, i.list_id, i.name, i.quantity, i.checked_at, i.recorded_at, i.created_at,
         public.fold_item_name(i.name) as f,
         public.capitalise_first(i.name) as cap,
         row_number() over (
           partition by i.list_id, public.fold_item_name(i.name)
           order by i.created_at, i.id
         ) as rn
  from public.list_items i
  where i.deleted_at is null
),
g as (
  select list_id, f,
         count(*) as n,
         sum(quantity) as qty,
         count(*) filter (where checked_at is not null) as ticked
  from li
  group by list_id, f
  having count(*) > 1
)
select json_build_object(
  'live_items', (select count(*) from li),
  'duplicate_groups', (select count(*) from g),
  'duplicate_extra_rows', (select coalesce(sum(n - 1), 0) from g),
  'groups_qty_over_99', (select count(*) from g where qty > 99),
  'groups_mixed_tick', (select count(*) from g where ticked > 0 and ticked < n),
  'names_changed_by_capitalise', (select count(*) from li where name <> cap),
  'must_be_zero', json_build_object(
    'empty_fold_items', (select count(*) from li where f = ''),
    'capitalise_changes_fold_key', (select count(*) from li where public.fold_item_name(cap) <> f),
    'capitalise_length_out_of_range', (select count(*) from li where length(cap) not between 1 and 120)
  )
);

-- ---------------------------------------------------------------------------
-- PRE-2: merge preview. One entry per duplicate group: the survivor (oldest by
-- created_at, id), how many copies, the quantity it will end with, and whether
-- any copy is ticked. An empty list ([]) means the merge has nothing to do.
-- ---------------------------------------------------------------------------

with li as (
  select i.id, i.list_id, i.name, i.quantity, i.checked_at, i.recorded_at, i.created_at,
         public.fold_item_name(i.name) as f,
         row_number() over (
           partition by i.list_id, public.fold_item_name(i.name)
           order by i.created_at, i.id
         ) as rn
  from public.list_items i
  where i.deleted_at is null
),
g as (
  select list_id, f,
         count(*) as copies,
         sum(quantity) as qty_sum,
         bool_or(checked_at is not null) as any_ticked,
         json_agg(name order by created_at, id) as spellings
  from li
  group by list_id, f
  having count(*) > 1
)
select coalesce(json_agg(json_build_object(
  'list', l.name,
  'list_removed', l.deleted_at is not null,
  'fold_key', g.f,
  'copies', g.copies,
  'spellings', g.spellings,
  'quantity_after', least(99, g.qty_sum),
  'ticked_after', g.any_ticked
) order by l.name, g.f), '[]'::json)
from g
join public.lists l on l.id = g.list_id;

-- ---------------------------------------------------------------------------
-- PRE-3: readiness. Expect: slice1_functions_present true; every "already"
-- field false; long_open_transactions 0 (a transaction open for over a minute
-- would make the table locks time out).
-- ---------------------------------------------------------------------------

select json_build_object(
  'slice1_functions_present',
    to_regprocedure('public.fold_item_name(text)') is not null
    and to_regprocedure('public.capitalise_first(text)') is not null,
  'migration_106_schema_already', exists (select 1 from pg_namespace where nspname = 'migration_106'),
  'index_already', to_regclass('public.list_items_live_name_key') is not null,
  'trigger_already', exists (
    select 1 from pg_trigger
    where tgrelid = 'public.list_items'::regclass
      and tgname = 'list_items_tidy_name' and not tgisinternal),
  'long_open_transactions', (
    select count(*) from pg_stat_activity
    where pid <> pg_backend_pid()
      and xact_start < now() - interval '1 minute'
      and state <> 'idle'),
  'non_internal_triggers_on_list_items', (
    select coalesce(json_agg(json_build_object('trigger', tgname, 'enabled', tgenabled) order by tgname), '[]'::json)
    from pg_trigger
    where tgrelid = 'public.list_items'::regclass and not tgisinternal),
  'db_schemas_setting_best_effort', (
    select rolconfig from pg_roles where rolname = 'authenticator')
);

-- ---------------------------------------------------------------------------
-- POST-1: after the real run. Expect: the index definition names
-- (list_id, public.fold_item_name(name)) with a deleted_at is null predicate;
-- trigger_exists true; every list_items trigger enabled 'O'; merged_away equal
-- to PRE-1 duplicate_extra_rows; both schema privileges false; live_after equals
-- live_before minus merged_away.
-- ---------------------------------------------------------------------------

select json_build_object(
  'index_def', (select indexdef from pg_indexes
                where schemaname = 'public' and indexname = 'list_items_live_name_key'),
  'trigger_exists', exists (
    select 1 from pg_trigger
    where tgrelid = 'public.list_items'::regclass
      and tgname = 'list_items_tidy_name' and not tgisinternal),
  'list_items_triggers', (
    select json_agg(json_build_object('trigger', tgname, 'enabled', tgenabled) order by tgname)
    from pg_trigger
    where tgrelid = 'public.list_items'::regclass and not tgisinternal),
  'live_before', (select count(*) from migration_106.list_items_before),
  'merged_away', (select count(*) from migration_106.list_item_merges),
  'live_after', (select count(*) from public.list_items where deleted_at is null),
  'merged_lists', (
    select coalesce(json_agg(json_build_object('list', l.name, 'items_merged_away', x.n) order by l.name), '[]'::json)
    from (select list_id, count(*) as n from migration_106.list_item_merges group by list_id) x
    join public.lists l on l.id = x.list_id),
  'anon_can_use_backup_schema', has_schema_privilege('anon', 'migration_106', 'usage'),
  'authenticated_can_use_backup_schema', has_schema_privilege('authenticated', 'migration_106', 'usage'),
  'last_activity_changed_lists', (
    select count(*)
    from migration_106.lists_activity_before b
    join public.lists l on l.id = b.id
    where l.last_activity_at is distinct from b.last_activity_at)
);

-- ---------------------------------------------------------------------------
-- POST-2: run each of these files in the SQL editor (all roll back; success is
-- silence) and post "pass" or the FAIL line on #106:
--   supabase/tests/item_name_fold.sql
--   supabase/tests/item_name_fold_lists.sql
--   supabase/tests/rls_item_quantity.sql
--   supabase/tests/rls_finish_shopping.sql
-- Then the iPhone checklist from the plan comment on #106.
-- ---------------------------------------------------------------------------
