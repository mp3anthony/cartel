-- Issue #106, Slice 4b (Migration C2) and #155: checks for the orchestrator or Ant to
-- run against project chacavfoewyiwrfgvxtj (the Supabase MCP `execute_sql` or the SQL
-- editor), around the production run of
-- supabase/migrations/20261012000000_location_labels_votes.sql.
--
-- Every PRE and POST block below is ONE read-only statement (the editor shows only the
-- last result, so run them one at a time) and returns a single JSON value. Post each
-- result on #106 (or #155). Nothing here writes, creates or locks anything.
--
-- PRE-0 and PRE-1 COUNTS ARE ADVISORY until Migration C1 (slice 4a) is applied: before
-- it, fold merges (D5) and the votes deleted with a losing tag (D13) are still
-- counted. C1 was applied on 2026-10-10, so the counts below are now exact for the
-- data as it stands; they still move if anyone tags an item between the check and the
-- run, which is why the migration's own dry run is the last word.
--
-- RUNBOOK, in order:
--   PRE-0  (already run on 2026-10-10: 54 tags, 49 unchanged, 4 rewritten, 1 cleared,
--          1 vote deleted, 0 D6 tuples; kept here for the record and for a re-run)
--   PRE-1  counts with the FINAL map (every "must_be_zero" field must be 0; read the
--          cleared and rewritten label lists against Ant's approval)
--   PRE-2  preview, tag by tag and vote by vote
--   PRE-3  readiness (C1 applied, C2 not applied, no long transaction open)
--   PRE-4  manual: the app footer on the Live site shows 0.0.55 or higher, and the
--          Supabase dashboard, Settings, API, "Exposed schemas" lists only public and
--          graphql_public.
--   then   DRY RUN of the migration (uncomment its cartel.dry_run line; expect the
--          error "DRY RUN OK, rolled back" with a JSON summary that matches PRE-1),
--          then Ant's explicit go, then the REAL RUN
--   POST-1 structure and results (run straight after the real run, before the app
--          is used: its c2_check call will correctly fail once a user types a new
--          free-text label)
--   POST-2 run the test files (below), dry-run the revert once, then the iPhone
--          checklist on #106
--
-- The migration copies its own backups into schema migration_106 (kept 30 days after
-- the C2 run, then dropped). The PR is merged only after the real run, so main
-- matches production.

-- ---------------------------------------------------------------------------
-- PRE-0: the first read-only label count (draft synonym list, for counting only).
-- ---------------------------------------------------------------------------

with
std(label) as (values ('Fruit & Veg'),('Butchery'),('Seafood'),('Deli'),('Bakery'),('Dairy'),
  ('Chilled'),('Frozen'),('Health & Beauty'),('Pharmacy'),('Beer & Wine')),
syn(k, label) as (values
  ('fruit & vege','Fruit & Veg'),('fruit & vegetables','Fruit & Veg'),('fruit n veg','Fruit & Veg'),
  ('fruit/veg','Fruit & Veg'),('fruit & veggies','Fruit & Veg'),('produce','Fruit & Veg'),
  ('vegetables','Fruit & Veg'),('veges','Fruit & Veg'),('vege','Fruit & Veg'),('veg','Fruit & Veg'),
  ('fruit','Fruit & Veg'),('butcher','Butchery'),('meat','Butchery'),('meats','Butchery'),
  ('fish','Seafood'),('delicatessen','Deli'),('chiller','Chilled'),('chillers','Chilled'),
  ('fridge','Chilled'),('refrigerated','Chilled'),('freezer','Frozen'),('freezers','Frozen'),
  ('frozen food','Frozen'),('frozen foods','Frozen'),('health','Health & Beauty'),
  ('beauty','Health & Beauty'),('chemist','Pharmacy'),('liquor','Beer & Wine'),
  ('alcohol','Beer & Wine'),('wine','Beer & Wine'),('beer','Beer & Wine')),
v as (
  select label, sum(t)::bigint as tags, sum(p)::bigint as proposals from (
    select section as label, 1 as t, 0 as p from public.location_items
    union all
    select proposed_section, 0, 1 from public.location_item_votes) x
  group by label),
k as (
  select v.*, public.fold_item_name(v.label) as k0,
    replace(regexp_replace(public.fold_item_name(v.label),
      '^the | (section|department|dept|area|counter|aisle|isle|bay)$', '', 'g'), ' and ', ' & ') as k1
  from v),
c as (
  select k.*,
    (regexp_match(k.k0, '^(?:aisle|isle|ailse|asile) ?(?:no\.?|number|#)? ?0*([1-9][0-9]{0,2})$'))[1] as aisle_n,
    (regexp_match(k.k0, '^#?0*([1-9][0-9]{0,2})$'))[1] as bare_n,
    (select s.label from std s where public.fold_item_name(s.label) = k.k1) as std_hit,
    (select y.label from syn y where y.k = k.k1) as syn_hit
  from k),
o as (
  select r.*, case when r.target is null then 'cleared'
                   when r.target = r.label then 'unchanged' else 'rewritten' end as outcome
  from (select c.label, c.tags, c.proposals,
          case when c.std_hit is not null then 'standard'
               when c.aisle_n is not null then 'aisle'
               when c.syn_hit is not null then 'synonym_needs_ok'
               when c.bare_n is not null then 'bare_number_needs_ok'
               else 'no_match' end as rule,
          coalesce(c.std_hit, 'Aisle ' || c.aisle_n, c.syn_hit, 'Aisle ' || c.bare_n) as target
        from c) r),
vt as (
  select v.location_id, public.fold_item_name(v.item_name) as item_key, v.voter_id,
         ot.target as tag_target, op.target as prop_target
  from public.location_item_votes v
  join public.location_items li on li.location_id = v.location_id and li.name = v.item_name
  join o ot on ot.label = li.section
  join o op on op.label = v.proposed_section)
select json_build_object(
  'tags_total', (select count(*) from public.location_items),
  'tags_by_outcome', (select json_object_agg(outcome, n) from (select outcome, sum(tags) n from o group by outcome) z),
  'votes_total', (select count(*) from vt),
  'votes_deleted_tag_cleared', (select count(*) from vt where tag_target is null),
  'votes_deleted_proposal_cleared', (select count(*) from vt where tag_target is not null and prop_target is null),
  'votes_deleted_equal_after_mapping', (select count(*) from vt where tag_target is not null and prop_target = tag_target),
  'votes_kept', (select count(*) from vt where tag_target is not null and prop_target is not null and prop_target <> tag_target),
  'd6_tuples_reaching_2_voters', (select count(*) from (select 1 from vt
      where tag_target is not null and prop_target is not null and prop_target <> tag_target
      group by location_id, item_key, prop_target having count(distinct voter_id) >= 2) d),
  'labels', (select coalesce(json_agg(json_build_object('label',label,'tags',tags,'proposals',proposals,
      'outcome',outcome,'rule',rule,'target',target) order by outcome, tags desc, label), '[]'::json) from o));

-- ---------------------------------------------------------------------------
-- PRE-1: the same count with the FINAL map the migration will use (Ant's approval,
-- 2026-10-10): 15 to Aisle 15, 23 to Aisle 23, Fruit & Vegetables to Fruit & Veg,
-- Meat to Butchery; Dali (and anything else unmatched) is cleared. If the labels list
-- shows a cleared label other than the approved one, stop and ask Ant: it is new since
-- PRE-0.
-- must_be_zero fields: target_length_over_60, cleared_labels_not_approved (cleared
-- labels whose key is not in the approved-cleared list: dali).
-- The vote fields mirror the migration's order: votes on a cleared tag go; then
-- proposals that map to nothing; then duplicates after mapping (oldest kept); then
-- proposals equal to the mapped label; the rest are kept, and a kept proposal with
-- two or more voters is applied (D6) and its item's votes cleared.
-- ---------------------------------------------------------------------------

with
std(label) as (values ('Fruit & Veg'),('Butchery'),('Seafood'),('Deli'),('Bakery'),('Dairy'),
  ('Chilled'),('Frozen'),('Health & Beauty'),('Pharmacy'),('Beer & Wine')),
cmap(k, label) as (values
  ('15','Aisle 15'),('23','Aisle 23'),('fruit & vegetables','Fruit & Veg'),('meat','Butchery')),
approved_clear(k) as (values ('dali')),
v as (
  select label, sum(t)::bigint as tags, sum(p)::bigint as proposals from (
    select section as label, 1 as t, 0 as p from public.location_items
    union all
    select proposed_section, 0, 1 from public.location_item_votes) x
  group by label),
k as (
  select v.*, public.fold_item_name(v.label) as k0,
    replace(regexp_replace(public.fold_item_name(v.label),
      '^the | (section|department|dept|area|counter|aisle|isle|bay)$', '', 'g'), ' and ', ' & ') as k1
  from v),
c as (
  select k.*,
    (regexp_match(k.k0, '^(?:aisle|isle|ailse|asile) ?(?:no\.?|number|#)? ?0*([1-9][0-9]{0,2})$'))[1] as aisle_n,
    (select s.label from std s where public.fold_item_name(s.label) = k.k1) as std_hit,
    (select m.label from cmap m where m.k = k.k1) as map_hit
  from k),
o as (
  select r.*, case when r.target is null then 'cleared'
                   when r.target = r.label then 'unchanged' else 'rewritten' end as outcome
  from (select c.label, c.k1, c.tags, c.proposals,
          case when c.std_hit is not null then 'standard'
               when c.aisle_n is not null then 'aisle'
               when c.map_hit is not null then 'map'
               else 'no_match' end as rule,
          coalesce(c.std_hit, 'Aisle ' || c.aisle_n, c.map_hit) as target
        from c) r),
vt as (
  select v.id, v.location_id, v.item_name, v.voter_id, v.created_at,
         ot.target as tag_target, op.target as prop_target
  from public.location_item_votes v
  join public.location_items li on li.location_id = v.location_id and li.name = v.item_name
  join o ot on ot.label = li.section
  join o op on op.label = v.proposed_section),
vk as (
  select vt.*,
         row_number() over (partition by location_id, item_name, prop_target, voter_id
                            order by created_at, id) as rn
  from vt
  where tag_target is not null and prop_target is not null)
select json_build_object(
  'tags_total', (select count(*) from public.location_items),
  'tags_by_outcome', (select json_object_agg(outcome, n) from (select outcome, sum(tags) n from o group by outcome) z),
  'votes_total', (select count(*) from vt),
  'votes_deleted_tag_cleared', (select count(*) from vt where tag_target is null),
  'votes_deleted_proposal_unmapped', (select count(*) from vt where tag_target is not null and prop_target is null),
  'votes_deleted_duplicate', (select count(*) from vk where rn > 1),
  'votes_deleted_equal_after_mapping', (select count(*) from vk where rn = 1 and prop_target = tag_target),
  'votes_kept', (select count(*) from vk where rn = 1 and prop_target <> tag_target),
  'd6_tuples_reaching_2_voters', (select count(*) from (select 1 from vk
      where rn = 1 and prop_target <> tag_target
      group by location_id, item_name, prop_target having count(*) >= 2) d),
  'must_be_zero', json_build_object(
    'target_length_over_60', (select count(*) from o where length(target) > 60),
    'cleared_labels_not_approved', (select count(*) from o
      where outcome = 'cleared' and k1 not in (select k from approved_clear))),
  'cleared_labels', (select coalesce(json_agg(json_build_object('label', label, 'tags', tags,
      'proposals', proposals) order by label), '[]'::json) from o where outcome = 'cleared'),
  'rewritten_labels', (select coalesce(json_agg(json_build_object('label', label, 'target', target,
      'rule', rule, 'tags', tags, 'proposals', proposals) order by label), '[]'::json)
      from o where outcome = 'rewritten'),
  'unchanged_labels', (select coalesce(json_agg(json_build_object('label', label, 'tags', tags,
      'proposals', proposals) order by label), '[]'::json) from o where outcome = 'unchanged'));

-- ---------------------------------------------------------------------------
-- PRE-2: preview. changing_tags lists every tag whose label changes or is cleared
-- (store, item, current label, new label; null = cleared). vote_plan lists every
-- pending vote with what the migration will do to it. Ant spot-checks both before the
-- real run. Empty lists ([]) mean nothing to do.
-- ---------------------------------------------------------------------------

with
std(label) as (values ('Fruit & Veg'),('Butchery'),('Seafood'),('Deli'),('Bakery'),('Dairy'),
  ('Chilled'),('Frozen'),('Health & Beauty'),('Pharmacy'),('Beer & Wine')),
cmap(k, label) as (values
  ('15','Aisle 15'),('23','Aisle 23'),('fruit & vegetables','Fruit & Veg'),('meat','Butchery')),
v as (
  select distinct label from (
    select section as label from public.location_items
    union all
    select proposed_section from public.location_item_votes) x),
k as (
  select v.label, public.fold_item_name(v.label) as k0,
    replace(regexp_replace(public.fold_item_name(v.label),
      '^the | (section|department|dept|area|counter|aisle|isle|bay)$', '', 'g'), ' and ', ' & ') as k1
  from v),
o as (
  select k.label,
    coalesce(
      (select s.label from std s where public.fold_item_name(s.label) = k.k1),
      'Aisle ' || (regexp_match(k.k0, '^(?:aisle|isle|ailse|asile) ?(?:no\.?|number|#)? ?0*([1-9][0-9]{0,2})$'))[1],
      (select m.label from cmap m where m.k = k.k1)) as target
  from k),
vt as (
  select v.id, v.location_id, v.item_name, v.voter_id, v.created_at,
         li.section as current_label, v.proposed_section,
         ot.target as tag_target, op.target as prop_target
  from public.location_item_votes v
  join public.location_items li on li.location_id = v.location_id and li.name = v.item_name
  join o ot on ot.label = li.section
  join o op on op.label = v.proposed_section),
vk as (
  select vt.*,
         case when tag_target is null or prop_target is null then 0
              else row_number() over (partition by location_id, item_name, prop_target, voter_id
                                      order by created_at, id) end as rn
  from vt),
vr as (
  select vk.*,
         count(*) filter (where rn = 1 and tag_target is not null and prop_target is not null
                            and prop_target <> tag_target)
           over (partition by location_id, item_name, prop_target) as voters_on_proposal
  from vk)
select json_build_object(
  'changing_tags', (
    select coalesce(json_agg(json_build_object(
      'store', l.name, 'item', li.name, 'current', li.section, 'new', o.target
    ) order by l.name, li.name), '[]'::json)
    from public.location_items li
    join public.locations l on l.id = li.location_id
    join o on o.label = li.section
    where o.target is distinct from li.section),
  'vote_plan', (
    select coalesce(json_agg(json_build_object(
      'store', l.name, 'item', vr.item_name, 'current', vr.current_label,
      'proposal', vr.proposed_section,
      'action', case
        when vr.tag_target is null then 'delete: tag is cleared'
        when vr.prop_target is null then 'delete: proposal maps to nothing'
        when vr.rn > 1 then 'delete: duplicate after mapping'
        when vr.prop_target = vr.tag_target then 'delete: equals the current label after mapping'
        when vr.voters_on_proposal >= 2 then 'apply (D6): ' || vr.prop_target || ', then clear the item''s votes'
        else 'keep as: ' || vr.prop_target end
    ) order by l.name, vr.item_name, vr.proposed_section), '[]'::json)
    from vr join public.locations l on l.id = vr.location_id));

-- ---------------------------------------------------------------------------
-- PRE-3: readiness. Expect: slice1_functions_present true; c1_applied true; every
-- "already" field false; long_open_transactions 0 (a transaction open for over a
-- minute would make the table locks time out); vote_fn_is_c1 true; vote_fn_is_c2
-- false.
-- ---------------------------------------------------------------------------

select json_build_object(
  'slice1_functions_present',
    to_regprocedure('public.fold_item_name(text)') is not null
    and to_regprocedure('public.capitalise_first(text)') is not null,
  'c1_applied',
    to_regclass('migration_106.c1_run') is not null
    and to_regclass('migration_106.location_items_before') is not null
    and exists (
      select 1 from pg_trigger
      where tgrelid = 'public.location_items'::regclass
        and tgname = 'location_items_tidy' and not tgisinternal)
    and exists (
      select 1 from pg_constraint
      where conrelid = 'public.location_items'::regclass
        and conname = 'location_items_name_folded' and convalidated),
  'c2_run_already', to_regclass('migration_106.c2_run') is not null,
  'c2_backup_already', to_regclass('migration_106.location_items_before_c2') is not null,
  'long_open_transactions', (
    select count(*) from pg_stat_activity
    where pid <> pg_backend_pid()
      and xact_start < now() - interval '1 minute'
      and state <> 'idle'),
  'vote_fn_is_c1',
    pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
      like '%fold_item_name(p_item_name)%',
  'vote_fn_is_c2',
    pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
      like '%capitalise_first(p_proposed_section)%',
  'tags', (select count(*) from public.location_items),
  'votes', (select count(*) from public.location_item_votes),
  'db_schemas_setting_best_effort', (
    select rolconfig from pg_roles where rolname = 'authenticator')
);

-- ---------------------------------------------------------------------------
-- POST-1: after the real run, before the app is used. Expect: summary equals the dry
-- run's and PRE-1; vote_fn shows security_definer true, capitalises true, locks true,
-- anon_execute false, authenticated_execute true; non_standard_labels_now 0; both
-- schema privileges false. labels_by_store lists every label now in use per store.
-- cleared_items are the items that must be re-tagged from Shopping Mode.
-- ---------------------------------------------------------------------------

select json_build_object(
  'summary', migration_106.c2_check(null),
  'vote_fn', (
    select json_build_object(
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'folds', pg_get_functiondef(p.oid) like '%public.fold_item_name(p_item_name)%',
      'capitalises', pg_get_functiondef(p.oid) like '%public.capitalise_first(p_proposed_section)%',
      'locks', pg_get_functiondef(p.oid) ilike '%for update%',
      'anon_execute', has_function_privilege('anon', p.oid, 'execute'),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'execute'))
    from pg_proc p
    where p.oid = 'public.vote_location_item_correction(uuid, text, text)'::regprocedure),
  'non_standard_labels_now', (
    select count(*) from public.location_items
    where not migration_106.c2_is_standard(section)),
  'labels_by_store', (
    select coalesce(json_agg(json_build_object('store', l.name, 'label', z.section, 'tags', z.n)
                             order by l.name, z.section), '[]'::json)
    from (select location_id, section, count(*) as n
          from public.location_items group by location_id, section) z
    join public.locations l on l.id = z.location_id),
  'cleared_items', (
    select coalesce(json_agg(json_build_object('store', l.name, 'item', tc.name, 'old_label', tc.old_section)
                             order by l.name, tc.name), '[]'::json)
    from migration_106.c2_tag_changes tc
    join public.locations l on l.id = tc.location_id
    where tc.new_section is null),
  'applied_d6', (
    select coalesce(json_agg(json_build_object('item', a.item_name, 'from', a.old_section,
                                               'to', a.new_section, 'voters', a.voters)), '[]'::json)
    from migration_106.c2_applied a),
  'prior_vote_function_stored', (select count(*) from migration_106.c2_prior_vote_function),
  'anon_can_use_backup_schema', has_schema_privilege('anon', 'migration_106', 'usage'),
  'authenticated_can_use_backup_schema', has_schema_privilege('authenticated', 'migration_106', 'usage')
);

