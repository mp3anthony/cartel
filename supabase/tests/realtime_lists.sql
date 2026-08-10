-- Confirms lists/list_items are members of supabase_realtime after migration
-- 20260810000004. This does not and cannot test that events actually arrive over a
-- socket — that's the live two-session check. It only catches a migration that
-- silently targeted the wrong publication/schema/table name.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lists'
  ) then
    raise exception 'FAIL: public.lists is not in the supabase_realtime publication';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'list_items'
  ) then
    raise exception 'FAIL: public.list_items is not in the supabase_realtime publication';
  end if;
end $$;
