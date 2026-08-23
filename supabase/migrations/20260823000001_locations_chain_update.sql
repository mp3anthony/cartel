-- #54: allow a location's `chain` to be set/changed after creation. #51
-- shipped create-time-only with no UPDATE grant/policy at all (see that
-- migration's closing comment) — this adds exactly one, scoped to the
-- `chain` column only.
--
-- Open `using (true)`, not a `created_by = auth.uid()` check like
-- `locations_insert_own`. `public.locations` has no ownership concept
-- surfaced anywhere in this app's UI (LocationsScreen.tsx's own header
-- comment calls this a hard invariant) — SELECT is already open to every
-- authenticated user (locations_select_all) and INSERT is already open to
-- any authenticated user creating a new row (locations_insert_own's check
-- only pins provenance metadata, it doesn't restrict who may insert). A
-- chain correction is exactly the kind of low-stakes, easily-reversible
-- edit that fits this table's existing openness — there is no reason to
-- make this narrower than everything else already on it. What keeps this
-- safe is the *column* scope below, not a row-ownership check: `name`,
-- `lat`, `lng` get no UPDATE grant at all, so this policy existing changes
-- nothing about their being unwritable.
create policy locations_update_chain on public.locations
  for update to authenticated
  using (true)
  with check (true);

-- Column-level grant is what actually confines the open policy above to
-- `chain` only — Postgres checks column privileges independently of RLS,
-- so an UPDATE statement naming `name`/`lat`/`lng` is rejected here even
-- though the policy's `using`/`with check` would otherwise allow the row.
grant update (chain) on table public.locations to authenticated;

-- The existing check constraint on `chain` (20260823000000) applies to
-- UPDATE the same as INSERT — no change needed here.
