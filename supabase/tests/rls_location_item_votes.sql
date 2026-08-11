-- RLS/grant tests for public.location_item_votes and
-- public.vote_location_item_correction (Slice 8 — Location Correction Voting).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- WHAT IT IS REALLY GUARDING. `public.location_item_votes` (migration
-- 20260811000002) is the first table in this schema where every write is
-- funnelled through one `security definer` function rather than direct-to-table
-- RLS, so most of this file is about that function's behaviour rather than about
-- policies. Assertions 0-1 establish the propose/confirm-is-just-two-votes core
-- mechanic and that quorum (2 independent voters) actually applies the correction
-- to `location_items.section` and clears the vote rows. Assertion 2 checks the
-- `already_voted` rejection — the same voter cannot manufacture their own quorum.
-- Assertion 3 checks a fresh, genuinely independent second voter succeeds where
-- assertion 2's same-voter retry didn't. Assertions 4-5 check that two different
-- proposed corrections for the same item can be pending independently, and that
-- applying one via quorum wipes out the other's still-short-of-quorum vote row too
-- (the "applying one correction moots the others" rule from the migration's own
-- header). Assertion 6 checks `correction_matches_current` — proposing what is
-- already true is rejected, not accepted as a no-op. Assertion 7 checks
-- `item_not_tagged` — you cannot propose a correction for an item with no
-- existing tag to correct. Assertion 8 checks no household is required to
-- propose/confirm, matching every other table in this schema's "are you
-- authenticated" bar. Assertion 9 checks `voter_id` is genuinely unreadable by a
-- client — not merely undocumented — matching `locations.created_by`'s own
-- withheld-column precedent. Assertion 10 checks there is no INSERT policy or
-- grant at all on this table: every write must go through the function.
-- Assertion 11 checks the composite foreign key does real work against a raw
-- (bypass-role) insert. Assertion 12 checks that FK's `on delete cascade` actually
-- fires. Assertion 13 checks the two check constraints (non-empty
-- `proposed_section`, normalized `item_name`) do real enforcement work.
--
-- Fixtures are the premise, not the thing under test, so the location and
-- location_items rows are inserted as the owning role, which bypasses RLS. Only
-- the assertions run as `authenticated`. `request.jwt.claims` must be set
-- *before* the role switch: after it, the session no longer has the privilege to
-- set the GUC on some configurations, and auth.uid() reads that GUC.
--
-- State carries forward between assertions in this file — they are not
-- independent and must not be reordered.

begin;

-- ---------------------------------------------------------------------------
-- Fixtures. E, F and G share nothing — no household, no prior relationship.
-- One location L, created by E for convenience (created_by is not under test
-- here). Two pre-tagged location_items rows at L: milk (Aisle 3) and bread
-- (Aisle 1).
-- ---------------------------------------------------------------------------

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-0000000000e8', true),  -- E
  ('00000000-0000-4000-8000-0000000000f8', true),  -- F
  ('00000000-0000-4000-8000-0000000000a8', true);  -- G

insert into public.locations (id, name, lat, lng, created_by) values
  ('81000000-0000-4000-8000-000000000001',
   'Test Supermarket', -36.8485, 174.7633,
   '00000000-0000-4000-8000-0000000000e8');

insert into public.location_items (location_id, name, section) values
  ('81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 3'),
  ('81000000-0000-4000-8000-000000000001', 'bread', 'Aisle 1');