-- ---------------------------------------------------------------------------
-- POST-2: run each of these files in the SQL editor or through the MCP (all roll back;
-- success is silence) and post "pass" or the FAIL line on #106:
--   supabase/tests/location_labels_votes.sql
--   supabase/tests/location_labels_transform.sql   (needs schema migration_106; it
--                                                    exercises the migration's own
--                                                    functions on fixture rows)
--   supabase/tests/rls_location_item_votes.sql
--   supabase/tests/item_name_fold_locations.sql
--   supabase/tests/rls_location_items.sql
--   supabase/tests/rls_location_checkoffs.sql
-- Not affected by this slice (they do not touch labels or the vote function):
-- item_name_fold.sql, item_name_fold_lists.sql, rls_item_quantity.sql and
-- rls_finish_shopping.sql. Optional: supabase/tests/store_catalog.sql; its assertion 7
-- requires the location_items count per store to be AT LEAST the pre-flight count, and
-- C2 deletes the cleared tags, so a FAIL there is the count check, not breakage.
-- Then dry-run supabase/rollback/106_c2_revert.sql once (uncomment its cartel.dry_run
-- line; expect "DRY RUN OK, rolled back: revert would succeed"), then the iPhone
-- checklist from the plan comment on #106. Note the 4a revert
-- (106_location_items_revert.sql) no longer works once C2 has run.
-- ---------------------------------------------------------------------------
