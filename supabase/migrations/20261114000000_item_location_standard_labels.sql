-- Issue #112 -- database guard for Item location labels (0.0.76). The database now
-- holds Item location labels to the same standard set the app has offered since
-- 0.0.64 (#154): Fruit & Veg, Butchery, Seafood, Deli, Bakery, Dairy, Chilled,
-- Frozen, Health & Beauty, Pharmacy, Beer & Wine, or "Aisle N" (N 1..999, no leading
-- zero). Until now any text up to 60 characters was accepted, so an old cached app
-- copy could write "Cleaning" again.
--
-- Ant's decisions (2026-11-14, plan on #112):
--   D1  near-misses are fixed, everything else is refused;
--   D2  the one synonym "Meat" maps to Butchery (mirrored in the app's
--       parseLayoutLabel, mobile/src/lib/layoutOrder.ts); no other synonyms;
--   D3  the refusal message is "That isn't a standard Item location. Pick a section,
--       or Aisle 1 to 999." with errcode 23514 (check_violation). It is plain
--       English, so the app's humanise() passes it through as it is.
--
-- NO RLS OR POLICY CHANGE. NO DATA CHANGE (the guard refuses to run if any existing
-- label or proposal is non-standard; the 3 off-standard labels were relabelled by row
-- id on 2026-11-14, before this file). It REDEFINES the security-definer function
-- vote_location_item_correction (same signature, same grants), so it needs Ant's go
-- (given 2026-11-14, D4).
--
-- Applied by the orchestrator through the Supabase MCP (project chacavfoewyiwrfgvxtj),
-- never by CI. Runbook, in order:
--   PRE-1 (supabase/checks/112_item_location_guard_preflight.sql; expect 0 and 0),
--   then a DRY RUN of this file (uncomment the cartel.dry_run line right after
--   `begin`; the run must end with the error "DRY RUN OK, rolled back"), then the
--   REAL RUN (the same file with that line left commented), then POST-1, then the
--   tests: supabase/tests/item_location_labels.sql, location_labels_votes.sql,
--   rls_location_item_votes.sql, rls_location_items.sql and the other location_*
--   tests (all roll back). Apply this BEFORE the 0.0.76 app merges; it is additive for
--   every 0.0.64+ client, which only ever sends standard labels.
-- Undo: supabase/rollback/112_item_location_guard_revert.sql (never applied unless
-- needed). supabase/rollback/106_c2_revert.sql must NOT run after this migration
-- unless this one is reverted first: it re-inserts old non-standard labels, which the
-- new trigger and CHECKs refuse.
-- ASCII only (clipboard mangling lesson in docs/lessons.md). It needs Migration A
-- (20261008000000), C1 (20261011000000) and C2 (20261012000000) applied first. It
-- does not read or reference schema migration_106 (that schema is dropped later).
--
-- WHAT THIS ADDS
--   public.item_location_departments()   text[]   the 11 departments in walk order
--   public.is_item_location_label(text)  boolean  exactly a department, or "Aisle N"
--   public.item_location_label(text)     text     the standard label a text reads as,
--                                                 or null (rules below)
--   trigger location_items_standard_section, BEFORE INSERT OR UPDATE OF section on
--     location_items: stores item_location_label(section); null raises the D3 message.
--   CHECK location_items_section_standard and location_item_votes_proposed_section_
--     standard: is_item_location_label(...). A backstop: the trigger and the vote
--     function already store only standard labels. The old length checks stay.
--   vote_location_item_correction: the proposal is read with item_location_label
--     right after the not_authenticated check; null raises the D3 message. Votes get
--     the CHECK only, no trigger (the function is their only writer).
--
-- THE LABEL RULES (item_location_label; the same rules as the C2 migration's
-- c2_target_label rules 1 and 2, plus D2):
--   key   k0 = fold_item_name(text); k1 = k0 without a leading "the ", without a
--         trailing " section|department|dept|area|counter|aisle|isle|bay", with
--         " and " turned into " & ";
--   1     k1 equals the fold of a department: that department ("dairy section" to
--         Dairy, "fruit and veg" to Fruit & Veg);
--   D2    k1 is "meat": Butchery ("Meat", "meat section");
--   2     k0 reads as an aisle number ("aisle 4", "isle 07", "aisle no. 4",
--         "aisle #4", leading zeros dropped): "Aisle 4". "Aisle 0", "Aisle 1000",
--         "Aisle 4a" and a bare "Aisle" do not;
--   else  null (refused).
-- The app's parseLayoutLabel reads labels with exactly these rules; the shared cases in
-- supabase/tests/item_location_label_cases.json hold both to the same table
-- (node scripts/check-layout-order.mjs).
--
-- UNICODE NOTE. item_location_label depends on fold_item_name, which is IMMUTABLE only
-- as far as the server's Unicode tables. It is used only in the trigger and the vote
-- function, never in a CHECK or an index, so a Postgres major upgrade cannot make a
-- stored row fail its constraint; is_item_location_label (the CHECK) is a plain list
-- and regex test. After a major upgrade re-run scripts/check-item-name-parity.mjs and
-- supabase/tests/item_location_labels.sql anyway.

begin;

-- DRY RUN: uncomment the next line to run everything and roll back at the end.
-- set local cartel.dry_run = 'on';

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 0. Locks, first, so every guard below runs under them. Adding a CHECK and a
-- trigger needs ACCESS EXCLUSIVE, so it is taken on both tables once, up front, as
-- C1 did. A concurrent tag write or vote waits for the run; if one holds a lock for
-- over 5s (or a deadlock is detected) the run fails with nothing changed: run it
-- again.
-- ---------------------------------------------------------------------------

lock table public.location_items, public.location_item_votes in access exclusive mode;

-- ---------------------------------------------------------------------------
-- 0b. Guards (structure). The data guard runs once the label helpers exist (2b).
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.fold_item_name(text)') is null
     or to_regprocedure('public.capitalise_first(text)') is null then
    raise exception 'FAIL: public.fold_item_name(text) or public.capitalise_first(text) is missing; apply 20261008000000_item_name_fold.sql first';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_tidy'
      and not tgisinternal
  ) then
    raise exception 'FAIL: migration C1 is not applied (trigger location_items_tidy is missing)';
  end if;

  if pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
       not like '%public.capitalise_first(p_proposed_section)%'
     or pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure)
       not ilike '%for update%' then
    raise exception 'FAIL: vote_location_item_correction is not the C2 body (20261012000000); apply C2 first, or this migration already ran';
  end if;

  if to_regprocedure('public.item_location_departments()') is not null
     or to_regprocedure('public.is_item_location_label(text)') is not null
     or to_regprocedure('public.item_location_label(text)') is not null
     or to_regprocedure('public.location_items_standard_section()') is not null
     or exists (select 1 from pg_trigger
                where tgrelid = 'public.location_items'::regclass
                  and tgname = 'location_items_standard_section')
     or exists (select 1 from pg_constraint
                where conname in ('location_items_section_standard',
                                  'location_item_votes_proposed_section_standard')) then
    raise exception 'FAIL: #112 already applied (an item_location_* function, the trigger or a *_standard constraint exists)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Privileges snapshot.
