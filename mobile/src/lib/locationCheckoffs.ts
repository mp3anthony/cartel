import type { SupabaseClient } from '@supabase/supabase-js';

import { humanise, type Outcome } from './household';
import { normalizeItemName, type LocationItemRow } from './locationItems';

/**
 * One completed shop at a location: the normalized item names checked off,
 * in the order they were checked, paired with when the shop finished.
 * `id`/`completedAt` are the row's own identity and timestamp — there is no
 * creator field anywhere on this type, because there is none on the table it
 * comes from (migration 20260811000001): `public.location_checkoffs`
 * collects an order, never who walked it.
 */
export type LocationCheckoffRow = {
  id: string;
  itemNames: string[];
  completedAt: string;
};

// not exported — snake_case stops at this file, same convention as locationItems.ts
type LocationCheckoffRecord = {
  id: string;
  item_names: string[];
  completed_at: string;
};

/**
 * Every completed shop recorded for one location, in no particular order —
 * callers (`computeRouteOrder`) fold this list into per-name and per-section
 * averages rather than reading it in sequence, so there is nothing an
 * ordering would buy.
 */
export async function loadLocationCheckoffs(
  client: SupabaseClient,
  locationId: string,
): Promise<Outcome<LocationCheckoffRow[]>> {
  const { data, error } = await client
    .from('location_checkoffs')
    .select('id, item_names, completed_at')
    .eq('location_id', locationId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as LocationCheckoffRecord[];

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      itemNames: row.item_names,
      completedAt: row.completed_at,
    })),
  };
}

/**
 * Records one completed shop at a location: the item names checked off,
 * normalized, in the order `orderedCheckedItemNames` determined.
 *
 * Normalizes every entry itself via `normalizeItemName`, matching
 * `tagItemLocation`'s convention of normalizing internally rather than
 * trusting the caller to have done it. Unlike `tagItemLocation`, no error
 * code is special-cased — there is no unique constraint on this table, no
 * race to swallow (see migration 20260811000001's header), so every error
 * surfaces via `humanise()` normally.
 */
export async function recordLocationCheckoff(
  client: SupabaseClient,
  locationId: string,
  itemNames: readonly string[],
): Promise<Outcome<void>> {
  const { error } = await client.from('location_checkoffs').insert({
    location_id: locationId,
    item_names: itemNames.map(normalizeItemName),
  });

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

/**
 * The names of a list's checked items, in the order they were actually
 * checked off during a shop.
 *
 * `checked_at` is the only signal this app has for "when was this checked,"
 * so ascending `checked_at` is the one coherent reading of "the order
 * actually checked during that shop." Ties break on `id`, mirroring
 * `loadItems()`'s own `.order('position').order('id')` tie-break convention
 * in `mobile/src/lib/lists.ts`: two items checked at the same stored
 * timestamp need a deterministic order, and `id` is the one field guaranteed
 * to differ between them and to sort identically on every device.
 */
export function orderedCheckedItemNames<
  T extends { id: string; name: string; checkedAt: string | null },
>(items: readonly T[]): string[] {
  return items
    .filter((item): item is T & { checkedAt: string } => item.checkedAt !== null)
    .slice()
    .sort((a, b) => {
      const byCheckedAt = new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime();
      return byCheckedAt !== 0 ? byCheckedAt : a.id.localeCompare(b.id);
    })
    .map((item) => item.name);
}

/** Arithmetic mean of a non-empty array of numbers. */
function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Orders a list's items for Shopping Mode using a location's accumulated
 * check-off history and item-location tags. Design source: 03-SPEC.md §
 * Slice 7's Agreed block.
 *
 * Three-tier fallback, resolved once per item into a single sort key:
 *
 * 1. An item with its own prior check-off history at this location sorts by
 *    its mean historical position, averaged across every `location_checkoffs`
 *    row whose array contains it.
 * 2. An item with no check-off history of its own but a known
 *    `location_items` tag falls back to that section's mean position — the
 *    mean position, across the same history, of every *other* item sharing
 *    that section text.
 * 3. An item with neither signal — including every item at a location with
 *    zero history — keeps its original entry order, appended after every
 *    item that resolved a position. This is why zero-history locations
 *    produce entry order for free.
 *
 * One map-building pass, no rescans.
 */
export function computeRouteOrder<T extends { name: string }>(
  items: readonly T[],
  locationItems: readonly LocationItemRow[],
  checkoffs: readonly LocationCheckoffRow[],
): T[] {
  // 1. Every position a name has ever been checked at, across every shop.
  const positionsByName = new Map<string, number[]>();
  for (const checkoff of checkoffs) {
    checkoff.itemNames.forEach((name, index) => {
      const positions = positionsByName.get(name);
      if (positions) {
        positions.push(index);
      } else {
        positionsByName.set(name, [index]);
      }
    });
  }

  // 2. Each name's own mean position, from its own history alone.
  const ownMeanByName = new Map<string, number>();
  for (const [name, positions] of positionsByName) {
    ownMeanByName.set(name, mean(positions));
  }

  // 3. The section each name is tagged with, if any.
  const sectionByName = new Map<string, string>();
  for (const tag of locationItems) {
    sectionByName.set(tag.name, tag.section);
  }

  // 4. Every position recorded for names sharing a section, pooled together.
  // An item with its own direct history still pools into its section's
  // numbers for *other* items' fallback — this is intentional. An item that
  // itself falls back, by construction, has no entry in positionsByName, so
  // it can never pollute its own fallback average.
  const sectionPositions = new Map<string, number[]>();
  for (const [name, positions] of positionsByName) {
    const section = sectionByName.get(name);
    if (section === undefined) {
      continue;
    }
    const pooled = sectionPositions.get(section);
    if (pooled) {
      pooled.push(...positions);
    } else {
      sectionPositions.set(section, [...positions]);
    }
  }

  // 5. Each section's mean position, from the pooled history above.
  const sectionMeanBySection = new Map<string, number>();
  for (const [section, positions] of sectionPositions) {
    sectionMeanBySection.set(section, mean(positions));
  }

  // 6. One sort key per item, in original order.
  const keyed = items.map((item) => {
    const name = normalizeItemName(item.name);
    const ownMean = ownMeanByName.get(name);
    if (ownMean !== undefined) {
      return { item, key: ownMean };
    }
    const section = sectionByName.get(name);
    const sectionMean = section !== undefined ? sectionMeanBySection.get(section) : undefined;
    if (sectionMean !== undefined) {
      return { item, key: sectionMean };
    }
    return { item, key: Number.POSITIVE_INFINITY };
  });

  // 7. Stable sort ascending by key — Array.prototype.sort is spec-stable
  // since ES2019, so ties (including every unresolved item, all tied at
  // +Infinity) keep original relative/entry order for free.
  return keyed.sort((a, b) => a.key - b.key).map((entry) => entry.item);
}
