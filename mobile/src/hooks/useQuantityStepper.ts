import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { adjustItemQuantity, clampQuantity, type ListItemRow } from '../lib/lists';
import type { ItemsView } from './useListItems';

/**
 * The optimistic quantity stepper shared by list detail and Shopping Mode (#111).
 *
 * Why this is not `mutate()` / `mutatingRef` / Shopping Mode's `pending` Set: a stepper is
 * tapped in bursts ("+" three times for three tins), and those guards drop a tap that
 * arrives while another write is in flight (docs/lessons.md: rapid taps are dropped, not
 * queued). A quantity tap must never be lost, and the writes are relative (`adjust_item_
 * quantity` adds +1 or -1 atomically), so two in flight at once are safe and both count.
 *
 * `shown` is an overlay of the quantity the person has asked for, per item id, so the row
 * updates at once. `shownRef` mirrors it synchronously: each tap computes from the ref, not
 * from a render's closure, so three taps in the same tick give +3 rather than +1 three
 * times over. Same overlay-and-reconcile shape as ShoppingScreen's `optimisticChecked`.
 *
 * `inFlightRef` counts the writes outstanding per item. The reconcile effect is keyed on
 * `view` alone and reads that count through the ref, for the reason spelled out beside
 * `optimisticChecked`: depending on in-flight state would re-run it at the moment a write
 * resolves, before the Realtime echo has refreshed `view`, and drop the overlay early. It
 * drops an item's entry only when nothing is in flight for it, so the screen settles on
 * whatever the server actually has, including other members' taps.
 *
 * A failed write drops that item's overlay, reports through the screen's own error
 * banner, and reloads. There is deliberately no retry: a delta is not idempotent, so after
 * an unknown outcome the first call may have committed. The person re-taps.
 *
 * `inFlightTotal` lets a screen hold back a finish or reset until every quantity write has
 * landed, so the recorded quantity matches what is on screen.
 */
export function useQuantityStepper({
  client,
  view,
  refresh,
  setError,
}: {
  client: SupabaseClient;
  view: ItemsView;
  refresh: () => Promise<unknown>;
  setError: (message: string | null) => void;
}) {
  const [shown, setShown] = useState<Map<string, number>>(new Map());
  const shownRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Map<string, number>>(new Map());
  const [inFlightTotal, setInFlightTotal] = useState(0);

  function writeShown(next: Map<string, number>) {
    shownRef.current = next;
    setShown(next);
  }

  // Reconciles the overlay against every completed refresh, from any source. Keyed on
  // `[view]` only on purpose; see the hook's comment.
  useEffect(() => {
    if (view.status !== 'loaded' || shownRef.current.size === 0) {
      return;
    }

    let changed = false;
    const next = new Map(shownRef.current);
    for (const id of shownRef.current.keys()) {
      if ((inFlightRef.current.get(id) ?? 0) === 0) {
        next.delete(id);
        changed = true;
      }
    }

    if (changed) {
      writeShown(next);
    }
  }, [view]);

  const quantityOf = useCallback(
    (item: ListItemRow): number => shown.get(item.id) ?? item.quantity,
    [shown],
  );

  async function step(item: ListItemRow, delta: 1 | -1) {
    const current = shownRef.current.get(item.id) ?? item.quantity;
    const next = clampQuantity(current + delta);

    if (next === current) {
      return;
    }

    setError(null);

    const overlay = new Map(shownRef.current);
    overlay.set(item.id, next);
    writeShown(overlay);

    inFlightRef.current.set(item.id, (inFlightRef.current.get(item.id) ?? 0) + 1);
    setInFlightTotal((total) => total + 1);

    try {
      const outcome = await adjustItemQuantity(client, item.id, delta);

      if (!outcome.ok) {
        const dropped = new Map(shownRef.current);
        dropped.delete(item.id);
        writeShown(dropped);
        setError(outcome.message);
        void refresh();
      }
    } finally {
      const remaining = (inFlightRef.current.get(item.id) ?? 1) - 1;
      if (remaining <= 0) {
        inFlightRef.current.delete(item.id);
      } else {
        inFlightRef.current.set(item.id, remaining);
      }
      setInFlightTotal((total) => Math.max(0, total - 1));
    }
  }

  return { quantityOf, step, inFlightTotal };
}