-- ---------------------------------------------------------------------------

-- The table and existing-function privileges as they are now; compared at the end.
select set_config('cartel.g112_grants', (
  select json_agg(x.v order by x.k)::text
  from (
    select r || '|' || t || '|' || p as k,
           has_table_privilege(r, 'public.' || t, p) as v
    from unnest(array['anon', 'authenticated', 'service_role']) as r,
         unnest(array['location_items', 'location_item_votes', 'location_checkoffs']) as t,
         unnest(array['select', 'insert', 'update', 'delete']) as p
    union all
    select r || '|' || f,
           has_function_privilege(r, f, 'execute')
    from unnest(array['anon', 'authenticated', 'service_role']) as r,
         unnest(array[
           'public.vote_location_item_correction(uuid, text, text)',
           'public.item_names_are_normalized(text[])',
           'public.fold_item_name(text)',
           'public.capitalise_first(text)',
           'public.location_items_tidy()'
         ]) as f
  ) x
), true);

-- ---------------------------------------------------------------------------
-- 2. The label helpers.
-- ---------------------------------------------------------------------------

-- The 11 departments in walk order: LAYOUT_ORDER_SEQUENCE in
-- mobile/src/lib/layoutOrder.ts without 'Aisle' (scripts/check-layout-order.mjs
-- compares the two).
create function public.item_location_departments()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array['Fruit & Veg', 'Butchery', 'Seafood', 'Deli', 'Bakery', 'Dairy',
               'Chilled', 'Frozen', 'Health & Beauty', 'Pharmacy', 'Beer & Wine']::text[]
