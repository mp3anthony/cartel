import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadLocations, type LocationRow } from '../lib/locations';

export type LocationsView =
  | { status: 'loading' }
  | { status: 'loaded'; locations: LocationRow[] }
  | { status: 'error'; message: string };

/**
 * The full `locations` index, load-on-mount.
 *
 * No `enabled` flag: like `useListItems`, this hook is only ever mounted by a screen
 * the navigator renders, which is already past the session gate its parent holds —
 * unlike `useHousehold`, which is reached pre-navigator and genuinely needs to wait.
 *
 * No `postgres_changes` subscription, which is the one deliberate divergence from
 * `useLists`'s shape: there is no live-sync acceptance test for this slice, so this
 * hook's load-once behaviour matches `useHousehold`'s rather than `useLists`'s. The
 * `refresh()` it exposes is how the screen picks up a location it just created.
 */
export function useLocations(client: SupabaseClient) {
  const [view, setView] = useState<LocationsView>({ status: 'loading' });
  const active = useRef(true);

  // Declared before the loading effect so its cleanup runs first on unmount.
  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const outcome = await loadLocations(client);

    if (!active.current) {
      return;
    }

    setView(
      outcome.ok
        ? { status: 'loaded', locations: outcome.value }
        : { status: 'error', message: outcome.message },
    );
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { view, refresh };
}
