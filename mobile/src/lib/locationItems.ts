import type { SupabaseClient } from '@supabase/supabase-js';

import { humanise, type Outcome } from './household';

/**
 * One crowdsourced tag: an item name, normalized, paired with the section a
 * shopper found it in at one location. `id`/`createdAt` are the row's own
 * identity and timestamp — there is no creator field anywhere on this type,
 * because there is none on the table it comes from (migration 20260811000000):
 * `public.location_items` collects section text, never who left it.
 */
export type LocationItemRow = {
  id: string;
  name: string;
  section: string;
  createdAt: string;
};

/**
 * The database's spelling of the row above, kept separate rather than exported so
 * that snake_case stops at this file. `location_id` is deliberately absent — every
 * caller of `loadLocationItems` already scopes the query to one location, so
 * echoing that id back on every row would be redundant, not informative.
 */
type LocationItemRecord = {
  id: string;
  name: string;
  section: string;
  created_at: string;
};

/**
 * Trims and lowercases an item name into the form `location_items.name` is
 * stored in and matched against. The one call site for this transform, so
 * "what counts as the same item" is decided once rather than re-derived by
 * every caller that needs to compare a typed name against a stored one.
 */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Looks up the section a list item's name has already been tagged with at a
 * location, or null if nobody has tagged it there yet.
 *
 * A linear scan, not a `Map`, because callers hold this per-screen, per-render —
 * `ShoppingScreen` calls it once per visible item — and a location's tag count is
 * the same order of magnitude as its list's item count, tens not thousands.
 * Building and memoizing a `Map` would be a second cache to keep in sync with
 * `items` for a lookup cost that was never the bottleneck.
 */
export function sectionForItemName(
  items: readonly LocationItemRow[],
  itemName: string,
): string | null {
  const key = normalizeItemName(itemName);
  return items.find((item) => item.name === key)?.section ?? null;
}

/**
 * All tags recorded for one location, in no particular order — callers look a
 * single name up via `sectionForItemName` rather than reading this list in
 * sequence, so there is nothing an ordering would buy.
 */
export async function loadLocationItems(
  client: SupabaseClient,
  locationId: string,
): Promise<Outcome<LocationItemRow[]>> {
  const { data, error } = await client
    .from('location_items')
    .select('id, name, section, created_at')
    .eq('location_id', locationId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as LocationItemRecord[];

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      name: row.name,
      section: row.section,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Records that an item lives in a given section at a location.
 *
 * A bare `INSERT`, not `.upsert()` and not an insert-then-select fallback. The
 * table's `unique (location_id, name)` constraint (migration 20260811000000) is
 * the only arbitration this slice has for two shoppers racing to tag the same
 * not-yet-tagged item with different section text — first write wins. `.upsert()`
 * would make the second, losing writer overwrite the first writer's section
 * silently, which is exactly the outcome the unique constraint exists to prevent.
 * An insert-then-select fallback would work, but costs a second round trip on
 * every race for a result the caller does not need: the caller's own `refresh()`
 * after this call returns already reloads the section text from the database,
 * whichever writer actually won.
 *
 * A `23505` (unique-violation) error is therefore treated as success, not
 * failure — the item is tagged, just not necessarily with this caller's section
 * text, and there is nothing more useful to tell them than that.
 */
export async function tagItemLocation(
  client: SupabaseClient,
  locationId: string,
  itemName: string,
  section: string,
): Promise<Outcome<void>> {
  const { error } = await client.from('location_items').insert({
    location_id: locationId,
    name: normalizeItemName(itemName),
    section: section.trim(),
  });

  if (error && error.code !== '23505') {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}
