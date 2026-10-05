import type { SupabaseClient } from '@supabase/supabase-js';

import { humanise, type Outcome } from './household';
import { retryOnJwtIssuedAtFuture } from './postgrestRetry';

/**
 * One completed shop, household-visible. `ownerId` is deliberately absent —
 * mirrors ListRow's own omission of `owner_id` in lists.ts: RLS already
 * scopes what comes back to "owner or household member," and nothing reads
 * who specifically wrote the row.
 */
export type ShopSessionRow = {
  id: string;
  householdId: string | null;
  locationId: string;
  listId: string | null;
  /** The list's name when the entry was loaded, or null when the list is gone
   * (the shop_sessions FK is `on delete set null`) or not readable. Read through
   * an embed rather than snapshotted: a rename shows up in History. */
  listName: string | null;
  itemNames: string[];
  checkedItemNames: string[];
  /** Parallel to `itemNames` (#111). Always the same length; entries from before
   * quantities existed read as 1. */
  itemQuantities: number[];
  /** Parallel to `checkedItemNames`; same rules as `itemQuantities`. */
  checkedItemQuantities: number[];
  completedAt: string;
};

// not exported — snake_case stops at this file, same convention as every other lib file.
type ShopSessionRecord = {
  id: string;
  household_id: string | null;
  location_id: string;
  list_id: string | null;
  list: { name: string } | null;
  item_names: string[];
  checked_item_names: string[];
  item_quantities: number[] | null;
  checked_item_quantities: number[] | null;
  completed_at: string;
};

/**
 * Reads a parallel quantity array. Null (a row from before #111) or an array whose length
 * does not match its names reads as all 1s, so a misaligned array can never attach the
 * wrong quantity to a name.
 */
function readQuantities(quantities: number[] | null, length: number): number[] {
  if (quantities === null || quantities.length !== length) {
    return new Array<number>(length).fill(1);
  }
  return quantities;
}

/**
 * How many shops History shows. Display-only: the donut counts every shop
 * (`loadShopSessionLocationCounts`), not just these. Enforced by `.limit()` in the
 * loader below, not a database constraint, the same "cap is a read-time concern"
 * reasoning §Slice 2 applied to `position`.
 */
export const SHOP_SESSION_HISTORY_CAP = 5;

/**
 * The bounded shop history, newest first. No `locationId` filter parameter,
 * unlike `loadLocationCheckoffs` — this table is never scoped to one
 * location; RLS alone determines what's visible (owner or household member),
 * matching `loadLists()`'s own reasoning for adding no filter of its own.
 */
export async function loadShopSessions(
  client: SupabaseClient,
): Promise<Outcome<ShopSessionRow[]>> {
  const { data, error } = await client
    .from('shop_sessions')
    .select(
      'id, household_id, location_id, list_id, list:lists(name), item_names, checked_item_names, item_quantities, checked_item_quantities, completed_at',
    )
    .order('completed_at', { ascending: false })
    .limit(SHOP_SESSION_HISTORY_CAP);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as ShopSessionRecord[];

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      householdId: row.household_id,
      locationId: row.location_id,
      listId: row.list_id,
      listName: row.list?.name ?? null,
      itemNames: row.item_names,
      checkedItemNames: row.checked_item_names,
      itemQuantities: readQuantities(row.item_quantities, row.item_names.length),
      checkedItemQuantities: readQuantities(
        row.checked_item_quantities,
        row.checked_item_names.length,
      ),
      completedAt: row.completed_at,
    })),
  };
}

/** One location's share of a household's/user's full shop history. */
export type LocationShopCount = {
  locationId: string;
  count: number;
};

/**
 * Every completed shop's `location_id`, uncounted and uncapped — the
 * Dashboard's (#22) store-frequency chart. Deliberately not
 * `loadShopSessions()`: that loader is capped at `SHOP_SESSION_HISTORY_CAP`
 * (display-only), and reusing it here would silently turn a lifetime percentage into a capped one.
 * Selects one column and counts client-side for the same "small dataset,
 * reduce in JS" reason `loadLists()`' item counts do (`lists.ts`) — a
 * household's full shop history is not a table `count(*) group by` needs to
 * be pushed into the database for.
 */