$$;

-- True only for a stored-form standard label: exactly a department, or "Aisle N"
-- (N 1..999, no leading zero; MAX_AISLE in layoutOrder.ts). False for null. No fold:
-- this is what the CHECKs use.
create function public.is_item_location_label(p text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p is not null
         and (p = any (public.item_location_departments())
              or p ~ '^Aisle [1-9][0-9]{0,2}$')
$$;

-- The standard label a text reads as, or null. See THE LABEL RULES in the header.
create function public.item_location_label(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    (select d.label
     from unnest(public.item_location_departments()) as d(label)
     where public.fold_item_name(d.label) = k.k1),
    case when k.k1 = 'meat' then 'Butchery' end,
    'Aisle ' || k.aisle_n
  )
  from (
    select replace(
             regexp_replace(b.k0,
               '^the | (section|department|dept|area|counter|aisle|isle|bay)$', '', 'g'),
             ' and ', ' & ') as k1,
           (regexp_match(b.k0,
             '^(?:aisle|isle|ailse|asile) ?(?:no\.?|number|#)? ?0*([1-9][0-9]{0,2})$'))[1] as aisle_n
    from (select public.fold_item_name(p) as k0) b
  ) k
$$;

-- The trigger and the CHECKs run as the user who writes the row, so authenticated
-- needs EXECUTE on the helpers (fold_item_name already has it). service_role is
-- granted explicitly too, so its writes are never refused for want of a grant.
revoke execute on function public.item_location_departments() from public, anon;
revoke execute on function public.is_item_location_label(text) from public, anon;
revoke execute on function public.item_location_label(text) from public, anon;
grant execute on function public.item_location_departments() to authenticated, service_role;
grant execute on function public.is_item_location_label(text) to authenticated, service_role;
grant execute on function public.item_location_label(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2b. Guard (data): nothing non-standard may be stored, or the CHECKs cannot be
-- added. Read-only; the fix is a relabel by row id with Ant's go, never this file.
-- ---------------------------------------------------------------------------

do $$
declare
  v_tags bigint := (select count(*) from public.location_items
                    where not public.is_item_location_label(section));
  v_votes bigint := (select count(*) from public.location_item_votes
                     where not public.is_item_location_label(proposed_section));
begin
  if v_tags <> 0 or v_votes <> 0 then
    raise exception 'FAIL: % tag label(s) and % pending proposal(s) are not standard; relabel them first (PRE-1 lists them)',
      v_tags, v_votes;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The trigger on location_items. It fires on INSERT (the app's tagItemLocation,
-- a direct insert under RLS, and old cached clients) and on an UPDATE of section
-- (the vote function's applies). Triggers of one timing fire in name order, so this
-- one runs before location_items_tidy; that is fine, because tidy's
-- capitalise_first leaves every standard label unchanged.
-- ---------------------------------------------------------------------------

create function public.location_items_standard_section()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_label text := public.item_location_label(new.section);
begin
  if v_label is null then
    raise exception using
      errcode = '23514',
      message = 'That isn''t a standard Item location. Pick a section, or Aisle 1 to 999.';
  end if;
  new.section := v_label;
  return new;
end;
$$;

create trigger location_items_standard_section
  before insert or update of section on public.location_items
  for each row
  execute function public.location_items_standard_section();

revoke execute on function public.location_items_standard_section() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The CHECK backstops.
-- ---------------------------------------------------------------------------

alter table public.location_items
  add constraint location_items_section_standard
  check (public.is_item_location_label(section));

alter table public.location_item_votes
  add constraint location_item_votes_proposed_section_standard
  check (public.is_item_location_label(proposed_section));

-- ---------------------------------------------------------------------------
-- 5. vote_location_item_correction(p_location_id uuid, p_item_name text,
-- p_proposed_section text). Same signature, security definer, empty search_path.
-- The ONE change from the C2 body: the proposal is read with item_location_label
-- straight after the not_authenticated check (instead of capitalise_first in the
-- declare block), and a null raises the D3 message. Reading it before the compare
-- and the count is required: otherwise "aisle 7" and "Aisle 7" would count as two
-- different proposals.
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
  v_proposed_section text;
  v_current_section text;
  v_vote_count int;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  -- #112: only a standard Item location can be proposed; near-misses are read as
  -- the standard label ("dairy section" is Dairy, "isle 07" is Aisle 7).
  v_proposed_section := public.item_location_label(p_proposed_section);
  if v_proposed_section is null then
    raise exception using
      errcode = '23514',
      message = 'That isn''t a standard Item location. Pick a section, or Aisle 1 to 999.';
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

  -- Since #112 this branch cannot be reached: every stored label and every proposal
  -- is a standard label, so two that differ only by case or spacing are equal and
  -- were refused just above. It is kept unchanged from C2 so that the revert
  -- (supabase/rollback/112_item_location_guard_revert.sql) is a plain swap.
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
-- (cartel.dry_run = 'on') the last act is a deliberate error that also rolls back.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def text := pg_get_functiondef('public.vote_location_item_correction(uuid, text, text)'::regprocedure);
  v_grants_before text := current_setting('cartel.g112_grants', true);
  v_grants_after text;
  v_fn text;
  v_case record;
begin
  -- The helpers.
  foreach v_fn in array array[
    'public.item_location_departments()', 'public.is_item_location_label(text)',
    'public.item_location_label(text)', 'public.location_items_standard_section()'
  ] loop
    if to_regprocedure(v_fn) is null then
      raise exception 'FAIL: % is missing', v_fn;
    end if;
    if coalesce((select array_to_string(p.proconfig, ',') from pg_proc p
                 where p.oid = v_fn::regprocedure), '') not like '%search_path=""%' then
      raise exception 'FAIL: % does not have search_path = ''''', v_fn;
    end if;
    if (select p.prosecdef from pg_proc p where p.oid = v_fn::regprocedure) then
      raise exception 'FAIL: % must not be security definer', v_fn;
    end if;
    if has_function_privilege('anon', v_fn, 'execute')
       or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                  where p.oid = v_fn::regprocedure and a.grantee = 0) then
      raise exception 'FAIL: anon or PUBLIC can execute %', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.item_location_departments()', 'public.is_item_location_label(text)',
    'public.item_location_label(text)'
  ] loop
    if not has_function_privilege('authenticated', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FAIL: authenticated and service_role must both be able to execute %', v_fn;
    end if;
  end loop;

  if has_function_privilege('authenticated', 'public.location_items_standard_section()', 'execute') then
    raise exception 'FAIL: authenticated can execute the trigger function location_items_standard_section';
  end if;

  if public.item_location_departments() is distinct from
       array['Fruit & Veg', 'Butchery', 'Seafood', 'Deli', 'Bakery', 'Dairy',
             'Chilled', 'Frozen', 'Health & Beauty', 'Pharmacy', 'Beer & Wine']::text[]
     or cardinality(public.item_location_departments()) <> 11 then
    raise exception 'FAIL: item_location_departments is not the 11 departments in walk order';
  end if;

  for v_case in
    select * from (values
      ('dairy section', 'Dairy'), ('isle 07', 'Aisle 7'), ('Meat', 'Butchery'),
      ('Aisle 999', 'Aisle 999'), ('fruit and veg', 'Fruit & Veg'),
      ('Aisle 0', null), ('Aisle 1000', null), ('Aisle 4a', null), ('Cleaning', null)
    ) as c(input, expected)
  loop
    if public.item_location_label(v_case.input) is distinct from v_case.expected then
      raise exception 'FAIL: item_location_label(%) is %, expected %',
        v_case.input, public.item_location_label(v_case.input), v_case.expected;
    end if;
  end loop;

  if not public.is_item_location_label('Aisle 7')
     or public.is_item_location_label('Aisle 07')
     or public.is_item_location_label('dairy')
     or public.is_item_location_label(null) then
    raise exception 'FAIL: is_item_location_label spot checks';
  end if;

  -- The trigger and the constraints.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.location_items'::regclass
      and tgname = 'location_items_standard_section'
      and not tgisinternal
      and tgenabled = 'O'
      and pg_get_triggerdef(oid) like '%BEFORE INSERT OR UPDATE OF section ON %location_items FOR EACH ROW%'
  ) then
    raise exception 'FAIL: trigger location_items_standard_section is missing, not enabled or not BEFORE INSERT OR UPDATE OF section FOR EACH ROW';
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

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.location_items'::regclass
                   and conname = 'location_items_section_standard'
                   and contype = 'c' and convalidated)
     or not exists (select 1 from pg_constraint
                    where conrelid = 'public.location_item_votes'::regclass
                      and conname = 'location_item_votes_proposed_section_standard'
                      and contype = 'c' and convalidated) then
    raise exception 'FAIL: a *_standard CHECK constraint is missing or not validated';
  end if;

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
     or v_def not like '%public.item_location_label(p_proposed_section)%'
     or v_def like '%public.capitalise_first(p_proposed_section)%'
     or v_def not ilike '%for update%' then
    raise exception 'FAIL: vote_location_item_correction does not fold the name, read the proposal with item_location_label and lock the tag';
  end if;

  if has_function_privilege('anon', 'public.vote_location_item_correction(uuid, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.vote_location_item_correction(uuid, text, text)', 'execute') then
    raise exception 'FAIL: vote_location_item_correction must be executable by authenticated only';
  end if;

  -- Table and existing-function privileges: exactly what they were.
  select json_agg(x.v order by x.k)::text into v_grants_after
  from (
    select r || '|' || t || '|' || p as k,
           has_table_privilege(r, 'public.' || t, p) as v
    from unnest(array['anon', 'authenticated', 'service_role']) as r,
         unnest(array['location_items', 'location_item_votes', 'location_checkoffs']) as t,
         unnest(array['select', 'insert', 'update', 'delete']) as p
    union all
    select r || '|' || f,
           has_function_privilege(r, f, 'execute')
    from unnest(array['anon', 'authenticated', 'service_role']) as r,
         unnest(array[
           'public.vote_location_item_correction(uuid, text, text)',
           'public.item_names_are_normalized(text[])',
           'public.fold_item_name(text)',
           'public.capitalise_first(text)',
           'public.location_items_tidy()'
         ]) as f
  ) x;

  if v_grants_before is null or v_grants_after is distinct from v_grants_before then
    raise exception 'FAIL: table or existing-function privileges changed during the run';
  end if;

  if current_setting('cartel.dry_run', true) = 'on' then
    raise exception 'DRY RUN OK, rolled back: % tags, % votes, all standard',
      (select count(*) from public.location_items),
      (select count(*) from public.location_item_votes);
  end if;
end $$;

commit;
