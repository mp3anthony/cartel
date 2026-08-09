import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadLists, type ListRow } from '../lib/lists';

export type ListsView =
  | { status: 'loading' }
  | { status: 'loaded'; lists: ListRow[] }
  | { status: 'error'; message: string };

/**
 * The list index, loaded once and reloaded after every write.
 *
 * There are no optimistic updates here or anywhere in this slice: a mutation writes,
 * then calls `refresh`. Guessing at the result would mean two sources of truth for
 * the same rows, and Slice 3's live subscription is the point at which reconciling
 * them becomes a coherent thing to design rather than a shortcut.
 *
 * Unlike `useHousehold` this one guards against landing on an unmounted screen.
 * `refresh` is called after every add, rename, check, move and remove, so a response
 * arriving after the user has navigated away is a matter of when, not whether.
 */
export function useLists(client: SupabaseClient, enabled: boolean) {
  const [view, setView] = useState<ListsView>({ status: 'loading' });
  const active = useRef(true);

  // Declared before the loading effect so its cleanup runs first on unmount.
  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const outcome = await loadLists(client);

    if (!active.current) {
      return;
    }

    setView(
      outcome.ok
        ? { status: 'loaded', lists: outcome.value }
        : { status: 'error', message: outcome.message },
    );
  }, [client]);

  useEffect(() => {
    // Waits for the session for the same reason `useHousehold` does: RLS scopes this
    // query by auth.uid(), so running it signed-out returns no lists rather than an
    // error — indistinguishable from genuinely having none.
    if (enabled) {
      refresh();
    }
  }, [enabled, refresh]);

  return { view, refresh };
}
