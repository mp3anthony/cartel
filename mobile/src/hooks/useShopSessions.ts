import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadShopSessions, type ShopSessionRow } from '../lib/shopSessions';

export type ShopSessionsView =
  | { status: 'loading' }
  | { status: 'loaded'; sessions: ShopSessionRow[] }
  | { status: 'error'; message: string };

/**
 * The household's bounded shop history, load-on-mount and live-updated.
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
export function useShopSessions(client: SupabaseClient) {
  const [view, setView] = useState<ShopSessionsView>({ status: 'loading' });
  const active = useRef(true);
  const instanceId = useId();

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const outcome = await loadShopSessions(client);
    if (!active.current) {
      return;
    }
    setView(
      outcome.ok
        ? { status: 'loaded', sessions: outcome.value }
        : { status: 'error', message: outcome.message },
    );
  }, [client]);

  useEffect(() => {
    refresh();
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
