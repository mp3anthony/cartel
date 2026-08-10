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

  useEffect(() => {
    // Unlike `useLists`'s index-wide subscription, this one *can* filter on the
    // server: this hook is already scoped to exactly one list id, so there's no OR of
    // ownership and household membership to lose by narrowing the subscription to
    // `list_id=eq.${listId}` — it's the same scoping the `.eq('list_id', listId)` in
    // `loadItems()` already does, not a second, less-trustworthy copy of it.
    //
    // No `enabled` gate, for the same reason the load effect above has none: this
    // hook is only ever mounted by a screen the navigator renders, which is already
    // past the session gate its parent holds.
    //
    // Keyed on `listId` (via the channel name and the dependency array) rather than
    // mounted once like `useLists`'s subscription: this hook itself remounts fresh
    // per screen instance, and its channel must tear down and resubscribe whenever
    // the screen switches to a different list, not stay attached to the one it first
    // subscribed to.
    //
    // Current navigation never pushes a second `ListDetail` instance for the same
    // listId — nothing in this screen navigates to itself — so two subscriptions
    // colliding on the same channel name `list-items:<id>` is not reachable today.
    // Left undefended rather than solved: if it ever became reachable, two
    // identically-named channel subscriptions would have version-inconsistent
    // supabase-js behaviour, but there is nothing to design against yet.
    const channel = client
      .channel(`list-items:${listId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${listId}` },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, listId, refresh]);

  return { view, refresh };
}
