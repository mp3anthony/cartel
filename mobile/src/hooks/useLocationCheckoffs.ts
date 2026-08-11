import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadLocationCheckoffs, type LocationCheckoffRow } from '../lib/locationCheckoffs';

export type LocationCheckoffsView =
  | { status: 'loading' }
  | { status: 'loaded'; checkoffs: LocationCheckoffRow[] }
  | { status: 'error'; message: string };

/**
 * The completed-shop history recorded for one location, load-on-mount.
 *
 * No `postgres_changes` subscription, same reasoning as `useLocationItems`:
 * there is no live-sync acceptance test for this slice (03-SPEC.md's
 * acceptance test reads as satisfied by a fresh load — a location
 * accumulating history across separate completed shops, not live mid-shop
 * push), and `public.location_checkoffs` was never added to the
 * `supabase_realtime` publication in the first place (migration
 * 20260811000001) — the table-level plumbing a subscription would need isn't
 * there to begin with. `refresh()` is how a caller picks up a shop it just
 * recorded, same as `useLocationItems.refresh()` picks up a tag it just
 * wrote.
 *
 * `locationId` is nullable, matching `useLocationItems`'s own contract: it
 * comes from `list?.locationId`, which may not have resolved yet when
 * `ShoppingScreen` mounts on a cold deep link. Null means "don't query yet,"
 * reported back as `status: 'loading'` for as long as it holds, so a caller
 * need only pass `list?.locationId ?? null` unconditionally and let this
 * hook's own status union do the rest.
 */
export function useLocationCheckoffs(client: SupabaseClient, locationId: string | null) {
  const [view, setView] = useState<LocationCheckoffsView>({ status: 'loading' });
  const active = useRef(true);

  // Declared before the loading effect so its cleanup runs first on unmount.
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (locationId === null) {
      return;
    }
    const outcome = await loadLocationCheckoffs(client, locationId);
    if (!active.current) {
      return;
    }
    setView(
      outcome.ok
        ? { status: 'loaded', checkoffs: outcome.value }
        : { status: 'error', message: outcome.message },
    );
  }, [client, locationId]);

  useEffect(() => {
    if (locationId === null) {
      setView({ status: 'loading' });
      return;
    }
    setView({ status: 'loading' });
    refresh();
  }, [locationId, refresh]);

  return { view, refresh };
}
