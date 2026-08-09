-- Fixes a break introduced by the blanket revoke in the previous migration.
--
-- RLS policy expressions are evaluated as the querying user, not as the table owner.
-- A policy that calls a function the caller cannot execute fails with "permission
-- denied for function", so every read on all three tables was broken. The write RPCs
-- kept working, which is precisely what made it quiet — creating a household
-- succeeded and then reading it back failed.
--
-- Safe to grant: the function returns only the caller's own household id, derived
-- from their own auth.uid(). It exposes nothing they cannot already see.
--
-- generate_invite_code() stays revoked. It is only ever called from inside
-- create_invite(), which is SECURITY DEFINER and so runs as the owner.

grant execute on function public.current_household_id() to authenticated;
