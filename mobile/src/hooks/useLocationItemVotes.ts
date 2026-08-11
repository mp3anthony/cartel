import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadLocationItemVotes, type LocationItemVoteRow } from '../lib/locationItemVotes';

export type LocationItemVotesView =
  | { status: 'loading' }
  | { status: 'loaded'; votes: LocationItemVoteRow[] }
  | { status: 'error'; message: string };

/**
 * The pending-correction vote rows recorded for one location, load-on-mount.
 *
 * No `postgres_changes` subscription — same reasoning as `useLocationItems` and
 * `useLocationCheckoffs`: `public.location_item_votes` was never added to the
 * `supabase_realtime` publication (migration 20260811000002), and this slice's
 * acceptance test reads as satisfied by a fresh `ShoppingScreen` load, not a
 * live push mid-shop. `refresh()` is how a caller picks up a vote it just cast,
 * or a correction that just got applied, same as its siblings.
 *
 * `locationId` is nullable for the identical reason `useLocationItems`'s is:
 * `ShoppingScreen` passes `list?.locationId ?? null` unconditionally, before
 * `list` itself may have resolved.
 */
export function useLocationItemVotes(client: SupabaseClient, locationId: string | null) {
  const [view, setView] = useState<LocationItemVotesView>({ status: 'loading' });
  const active = useRef(true);

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
    const outcome = await loadLocationItemVotes(client, locationId);
    if (!active.current) {
      return;
    }
    setView(
      outcome.ok
        ? { status: 'loaded', votes: outcome.value }
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
