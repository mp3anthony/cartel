-- Postgres grants EXECUTE on new functions to PUBLIC by default, which the `anon`
-- role inherits. The `grant ... to authenticated` in the previous migration therefore
-- did not exclude anyone; it added a redundant grant on top of an open one.
--
-- Each function already refuses when auth.uid() is null, so this was defence in depth
-- rather than an open door — but the grant is the right place to say no, and an
-- internal check is the wrong thing to depend on for it.

revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.create_invite() from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
