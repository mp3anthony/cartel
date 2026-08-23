-- Issue #57 — clear shop history (per-entry and clear-all).
--
-- `shop_sessions` had no DELETE policy or grant at all until now — migration
-- 20260811000003's own header explicitly called this table "append-only by
-- design," and `rls_shop_sessions.sql` assertion 12 pinned that down
-- structurally. This migration is the deliberate, confirmed-with-the-issue
-- reversal of that stance: a household clearing its own shop history is a
-- real, wanted capability, not a gap to guard against.
--
-- Access shape mirrors this table's own SELECT policy exactly —
-- `owner_id = (select auth.uid()) or household_id = current_household_id()`
-- — the same equal-rank precedent every other household-shared table in this
-- app already gives its members (lists, locations' chain field, etc.). A
-- personal row (household_id is null) naturally stays owner-only under that
-- same predicate, unchanged from before. No new column, no per-row ownership
-- concept introduced — this is "can you see it" reused verbatim as "can you
-- delete it," matching the issue's own explicit instruction not to make this
-- table the first owner-only exception.
--
-- Deliberately still no UPDATE policy/grant — the issue only asked for
-- delete, and a shop_session's fields staying immutable once written is
-- unrelated to whether the row itself can be removed. Don't read this
-- migration as reopening that question.

create policy shop_sessions_delete_visible on public.shop_sessions
  for delete to authenticated
  using (owner_id = (select auth.uid()) or household_id = public.current_household_id());

grant delete on table public.shop_sessions to authenticated;
