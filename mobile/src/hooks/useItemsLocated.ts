import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { countLocationItemsCreated } from '../lib/locationItems';
import { logDiagnostic } from '../lib/logging';
import { loadPreviousShopAt } from '../lib/shopSessions';

export type ItemsLocatedView =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; count: number }
  | { status: 'error' };

/**
 * The "N items located" count for one shop (#229): Item locations created at its Store after
 * the household's previous shop there, up to this shop's finish (the first shop at a Store:
 * everything before it). Two queries, run once per open, keyed on the session id: pass `null`
 * for no open shop (or no Store to count at) and the view stays idle. `location_items` is not
 * in the realtime publication, so there is nothing to refresh. A stale response (the shop
 * changed mid-flight) and one after unmount are ignored.
 */
export function useItemsLocated(
  client: SupabaseClient,
  shop: { sessionId: string; locationId: string; completedAt: string } | null,
): ItemsLocatedView {
  const [view, setView] = useState<ItemsLocatedView>({ status: 'idle' });
  const requestSeq = useRef(0);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const sessionId = shop?.sessionId ?? null;
  const locationId = shop?.locationId ?? null;
  const completedAt = shop?.completedAt ?? null;

  useEffect(() => {
    const seq = ++requestSeq.current;

    if (sessionId === null || locationId === null || completedAt === null) {
      setView({ status: 'idle' });
      return;
    }

    setView({ status: 'loading' });

    void (async () => {
      const previous = await loadPreviousShopAt(client, locationId, completedAt);
      const counted = previous.ok
        ? await countLocationItemsCreated(client, locationId, previous.value, completedAt)
        : previous;

      if (!active.current || seq !== requestSeq.current) {
        return;
      }

      if (!counted.ok) {
        logDiagnostic('history-items-located', counted.message);
        setView({ status: 'error' });
        return;
      }

      setView({ status: 'loaded', count: counted.value });
    })();
  }, [client, sessionId, locationId, completedAt]);

  return view;
}
