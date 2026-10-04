-- Issue #89 -- Retire archiving (STOP-C). Applied ONLY after the 0.0.36
-- frontend is Live (footer `v0.0.36 · Live`), because 0.0.35 still calls
-- finish_shopping(uuid) and would get a raw "could not find the function"
-- error once it is dropped.
--
-- 1. Sweep. Cached 0.0.35 clients could still archive lists between STOP-A and
-- now (STOP-A redefined finish_shopping(uuid) to keep doing so, consistently).
-- Those lists are hidden here, but ONLY the ones nobody has touched since they
-- were archived: a full finish bumps last_activity_at to the same now() it
-- stamps archived_at with, so an untouched window-archive has
-- last_activity_at <= archived_at. A list a 0.0.36 member has since reset or
-- reused has last_activity_at > archived_at and is in use, so it stays
-- visible. Lists left visible keep archived_at set but unused (nothing reads
-- it); the reversal (issue #89, A2-2 R-A step 1 as amended in A3-2) clears it
-- for them. Pending Ant's confirmation at the STOP-C dry run; a blanket sweep
-- would drop the last condition.
--
-- 2. Drop the old one-argument finish_shopping. After this only
-- finish_shopping(uuid, text) and reset_list(uuid) exist.
--
-- 3. archived_at is deliberately KEPT, unused and unwritable (no UPDATE grant,
-- null-forced on insert by STOP-A's trigger), as the key that makes the
-- STOP-A and STOP-C sweeps reversible. This is a deliberate exception to
-- "no schema nothing reads" (docs/conventions.md); drop the column in a later
-- cleanup once the reversal window has passed.

update public.lists
set deleted_at = now()
where archived_at is not null
  and deleted_at is null
  and last_activity_at <= archived_at;

drop function public.finish_shopping(uuid);
