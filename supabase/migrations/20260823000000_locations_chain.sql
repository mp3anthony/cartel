-- #51: chain field on locations, for real brand colours on the donut chart.
-- Nullable text + check constraint, matching this table's own existing style
-- (name/lat/lng are all `not null check (...)`, not a Postgres enum type)
-- rather than introducing enum-type machinery this project doesn't
-- otherwise use. Nullable because "Other"/unset is a valid, expected,
-- common state (every location created before this migration, and every
-- future location where the shopper doesn't know/care) — NOT modeled as an
-- 'other' string value only, so a client that forgets to pass anything gets
-- null, not a magic string it has to remember to send.
alter table public.locations
  add column chain text
    check (chain is null or chain in (
      'new_world', 'paknsave', 'four_square', 'woolworths', 'freshchoice', 'other'
    ));

-- 'other' IS included as an explicit selectable value (not just null) so the
-- picker can offer "Other" as a real, distinct, intentional choice. Both
-- null and 'other' render identically (today's tint-mixed-accent look) —
-- see DonutChart.tsx and chainColors.ts.

-- Column-level SELECT grant must be extended, or `chain` silently fails to
-- come back to any client despite the column existing.
revoke select on table public.locations from authenticated;
grant select (id, name, lat, lng, created_at, chain) on table public.locations to authenticated;

-- No UPDATE grant/policy. Per #51's scope decision: chain is set at
-- creation time only. INSERT needs no grant change — the existing blanket
-- `grant insert on table public.locations to authenticated` already covers
-- inserting a value into the new column; only the check constraint above is
-- new.
