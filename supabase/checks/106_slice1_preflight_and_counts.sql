-- Issue #106, Slice 1: read-only checks for Ant to paste into the Supabase SQL
-- editor against project chacavfoewyiwrfgvxtj. Nothing here writes, creates or
-- locks anything. Run STATEMENT 1 and STATEMENT 2 as separate runs (the editor
-- shows only the last result), and post each JSON result on #106.
--
-- STATEMENT 1 runs BEFORE Migration A (20261008000000_item_name_fold.sql). The
-- encoding must be UTF8. The collation provider and locale are posted because
-- lower()/upper() on the running database must agree with JavaScript's; if
-- supabase/tests/item_name_fold.sql later fails on a locale-dependent case, this
-- is the evidence.
--
-- STATEMENT 2 runs AFTER Migration A (it calls public.fold_item_name and
-- public.capitalise_first). It sizes what Migrations B, C1 and C2 would change.
-- "Live" items are rows with deleted_at is null, including items on removed lists
-- (D7). "Survivor" is the earliest row by (created_at, id) (D5). Voting quorum is
-- taken as 2 voters.

-- ---------------------------------------------------------------------------
-- STATEMENT 1: pre-flight (before Migration A).
-- ---------------------------------------------------------------------------

select json_build_object(
  'ver', version(),
  'enc', current_setting('server_encoding'),
  'coll', (
    select row_to_json(d)
    from (
      select datlocprovider, datcollate
      from pg_database
      where datname = current_database()
    ) d
  ),
  'normalize_vol', (select provolatile from pg_proc where proname = 'normalize' limit 1)
);

-- ---------------------------------------------------------------------------
-- STATEMENT 2: counts (after Migration A).
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
li_groups as (
  select list_id, f,
         count(*) as n,
         sum(quantity) as qty,
         count(distinct lower(btrim(name))) as spellings,
         count(*) filter (where checked_at is not null) as ticked,
         bool_or(checked_at is not null and recorded_at is null) as has_unrecorded_tick,
         bool_or(rn = 1 and checked_at is not null and recorded_at is not null) as survivor_recorded
  from li
  where f <> ''
  group by list_id, f
  having count(*) > 1
),
lx as (
  select t.id, t.location_id, t.name, t.section, t.created_at,
         public.fold_item_name(t.name) as f,
         row_number() over (
           partition by t.location_id, public.fold_item_name(t.name)
           order by t.created_at, t.id
         ) as rn
  from public.location_items t
),
lx_groups as (
  select location_id, f, count(*) as n, count(distinct section) as sections
  from lx
  where f <> ''
  group by location_id, f
  having count(*) > 1
),
lx_survivor as (
  select location_id, f, section from lx where rn = 1
),
vt as (
  select v.location_id, v.item_name, v.proposed_section, v.voter_id,
         public.fold_item_name(v.item_name) as f
  from public.location_item_votes v
),
vt_by_name as (
  select location_id, f, item_name, proposed_section, count(distinct voter_id) as voters
  from vt
  group by location_id, f, item_name, proposed_section
),
vt_by_key as (
  select b.location_id, b.f, b.proposed_section,
         max(b.voters) as best_single,
         (select count(distinct v2.voter_id) from vt v2
           where v2.location_id = b.location_id and v2.f = b.f
             and v2.proposed_section = b.proposed_section) as merged_voters
  from vt_by_name b
  group by b.location_id, b.f, b.proposed_section
),
vt_case_only as (
  select v.item_name, t.section as current_label, v.proposed_section as proposed
  from public.location_item_votes v
  join public.location_items t
    on t.location_id = v.location_id and t.name = v.item_name
  where v.proposed_section <> t.section
    and lower(regexp_replace(btrim(v.proposed_section), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(t.section), '\s+', ' ', 'g'))
)
select json_build_object(
  'list_items', json_build_object(
    'live_items', (select count(*) from li),
    'duplicate_groups', (select count(*) from li_groups),
    'duplicate_extra_rows', (select coalesce(sum(n - 1), 0) from li_groups),
    'groups_case_or_trim_only', (select count(*) from li_groups where spellings = 1),
    'groups_fold_only', (select count(*) from li_groups where spellings > 1),
    'groups_qty_over_99', (select count(*) from li_groups where qty > 99),
    'groups_mixed_tick', (select count(*) from li_groups where ticked > 0 and ticked < n),
    'groups_d9_affected', (select count(*) from li_groups where has_unrecorded_tick and survivor_recorded),
    'empty_fold_items', (select count(*) from li where f = ''),
    'capitalise_changes_fold_key', (select count(*) from li where public.fold_item_name(cap) <> f),
    'names_changed_by_capitalise', (select count(*) from li where name <> cap),
    'names_with_curly_quotes', (select count(*) from li where name ~ '[‘’“”]')
  ),
  'location_items', json_build_object(
    'tags', (select count(*) from lx),
    'collision_groups', (select count(*) from lx_groups),
    'collision_extra_rows', (select coalesce(sum(n - 1), 0) from lx_groups),
    'collisions_with_differing_sections', (select count(*) from lx_groups where sections > 1),
    'rows_rekeyed', (select count(*) from lx where name <> f),
    'sections_changed_by_capitalise', (select count(*) from lx where section <> public.capitalise_first(section))
  ),
  'votes', json_build_object(
    'votes', (select count(*) from vt),
    'rows_rekeyed', (select count(*) from vt where item_name <> f),
    'on_losing_tags_with_differing_section_d13', (
      select count(*)
      from public.location_item_votes v
      join lx l on l.location_id = v.location_id and l.name = v.item_name and l.rn > 1
      join lx_survivor s on s.location_id = l.location_id and s.f = l.f
      where l.section <> s.section
    ),
    'orphan_after_rekey', (
      select count(*) from vt
      where not exists (select 1 from lx where lx.location_id = vt.location_id and lx.f = vt.f)
    ),
    'equal_to_current_label_after_capitalising', (
      select count(*)
      from public.location_item_votes v
      join public.location_items t
        on t.location_id = v.location_id and t.name = v.item_name
      where public.capitalise_first(v.proposed_section) = public.capitalise_first(t.section)
    ),
    'case_or_whitespace_only_count', (select count(*) from vt_case_only),
    'case_or_whitespace_only_first_200', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select distinct item_name, current_label, proposed
        from vt_case_only
        order by item_name, current_label, proposed
        limit 200
      ) x
    ),
    'tuples_reaching_2_voters_only_through_merge', (
      select count(*) from vt_by_key where merged_voters >= 2 and best_single < 2
    )
  ),
  'checkoffs', json_build_object(
    'rows_with_element_that_would_change', (
      select count(*)
      from public.location_checkoffs c
      where exists (select 1 from unnest(c.item_names) e where e <> public.fold_item_name(e))
    )
  ),
  'symptom_evidence', json_build_object(
    'live_items_on_store_lists_with_tag_missed_today_but_matched_by_fold', (
      select count(*)
      from li
      join public.lists l on l.id = li.list_id
      where l.deleted_at is null
        and l.location_id is not null
        and not exists (
          select 1 from public.location_items t
          where t.location_id = l.location_id and t.name = lower(btrim(li.name))
        )
        and exists (
          select 1 from lx where lx.location_id = l.location_id and lx.f = li.f
        )
    )
  )
);
