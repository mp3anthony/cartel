# Supabase with RLS and Realtime, not a custom backend

Data lives in Supabase Postgres and is reached directly from the app under Row Level Security; there is no API server of our own. Plain reads and writes go straight to tables, and an RPC is used only where a write must be atomic across tables (promoting a list, the correction vote quorum, finishing a shop). Live updates use Realtime, which only fires for tables in the `supabase_realtime` publication: `lists`, `list_items` and `shop_sessions` are in it, the location tables deliberately are not (loaded on mount, refreshed after a write).

The cost is that every access rule has to be expressible as a policy or a column grant, so anything that cannot be (check-then-write across tables) needs a `security definer` function. RLS tests live in `supabase/tests/*.sql`.
