import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadItems, type ListItemRow } from '../lib/lists';

export type ItemsView =
  | { status: 'loading' }
  | { status: 'loaded'; items: ListItemRow[] }
  | { status: 'error'; message: string };

/**
 * One list's items, in the order `loadItems` returns them.
 *
 * That order is the one every reorder control computes against — `moveItem` takes the
 * positions of the neighbours an item will land between, read from the list as
 * rendered — so nothing downstream may re-sort these rows. Grouping checked items at
 * the bottom is a render-time concern the spec allows, but it would put the rendered
 * index and the ordering index out of step, and the move would then land back in the
 * gap it came from without erroring.
 *
 * No `enabled` flag: this hook is only ever mounted by a screen the navigator renders,
 * which is already past the session gate its parent holds.
 */
export function useListItems(client: SupabaseClient, listId: string) {
  const [view, setView] = useState<ItemsView>({ status: 'loading' });
  const active = useRef(true);

  // Declared before the loading effect so its cleanup runs first on unmount.
  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const outcome = await loadItems(client, listId);

    if (!active.current) {
      return;
    }

    setView(
      outcome.ok
        ? { status: 'loaded', items: outcome.value }
        : { status: 'error', message: outcome.message },
    );
  }, [client, listId]);

  useEffect(() => {
    // `refresh` changes identity only when the list being viewed does, so this resets
    // to loading exactly then and never on the manual refresh after a write — which
    // would otherwise flash a spinner over the list on every check-off.
    setView({ status: 'loading' });
    refresh();
  }, [refresh]);

  return { view, refresh };
}