-- ---------------------------------------------------------------------------
-- Assertion 0 — positive control. As E, propose a correction for milk. This is
-- the first vote for the (milk, 'Aisle 7') tuple, so it must not reach quorum:
-- a vote row must exist, and location_items.section for milk must be
-- undisturbed.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e8","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 7');

  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'milk'
        and proposed_section = 'Aisle 7') <> 1 then
    raise exception 'FAIL: E''s proposal for (milk, Aisle 7) did not create a visible vote row';
  end if;

  if (select section from public.location_items
      where location_id = '81000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 'Aisle 3' then
    raise exception 'FAIL: location_items.section for milk changed after a single vote — quorum of 1 should never apply a correction';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — THE core property: quorum. As F, an independent second voter
-- for the same (milk, 'Aisle 7') tuple. Must succeed, must apply the
-- correction, and must clear the vote rows for milk.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f8","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 7');

  if (select section from public.location_items
      where location_id = '81000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 'Aisle 7' then
    raise exception 'FAIL: F''s independent second vote for (milk, Aisle 7) reached quorum but location_items.section was not updated';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'milk') <> 0 then
    raise exception 'FAIL: applying the (milk, Aisle 7) correction did not clear milk''s vote rows';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 2 — already_voted. E proposes a fresh tuple (milk, 'Aisle 12'),
-- then immediately calls it again identically. The second call is the same
-- voter re-voting the same tuple and must be rejected, not counted toward
-- quorum.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e8","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  msg text;
begin
  perform public.vote_location_item_correction(
    '81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 12');

  begin
    perform public.vote_location_item_correction(
      '81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 12');
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;

  if not raised then
    raise exception 'FAIL: E''s second identical vote for (milk, Aisle 12) succeeded — already_voted is not enforced';
  end if;

  if msg <> 'already_voted' then
    raise exception 'FAIL: E''s rejected re-vote raised the wrong error (%) — expected already_voted', msg;
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'milk'
        and proposed_section = 'Aisle 12') <> 1 then
    raise exception 'FAIL: expected exactly 1 vote row for (milk, Aisle 12) after E''s rejected re-vote, not 0 or 2';
  end if;

  if (select section from public.location_items
      where location_id = '81000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 'Aisle 7' then
    raise exception 'FAIL: location_items.section for milk changed even though (milk, Aisle 12) never reached genuine quorum';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 3 — a genuinely independent second voter succeeds where
-- assertion 2's same-voter retry did not. As G (never voted on this tuple),
-- confirm (milk, 'Aisle 12'). Must succeed and apply.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 12');

  if (select section from public.location_items
      where location_id = '81000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 'Aisle 12' then
    raise exception 'FAIL: G''s genuinely independent second vote for (milk, Aisle 12) did not apply the correction';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'milk') <> 0 then
    raise exception 'FAIL: applying the (milk, Aisle 12) correction did not clear milk''s vote rows';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — two different proposed corrections for the same item can be
-- pending independently. F proposes (milk, 'Aisle 20'); G proposes
-- (milk, 'Aisle 21') — two different fresh tuples, neither at quorum yet.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f8","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 20');
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 21');
end $$;

reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e8","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select section from public.location_items
      where location_id = '81000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 'Aisle 12' then
    raise exception 'FAIL: location_items.section for milk changed even though neither (milk, Aisle 20) nor (milk, Aisle 21) has reached quorum';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'milk'
        and proposed_section = 'Aisle 20') <> 1 then
    raise exception 'FAIL: expected exactly 1 vote row for (milk, Aisle 20)';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'milk'
        and proposed_section = 'Aisle 21') <> 1 then
    raise exception 'FAIL: expected exactly 1 vote row for (milk, Aisle 21)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 5 — applying one correction moots the other. E casts the
-- independent second vote for (milk, 'Aisle 20'), reaching quorum. Afterward,
-- location_items.section must be 'Aisle 20', and ALL vote rows for milk must
-- be gone — including the still-1-vote (milk, 'Aisle 21') proposal from
-- assertion 4, which never itself reached quorum.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e8","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 20');

  if (select section from public.location_items
      where location_id = '81000000-0000-4000-8000-000000000001'
        and name = 'milk') <> 'Aisle 20' then
    raise exception 'FAIL: quorum was reached on (milk, Aisle 20) but location_items.section was not updated';
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'milk') <> 0 then
    raise exception 'FAIL: applying the (milk, Aisle 20) correction did not clear ALL of milk''s vote rows — the still-pending (milk, Aisle 21) proposal was left behind';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 6 — correction_matches_current. F proposes (milk, 'Aisle 20'),
-- which is now equal to the current section. Must be rejected outright, not
-- accepted as a no-op vote.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f8","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  msg text;
begin
  begin
    perform public.vote_location_item_correction(
      '81000000-0000-4000-8000-000000000001', 'milk', 'Aisle 20');
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;

  if not raised then
    raise exception 'FAIL: proposing a correction identical to milk''s current section succeeded — correction_matches_current is not enforced';
  end if;

  if msg <> 'correction_matches_current' then
    raise exception 'FAIL: wrong error (%) raised for a no-op proposal — expected correction_matches_current', msg;
  end if;

  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'milk') <> 0 then
    raise exception 'FAIL: a rejected correction_matches_current proposal left a vote row behind';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 7 — item_not_tagged. E proposes a correction for 'eggs', which
