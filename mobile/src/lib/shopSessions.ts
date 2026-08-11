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

/**
 * Records one completed shop. Takes an options object rather than positional
 * arguments — a deliberate, small deviation from this file's siblings
 * (`tagItemLocation`, `createLocation`, `recordLocationCheckoff` are all
 * positional): this call has two adjacent nullable-string parameters
 * (`householdId`, `listId`) that read identically at a call site and would
 * be easy to transpose silently if positional. Named fields remove that
 * failure mode for the price of one extra line per call.
 *
 * `ownerId` is left out on purpose, matching `createList()`'s own treatment
 * of `lists.owner_id`: the column defaults to auth.uid(), which is the same
 * value the insert policy checks it against, so a client that never names
 * the column cannot get it wrong.
 *
 * Neither array is normalized here — see the migration's header for why
 * these must keep their original casing, unlike `location_checkoffs`.
 */
export async function recordShopSession(
  client: SupabaseClient,
  params: {
    locationId: string;
    householdId: string | null;
    listId: string | null;
    itemNames: readonly string[];
    checkedItemNames: readonly string[];
  },
): Promise<Outcome<void>> {
  const { error } = await client.from('shop_sessions').insert({
    location_id: params.locationId,
    household_id: params.householdId,
    list_id: params.listId,
    item_names: [...params.itemNames],
    checked_item_names: [...params.checkedItemNames],
  });

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}
