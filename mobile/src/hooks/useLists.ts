import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadLists, type ListRow } from '../lib/lists';

export type ListsView =
  | { status: 'loading' }
  | { status: 'loaded'; lists: ListRow[] }
  | { status: 'error'; message: string };

/**
 * The list index, loaded once, reloaded after every write, and reloaded again
 * whenever a `postgres_changes` event says some other device changed a row.
 *
 * There are no optimistic updates here or anywhere in this slice: a mutation writes,
 * then calls `refresh`. Guessing at the result would mean two sources of truth for
 * the same rows. The live subscription below doesn't change that — it calls the same
 * `refresh` a manual write does, so there is still exactly one way this hook's state
 * gets set: a fresh SELECT. A write on the writer's own device can now trigger two
 * back-to-back refreshes — one from its own post-write call, one from the echo of
 * that same write arriving over the subscription — which is redundant but harmless,
 * not something worth suppressing.
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

  useEffect(() => {
    // Same `enabled` gate as the load effect above, and for the same reason: nothing
    // useful can be subscribed to before there's a session to be signed in as.
    if (!enabled) {
      return;
    }

    // No filter on this subscription, deliberately, and for the same reason
    // `loadLists()` adds none to its query: a user's visible rows are `owner_id = me
    // OR household_id = my_household`, and a `postgres_changes` filter is a single
    // `column=eq.value` expression — it cannot express that OR. Subscribing
    // unfiltered and letting RLS do the authorizing (as described in migration
    // 20260810000004) is the only shape available; adding a filter here would wrongly
    // imply this query is trusted to do its own scoping.
    //
    // `event: '*'` rather than listing `INSERT` and `UPDATE` separately: there is no
    // DELETE grant on `lists` (removal is a soft-delete UPDATE, same as everywhere
    // else in this slice), so today the two are equivalent. `'*'` just means this
    // subscription doesn't need revisiting if that ever stops being true.
    //
    // promote_to_household() fires this with no special-casing needed. It's an RPC
    // from the client's point of view, but underneath it's a plain `UPDATE
    // public.lists`, so it's logged to WAL and delivered like any other change — the
    // household member who didn't run the promotion still sees the list arrive.
    //
    // The fixed channel name 'lists-index' is safe to leave unparameterized because
    // this hook is mounted exactly once for the app's whole lifetime, in App.tsx's
    // `Bootstrapped` — there is no second instance it could collide with.
    const channel = client
      .channel('lists-index')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, () => {
        void refresh();
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, enabled, refresh]);

  return { view, refresh };
}
