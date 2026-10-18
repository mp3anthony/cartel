# Leaving a household is one database function

Decided 2026-10-18 in #90. Vocabulary is in `docs/context/household.md`; the migration is `20261018000000_leave_household.sql`, the revert is `supabase/rollback/090_leave_household_revert.sql`, the tests are `supabase/tests/rls_leave_household.sql`.

Leaving is `public.leave_household(p_copy_lists, p_allow_delete)`, a security definer function (clients cannot write `household_members`). One transaction does everything:

- **Shared lists stay with the household; the leaver loses access.** Ownership of the leaver's shared lists (live and soft-deleted) and household shop records passes to the remaining member who joined earliest (ties by `user_id`). Only `owner_id` changes; `household_id` never does, so no shared list becomes personal (ADR 0006) and no RLS policy changes. Personal lists and personal shop records are never touched.
- **Optional copy, server-side, in the same transaction.** "Keep personal copies" creates a new personal list per live shared list (same name and store, current items with Quantity, unticked), keeping the source's `last_activity_at` so the Lists order holds. It copies lists only; shop history stays with the household.
- **The last member leaving deletes the household** by cascade: members, invites, lists and items, shop records. Irreversible, no backup. The function refuses unless `p_allow_delete` is true, checked before any write, so a stale member count on the client cannot delete a household by accident.
- **Invites are not revoked.** The leaver's unredeemed, unexpired codes stay valid for up to 24 hours (any member can invite), so the app copy says "you'll need an invite code", not "a new one".
- `redeem_invite` is redefined (same signature) to lock the household row `FOR KEY SHARE`, so a join cannot interleave with the last member leaving. Table-level lock order is the same on every path: list items, then lists, then households (the order `finish_shopping` uses). At item level a rare deadlock is still possible, because leave locks items `ORDER BY id` while `finish_shopping` and `reset_list` lock them in scan order; Postgres's deadlock detector then aborts one side with 40P01 and nothing is corrupted. The argument is in the migration header.

## Consequences

- The leaver's personal `shop_sessions` rows that pointed at a deleted shared list keep existing with a null `list_id` (`ON DELETE SET NULL`).
- A hard delete broadcasts Realtime DELETE events carrying only row ids (no RLS applies to DELETE). Accepted; the existing `shop_sessions` hard delete behaves the same way.
- The successor may be an unused anonymous profile (ghost member). Out of scope; see `CHANGE-LOG.md`.
- Join-vs-leave, leave-vs-finish and double-tap races cannot be tested in the SQL harness (each call commits alone); they rest on the lock-order argument and code review.

## Rejected

- **Rewriting every list and shop policy and `finish_shopping` / `reset_list` checks** so a row can be owned by someone outside the household: a large security surface for a cosmetic gain.
- **Client-side copy, then leave:** two round trips, not atomic; a failure between them loses the copy or the leave.
- **An orphaned household** (leave without deleting when last): rows nobody can see or reach, forever.
- **Revoking the leaver's invites on leave:** not agreed; the 24-hour window is accepted.
