import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadLocationItems, type LocationItemRow } from '../lib/locationItems';

export type LocationItemsView =
  | { status: 'loading' }
  | { status: 'loaded'; items: LocationItemRow[] }
  | { status: 'error'; message: string };

/**
 * The crowdsourced tags recorded for one location, load-on-mount.
 *
 * No `postgres_changes` subscription, same reasoning as `useLocations`: there is
 * no live-sync acceptance test for this slice (03-SPEC.md's acceptance test reads
 * as satisfied by a fresh load, "shopping the same location for the first time"),
 * and `public.location_items` was never added to the `supabase_realtime`
 * publication in the first place (migration 20260811000000) — the table-level
 * plumbing a subscription would need isn't there to begin with. `refresh()` is
 * how a caller picks up a tag it just wrote, same as `useLocations.refresh()`
 * picks up a location it just created.
 *
 * `locationId` is nullable, unlike every other id-keyed hook's parameter
 * (`useListItems`'s `listId`, `useLocations` takes none). It comes from
 * `list?.locationId`, and `list` itself comes from the *loaded* `lists` index —
 * a value that may not have resolved yet when `ShoppingScreen` mounts on a cold
 * deep link, the same reachable case `ListDetailScreen` already guards against
 * explicitly before it ever reads `list.locationId`. Rather than push a second
 * loading gate onto every call site, this hook accepts the not-yet-known state
 * directly: null means "don't query yet," reported back as `status: 'loading'`
 * for as long as it holds, so a caller need only pass `list?.locationId ?? null`
 * unconditionally and let this hook's own status union do the rest.
 */
export function useLocationItems(client: SupabaseClient, locationId: string | null) {
  const [view, setView] = useState<LocationItemsView>({ status: 'loading' });
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
    const outcome = await loadLocationItems(client, locationId);
    if (!active.current) {
      return;
    }
    setView(
      outcome.ok
        ? { status: 'loaded', items: outcome.value }
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