export async function loadShopSessionLocationCounts(
  client: SupabaseClient,
): Promise<Outcome<LocationShopCount[]>> {
  const { data, error } = await retryOnJwtIssuedAtFuture('shop-session-counts', () =>
    client.from('shop_sessions').select('location_id'),
  );

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as { location_id: string }[];
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.location_id, (counts.get(row.location_id) ?? 0) + 1);
  }

  return {
    ok: true,
    value: Array.from(counts, ([locationId, count]) => ({ locationId, count })),
  };
}

/**
 * Deletes one shop_sessions row. Real, permanent delete — no soft-delete
 * concept exists here (unlike `lists`' `deleted_at` soft-delete idiom), per
 * the issue's own explicit instruction. RLS (migration 20260823000002) scopes
 * this to rows the caller owns or shares a household with, same equal-rank
 * shape as every other write on this table — no client-side ownership check
 * needed before calling this.
 */
export async function deleteShopSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<Outcome<void>> {
  const { error } = await client.from('shop_sessions').delete().eq('id', sessionId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

/**
 * Deletes every shop_sessions row currently visible to the caller under RLS —
 * not just the capped page `loadShopSessions()` returns. `.not('id', 'is',
 * null)` is a filter that is always true for every row (the primary key is
 * never null); it exists only because this codebase's one other bulk-mutation
 * precedent (none, until this function) left no established way to ask
 * PostgREST for "every row RLS lets me see," and an unconditional `.delete()`
 * call with zero filter arguments reads exactly like a mistake to the next
 * person editing this file. RLS, not this filter, is what actually bounds
 * the rows affected to the caller's own visible set.
 */
export async function deleteAllShopSessions(client: SupabaseClient): Promise<Outcome<void>> {
  const { error } = await client.from('shop_sessions').delete().not('id', 'is', null);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

export type ShopSessionItemBreakdown = {
  name: string;
  /** 1..99; 1 for an entry recorded before quantities existed. */
  quantity: number;
  bought: boolean;
};

type BreakdownSource = Pick<
  ShopSessionRow,
  'itemNames' | 'checkedItemNames' | 'itemQuantities' | 'checkedItemQuantities'
>;

/**
 * Every original item in a shop session, in snapshot order, each marked
 * whether it was actually checked off during that shop. Issue #58's
 * presentational answer to "does History show a partial shop any
 * differently" — it doesn't get a separate badge; this per-item breakdown is
 * the only signal, applied uniformly to every card (a fully-completed shop's
 * card just has nothing marked).
 *
 * Counts rather than a plain `.includes()` membership test, because
 * `itemNames`/`checkedItemNames` are plain string arrays with no per-item id
 * (03-SPEC.md's shop_sessions design) — a list with two items of the same
 * name needs its bought/unbought split to track occurrence count, not just
 * "is this name anywhere in checkedItemNames," or a duplicate name would
 * either double-mark or under-mark once one occurrence was checked and the
 * other wasn't.
 *
 * A bought entry takes its quantity from `checkedItemQuantities` (what was ticked), an
 * unbought one from `itemQuantities`, each matched by the same name-occurrence order.
 */
export function sessionItemBreakdown(session: BreakdownSource): ShopSessionItemBreakdown[] {
  const remaining = new Map<string, number[]>();
  session.checkedItemNames.forEach((name, index) => {
    const queue = remaining.get(name) ?? [];
    queue.push(session.checkedItemQuantities[index] ?? 1);
    remaining.set(name, queue);
  });

  return session.itemNames.map((name, index) => {
    const bought = remaining.get(name)?.shift();
    if (bought !== undefined) {
      return { name, quantity: bought, bought: true };
    }
    return { name, quantity: session.itemQuantities[index] ?? 1, bought: false };
  });
}

/**
 * The items a shop session left unbought, in snapshot order: its `itemNames` minus
 * its `checkedItemNames`. Under Continue a session's `itemNames` already excludes
 * items an earlier store recorded, so this never lists another store's purchases.
 */
export function notBoughtItems(session: BreakdownSource): { name: string; quantity: number }[] {
  return sessionItemBreakdown(session)
    .filter((entry) => !entry.bought)
    .map((entry) => ({ name: entry.name, quantity: entry.quantity }));
}