-- has no location_items row at L at all. Must be rejected before any vote row
-- or FK check is ever reached.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000e8","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
  msg text;
begin
  begin
    perform public.vote_location_item_correction(
      '81000000-0000-4000-8000-000000000001', 'eggs', 'Aisle 5');
  exception when others then
    raised := true;
    msg := sqlerrm;
  end;

  if not raised then
    raise exception 'FAIL: proposing a correction for an untagged item (eggs) succeeded — item_not_tagged is not enforced';
  end if;

  if msg <> 'item_not_tagged' then
    raise exception 'FAIL: wrong error (%) raised for an untagged item — expected item_not_tagged', msg;
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 8 — no household required to propose/confirm. As F, who has no
-- household at all, propose a correction for bread (currently 'Aisle 1').
-- Must succeed and be visible.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f8","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.vote_location_item_correction(
    '81000000-0000-4000-8000-000000000001', 'bread', 'Aisle 2');

  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'bread'
        and proposed_section = 'Aisle 2') <> 1 then
    raise exception 'FAIL: F (no household at all) could not propose a correction for bread, or the resulting vote row is not visible';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 9 — voter_id is genuinely unreadable. As F, selecting voter_id
-- off location_item_votes must raise a permission-denied error: that column
-- is not in the SELECT grant.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f8","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    perform voter_id from public.location_item_votes where item_name = 'bread';
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: F could select voter_id off location_item_votes — this column must never be reachable by a client';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 10 — no INSERT policy or grant on this table at all. As F, a raw
-- direct insert (bypassing the function entirely) must raise.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000f8","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.location_item_votes (location_id, item_name, proposed_section, voter_id)
    values ('81000000-0000-4000-8000-000000000001', 'bread', 'Aisle 9',
            '00000000-0000-4000-8000-0000000000f8');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: F could insert directly into location_item_votes — every write must go through vote_location_item_correction, never a direct table write';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 11 — the composite foreign key does real work. As the owning
-- (bypass) role, inserting a vote for an item_name with no matching
-- location_items row at L must raise a foreign-key violation.
-- ---------------------------------------------------------------------------

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.location_item_votes (location_id, item_name, proposed_section, voter_id)
    values ('81000000-0000-4000-8000-000000000001', 'nonexistent-item', 'Aisle 1',
            '00000000-0000-4000-8000-0000000000e8');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: inserting a vote for an item with no matching location_items row succeeded — the composite foreign key (location_id, item_name) references location_items (location_id, name) is not enforced';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 12 — the composite foreign key's on delete cascade actually
-- fires. As the owning (bypass) role, deleting bread's location_items row
-- (which currently has the pending vote row from assertion 8) must take that
-- vote row with it.
-- ---------------------------------------------------------------------------

delete from public.location_items
where location_id = '81000000-0000-4000-8000-000000000001' and name = 'bread';

do $$
begin
  if (select count(*) from public.location_item_votes
      where location_id = '81000000-0000-4000-8000-000000000001'
        and item_name = 'bread') <> 0 then
    raise exception 'FAIL: deleting the bread location_items row left its pending vote row behind — on delete cascade on the composite foreign key is not working';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 13 — the two check constraints do real work. As the owning
-- (bypass) role, against the still-existing milk row: (a) an empty
-- proposed_section must raise; (b) an unnormalized item_name ('Milk') must
-- raise.
-- ---------------------------------------------------------------------------

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.location_item_votes (location_id, item_name, proposed_section, voter_id)
    values ('81000000-0000-4000-8000-000000000001', 'milk', '',
            '00000000-0000-4000-8000-0000000000e8');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: an empty proposed_section was accepted — the length(trim(proposed_section)) between 1 and 60 check constraint is not enforced';
  end if;
end $$;

do $$
declare
  raised boolean := false;
begin
  begin
    insert into public.location_item_votes (location_id, item_name, proposed_section, voter_id)
    values ('81000000-0000-4000-8000-000000000001', 'Milk', 'Aisle 30',
            '00000000-0000-4000-8000-0000000000e8');
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'FAIL: an unnormalized item_name (''Milk'') was accepted — the item_name = lower(btrim(item_name)) check constraint is not enforced';
  end if;
end $$;

rollback;
