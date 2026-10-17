import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { HistoryFilter } from '../lib/historyFilter';
import { loadShopSessions, type ShopSessionRow } from '../lib/shopSessions';

export type ShopSessionsView =
  | { status: 'loading' }
  | { status: 'loaded'; sessions: ShopSessionRow[] }
  | { status: 'error'; message: string };

/**
 * The household's shop history, load-on-mount and live-updated: bounded to the latest few
 * shops, or every shop matching a History filter (#216). `filterKey` is the filter's stable
 * string (`historyFilterKey`); the effects depend on it rather than on the filter object, so a
 * re-parsed but equal filter never reloads. A change of key shows the loading state, and a
 * response for an older key is ignored.
 *
 * No filter on the subscription, for the identical reason `useLists`' own
 * doc comment gives: a caller's visible rows are `owner_id = me OR
 * household_id = my_household`, which `postgres_changes` cannot express as a
 * single filter, so this relies on RLS alone (migration 20260811000003) and
 * a bare `refresh()` on any event.
 *
 * The channel topic carries `useId()`, matching `useListItems`' fix rather
 * than `useLists`' fixed `'lists-index'` topic — `useLists` is safe
 * unparameterized only because it is mounted exactly once for the app's
 * whole lifetime, in `Bootstrapped`. `useShopSessions` is mounted by a
 * regular stack screen (`HistoryScreen`), which does not have that
 * once-only guarantee — cheap insurance against the exact "two instances,
 * one channel, second `.on()` throws" crash `useListItems`'s own header
 * documents hitting live.
 */
export function useShopSessions(
  client: SupabaseClient,
  filter: HistoryFilter | null = null,
  filterKey = '',
) {
  const [view, setView] = useState<ShopSessionsView>({ status: 'loading' });
  const active = useRef(true);
  // The latest filter, read by `refresh` so its identity depends only on the key.
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const requestSeq = useRef(0);
  const firstKey = useRef(true);
  const instanceId = useId();

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    const outcome = await loadShopSessions(client, filterRef.current);
    if (!active.current || seq !== requestSeq.current) {
      return;
    }
    setView(
      outcome.ok
        ? { status: 'loaded', sessions: outcome.value }
        : { status: 'error', message: outcome.message },
    );
  }, [client, filterKey]);

  useEffect(() => {
    if (firstKey.current) {
      firstKey.current = false;
    } else {
      setView({ status: 'loading' });
    }
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = client
      .channel(`shop-sessions:${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_sessions' }, () => {
        void refresh();
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, instanceId, refresh]);

  return { view, refresh };
}
