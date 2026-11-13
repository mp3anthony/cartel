-- Issue #112: checks for the orchestrator to run against project chacavfoewyiwrfgvxtj
-- (the Supabase MCP `execute_sql` or the SQL editor), around the production run of
-- supabase/migrations/20261114000000_item_location_standard_labels.sql.
--
-- Each PRE and POST block below is ONE read-only statement (the editor shows only the
-- last result, so run them one at a time) and returns a single JSON value. Nothing
-- here writes, creates or locks anything. ASCII only.
--
-- RUNBOOK, in order:
--   PRE-1  readiness: non_standard_tags and non_standard_votes must both be 0,
--          vote_fn_is_c2 true, vote_fn_is_112 false, every new_object_* false,
--          long_open_transactions 0. A non-zero count lists the offending labels in
--          non_standard_samples: relabel them by row id with Ant's go first (as on
--          2026-11-14), never by editing the migration.
--   then   DRY RUN of the migration (uncomment its cartel.dry_run line; expect the
--          error "DRY RUN OK, rolled back"), then the REAL RUN
--   POST-1 structure after the real run (every field as noted on the block)
--   then   the tests: supabase/tests/item_location_labels.sql, location_labels_votes.sql,
--          rls_location_item_votes.sql, rls_location_items.sql, item_name_fold_locations.sql,
--          rls_location_checkoffs.sql, rls_finish_shopping.sql, rls_leave_household.sql,
--          store_catalog.sql (all roll back). location_labels_transform.sql is NOT run
--          (not runnable since #112). Dry-run the revert
--          (supabase/rollback/112_item_location_guard_revert.sql) once.
--
-- The standard set is written out here because the helper functions do not exist
-- before the run; it must match public.item_location_departments() in the migration.

-- ---------------------------------------------------------------------------
-- PRE-1: readiness.
-- ---------------------------------------------------------------------------

select json_build_object(
  'non_standard_tags', (
    select count(*) from public.location_items
    where not (section = any (array['Fruit & Veg', 'Butchery', 'Seafood', 'Deli', 'Bakery',
                                    'Dairy', 'Chilled', 'Frozen', 'Health & Beauty',
                                    'Pharmacy', 'Beer & Wine'])
               or section ~ '^Aisle [1-9][0-9]{0,2}$')),
  'non_standard_votes', (
    select count(*) from public.location_item_votes
    where not (proposed_section = any (array['Fruit & Veg', 'Butchery', 'Seafood', 'Deli',
                                             'Bakery', 'Dairy', 'Chilled', 'Frozen',
                                             'Health & Beauty', 'Pharmacy', 'Beer & Wine'])
               or proposed_section ~ '^Aisle [1-9][0-9]{0,2}$')),
  'non_standard_samples', (
    select coalesce(json_agg(json_build_object('kind', z.kind, 'id', z.id, 'label', z.label)
                             order by z.kind, z.label), '[]'::json)
    from (
      select 'tag' as kind, li.id, li.section as label from public.location_items li
      union all
      select 'vote', v.id, v.proposed_section from public.location_item_votes v
    ) z
    where not (z.label = any (array['Fruit & Veg', 'Butchery', 'Seafood', 'Deli', 'Bakery',
                                    'Dairy', 'Chilled', 'Frozen', 'Health & Beauty',
                                    'Pharmacy', 'Beer & Wine'])
               or z.label ~ '^Aisle [1-9][0-9]{0,2}$')),
  'vote_fn_is_c2',
    pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
      like '%public.capitalise_first(p_proposed_section)%',
  'vote_fn_is_112',
    pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
      like '%public.item_location_label(p_proposed_section)%',
  'new_object_departments_fn', to_regprocedure('public.item_location_departments()') is not null,
  'new_object_is_label_fn', to_regprocedure('public.is_item_location_label(text)') is not null,
  'new_object_label_fn', to_regprocedure('public.item_location_label(text)') is not null,
  'new_object_trigger_fn', to_regprocedure('public.location_items_standard_section()') is not null,
  'new_object_trigger', exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_standard_section'),
  'new_object_constraints', exists (
    select 1 from pg_constraint
    where conname in ('location_items_section_standard',
                      'location_item_votes_proposed_section_standard')),
  'long_open_transactions', (
    select count(*) from pg_stat_activity
    where pid <> pg_backend_pid()
      and xact_start < now() - interval '1 minute'
      and state <> 'idle'),
  'tags', (select count(*) from public.location_items),
  'votes', (select count(*) from public.location_item_votes)
);

-- ---------------------------------------------------------------------------
-- POST-1: after the real run. Expect: non_standard_tags 0, non_standard_votes 0;
-- departments the 11 in walk order; every spot check true; trigger_enabled true;
-- both constraints validated; vote_fn security_definer true, uses_label_fn true,
-- capitalises false, locks true, anon_execute false, authenticated_execute true;
-- helpers_anon_execute false, helpers_authenticated_execute true,
-- helpers_service_role_execute true; trigger_fn_authenticated_execute false.
-- ---------------------------------------------------------------------------

select json_build_object(
  'non_standard_tags', (select count(*) from public.location_items
                        where not public.is_item_location_label(section)),
  'non_standard_votes', (select count(*) from public.location_item_votes
                         where not public.is_item_location_label(proposed_section)),
  'departments', public.item_location_departments(),
  'spot_checks', json_build_object(
    'dairy section', public.item_location_label('dairy section') = 'Dairy',
    'isle 07', public.item_location_label('isle 07') = 'Aisle 7',
    'Meat', public.item_location_label('Meat') = 'Butchery',
    'Aisle 0 refused', public.item_location_label('Aisle 0') is null,
    'Cleaning refused', public.item_location_label('Cleaning') is null),
  'trigger_enabled', exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_standard_section'
      and tgenabled = 'O'),
  'constraints_validated', (
    select count(*) from pg_constraint
    where conname in ('location_items_section_standard',
                      'location_item_votes_proposed_section_standard')
      and convalidated) = 2,
  'vote_fn', (
    select json_build_object(
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'uses_label_fn', pg_get_functiondef(p.oid) like '%public.item_location_label(p_proposed_section)%',
      'capitalises', pg_get_functiondef(p.oid) like '%public.capitalise_first(p_proposed_section)%',
      'locks', pg_get_functiondef(p.oid) ilike '%for update%',
      'anon_execute', has_function_privilege('anon', p.oid, 'execute'),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'execute'))
    from pg_proc p
    where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure),
  'helpers_anon_execute',
    has_function_privilege('anon', 'public.item_location_departments()', 'execute')
    or has_function_privilege('anon', 'public.is_item_location_label(text)', 'execute')
    or has_function_privilege('anon', 'public.item_location_label(text)', 'execute'),
  'helpers_authenticated_execute',
    has_function_privilege('authenticated', 'public.item_location_departments()', 'execute')
    and has_function_privilege('authenticated', 'public.is_item_location_label(text)', 'execute')
    and has_function_privilege('authenticated', 'public.item_location_label(text)', 'execute'),
  'helpers_service_role_execute',
    has_function_privilege('service_role', 'public.item_location_departments()', 'execute')
    and has_function_privilege('service_role', 'public.is_item_location_label(text)', 'execute')
    and has_function_privilege('service_role', 'public.item_location_label(text)', 'execute'),
  'trigger_fn_authenticated_execute',
    has_function_privilege('authenticated', 'public.location_items_standard_section()', 'execute')
);
