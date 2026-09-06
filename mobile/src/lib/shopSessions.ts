import type { SupabaseClient } from '@supabase/supabase-js';

import { humanise, type Outcome } from './household';

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
  itemNames: string[];
  checkedItemNames: string[];
  completedAt: string;
};

// not exported — snake_case stops at this file, same convention as every other lib file.
type ShopSessionRecord = {
  id: string;
  household_id: string | null;
  location_id: string;
  list_id: string | null;
  item_names: string[];
  checked_item_names: string[];
  completed_at: string;
};

/**
 * The household's shop-history cap. CRD says "last 5-10 completed shops";
 * 10 is chosen as the generous end of that closed range — a household seeing
 * more history is strictly more useful, and nothing in the CRD or issue
 * frames the cap as "at most" rather than "roughly this many," so any number
 * in 5-10 satisfies the acceptance test literally. Enforced by `.limit()` in
 * the loader below, not a database constraint — same "cap is a read-time
 * concern" reasoning §Slice 2 already applied to `position`.
 */
export const SHOP_SESSION_HISTORY_CAP = 10;

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
    .select('id, household_id, location_id, list_id, item_names, checked_item_names, completed_at')
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
      itemNames: row.item_names,
      checkedItemNames: row.checked_item_names,
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
 * `loadShopSessions()`: that loader's own doc comment already calls out
 * `SHOP_SESSION_HISTORY_CAP` as existing for "pick one to copy," and reusing
 * it here would silently turn a lifetime percentage into a last-10 one.
 * Selects one column and counts client-side for the same "small dataset,
 * reduce in JS" reason `loadInProgressListIds()` does (`lists.ts`) — a
 * household's full shop history is not a table `count(*) group by` needs to
 * be pushed into the database for.
 */
export async function loadShopSessionLocationCounts(
  client: SupabaseClient,
): Promise<Outcome<LocationShopCount[]>> {
  const { data, error } = await client.from('shop_sessions').select('location_id');

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
 * concept exists here (unlike `lists`' `archived_at`/`deleted_at` idiom), per
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
  bought: boolean;
};

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
 */
export function sessionItemBreakdown(
  session: Pick<ShopSessionRow, 'itemNames' | 'checkedItemNames'>,
): ShopSessionItemBreakdown[] {
  const remaining = new Map<string, number>();
  for (const name of session.checkedItemNames) {
    remaining.set(name, (remaining.get(name) ?? 0) + 1);
  }

  return session.itemNames.map((name) => {
    const left = remaining.get(name) ?? 0;
    if (left > 0) {
      remaining.set(name, left - 1);
      return { name, bought: true };
    }
    return { name, bought: false };
  });
}
