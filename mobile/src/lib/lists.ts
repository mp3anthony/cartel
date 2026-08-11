import type { SupabaseClient } from '@supabase/supabase-js';
import { generateKeyBetween } from 'fractional-indexing';

import { humanise, type Outcome } from './household';

export type ListRow = {
  id: string;
  name: string;
  householdId: string | null;
  locationId: string | null;
  createdAt: string;
};

export type ListItemRow = {
  id: string;
  name: string;
  position: string;
  checkedAt: string | null;
};

/**
 * The database's spelling of the two rows above, kept separate rather than exported so
 * that snake_case stops at this file. Callers get camelCase and a column rename becomes
 * a change to one mapping function instead of a change to every screen.
 */
type ListRecord = {
  id: string;
  name: string;
  household_id: string | null;
  location_id: string | null;
  created_at: string;
};

type ListItemRecord = {
  id: string;
  name: string;
  position: string;
  checked_at: string | null;
};

/**
 * The only call into `fractional-indexing` anywhere in the app, for two reasons.
 *
 * It signals failure by throwing, not by returning — adjacent keys, a trailing zero, a
 * pair passed in the wrong order — and an uncaught throw inside a screen handler is a
 * white screen on the review surface rather than a message.
 *
 * And `digits` must never be passed. The default alphabet is the format every stored
 * `position` is already written in; passing `digits` explicitly, even the very
 * BASE_62_DIGITS the default is built from, changes the integer-head alphabet and
 * yields keys that sort against the existing ones incorrectly. That is a stored-data
 * format commitment, made once. One call site makes it something you can check rather
 * than a rule spread across nine functions and trusted.
 */
function keyBetween(before: string | null, after: string | null): Outcome<string> {
  try {
    return { ok: true, value: generateKeyBetween(before, after) };
  } catch {
    return {
      ok: false,
      message: 'Could not work out where that goes. Reload the list and try again.',
    };
  }
}

export async function loadLists(client: SupabaseClient): Promise<Outcome<ListRow[]>> {
  // RLS scopes this to lists the caller owns or shares with their household, so no
  // filter on owner or household is added here — adding one would imply the query is
  // trusted to do the scoping. It is not.
  //
  // `deleted_at` is the deliberate exception. No policy mentions it, because Realtime
  // authorises each event against the SELECT policy evaluated on the *new* row, so a
  // policy saying `deleted_at is null` would suppress the very UPDATE that performs the
  // deletion. Filtering it here is the whole of the mechanism.
  const { data, error } = await client
    .from('lists')
    .select('id, name, household_id, location_id, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as ListRecord[];

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      name: row.name,
      householdId: row.household_id,
      locationId: row.location_id,
      createdAt: row.created_at,
    })),
  };
}

export async function createList(
  client: SupabaseClient,
  name: string,
  householdId: string | null,
): Promise<Outcome<string>> {
  // `owner_id` is left out on purpose. The column defaults to auth.uid(), which is the
  // same value the insert policy checks it against, so a client that sends it can only
  // ever agree with the default or be rejected by the policy. One that never names the
  // column cannot get it wrong.
  const { data, error } = await client
    .from('lists')
    .insert({ name: name.trim(), household_id: householdId })
    .select('id')
    .single();

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: (data as { id: string }).id };
}

export async function renameList(
  client: SupabaseClient,
  listId: string,
  name: string,
): Promise<Outcome<void>> {
  // `.eq('id', ...)` names the row; it does not authorise the write. The update policy's
  // `using` clause is what decides whether the caller may touch it, and the column-level
  // grant is what stops this statement reaching `household_id` or `owner_id`.
  const { error } = await client
    .from('lists')
    .update({ name: name.trim() })
    .eq('id', listId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

export async function removeList(
  client: SupabaseClient,
  listId: string,
): Promise<Outcome<void>> {
  // Soft delete, and the only kind available: there is no DELETE policy on `lists` and
  // deliberately never will be. Supabase does not apply RLS to DELETE, so a hard delete
  // would broadcast the row's primary key to every subscriber of the table regardless of
  // household. Removal as an UPDATE is filtered like any other, and it cascades to
  // nothing — the list's items keep their own `deleted_at` untouched and simply stop
  // being reachable through a list that no longer loads.
  const { error } = await client
    .from('lists')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', listId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

export async function promoteList(
  client: SupabaseClient,
  listId: string,
): Promise<Outcome<void>> {
  // The one write in this slice that is not a direct table update. Promotion has real
  // conditions RLS cannot express in a `with check` — owner only, own household only,
  // caller must be a member, not already shared — and it is one-way, so it publishes
  // item text that was private until the moment it runs. Callers confirm before calling.
  const { error } = await client.rpc('promote_to_household', {
    target_list_id: listId,
  });

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

/**
 * Points a list at a location, or (passing null) clears the attachment. One
 * function for all three cases — attach, change, remove — because they are the
 * same UPDATE with a different value; a separate `detachLocation` would just be
 * this call with its second argument hard-coded to null.
 *
 * `.eq('id', listId)` names the row; it does not authorise the write. The existing
 * `lists_update_visible` policy already covers this column (see migration
 * 20260810000006's header) — any household member may call this, not only the
 * list's owner, matching 03-SPEC.md's "all members equal rank".
 */
export async function attachLocation(
  client: SupabaseClient,
  listId: string,
  locationId: string | null,
): Promise<Outcome<void>> {
  const { error } = await client
    .from('lists')
    .update({ location_id: locationId })
    .eq('id', listId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

export async function loadItems(
  client: SupabaseClient,
  listId: string,
): Promise<Outcome<ListItemRow[]>> {
  // Both order clauses are load-bearing. `position` is a fractional key, so two members
  // moving an item into the same gap while offline of each other can compute the *same*
  // key — that is a designed-for outcome, not a bug, and it is also what makes the
  // read-then-write in addItem() benign. `id` then breaks the tie identically on every
  // device, which is the difference between two screens agreeing and two screens
  // disagreeing about a list they are both looking at.
  //
  // The `position` column is `collate "C"`; base-62 keys only sort correctly under byte
  // order, and this database's default collation says 'a1' < 'A1' where byte order says
  // the opposite. Sorting here rather than in JS keeps that agreement in one place.
  const { data, error } = await client
    .from('list_items')
    .select('id, name, position, checked_at')
    .eq('list_id', listId)
    .is('deleted_at', null)
    .order('position')
    .order('id');

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as ListItemRecord[];

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      checkedAt: row.checked_at,
    })),
  };
}

export async function addItem(
  client: SupabaseClient,
  listId: string,
  name: string,
  lastPosition: string | null,
): Promise<Outcome<string>> {
  // New items always append, so the upper bound is null and `lastPosition` is the
  // position of the last item the caller can see — null for an empty list. Two members
  // appending at once therefore compute the same key from the same view, which the `id`
  // tie-break in loadItems() resolves without either write failing.
  const key = keyBetween(lastPosition, null);

  if (!key.ok) {
    return key;
  }

  const { data, error } = await client
    .from('list_items')
    .insert({ list_id: listId, name: name.trim(), position: key.value })
    .select('id')
    .single();

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: (data as { id: string }).id };
}

/**
 * Bulk-appends N new items to a list, used only by the copy-a-list-into-a-
 * new-list flow (ListDetailScreen, HistoryScreen). Takes the same
 * `afterPosition` shape as `addItem()` — the position of the last item the
 * caller can see, null for an empty list — rather than assuming the target
 * list is empty, so this function stays correct even though every current
 * caller happens to call it immediately after `createList()`.
 *
 * Keys are generated by looping the file's one private `keyBetween()`
 * helper, threading each generated key forward as the next call's lower
 * bound — the same sequence N individual `addItem()` calls would produce,
 * one after another, without opening a second call site into
 * `fractional-indexing`.
 *
 * Written as a single multi-row `.insert([...])`, not N sequential single
 * inserts: every key is already computed synchronously before any network
 * call, so there is nothing a per-row round trip would buy, and a single
 * INSERT statement either fully succeeds or fully fails.
 */
export async function addItems(
  client: SupabaseClient,
  listId: string,
  names: readonly string[],
  afterPosition: string | null,
): Promise<Outcome<void>> {
  if (names.length === 0) {
    return { ok: true, value: undefined };
  }

  const keys: string[] = [];
  let lower = afterPosition;
  for (let i = 0; i < names.length; i++) {
    const key = keyBetween(lower, null);
    if (!key.ok) {
      return key;
    }
    keys.push(key.value);
    lower = key.value;
  }

  const { error } = await client.from('list_items').insert(
    names.map((name, i) => ({
      list_id: listId,
      name: name.trim(),
      position: keys[i],
    })),
  );

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

export async function renameItem(
  client: SupabaseClient,
  itemId: string,
  name: string,
): Promise<Outcome<void>> {
  const { error } = await client
    .from('list_items')
    .update({ name: name.trim() })
    .eq('id', itemId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

export async function removeItem(
  client: SupabaseClient,
  itemId: string,
): Promise<Outcome<void>> {
  // Soft delete for the same reason as removeList(): DELETE is not RLS-filtered, so it
  // is not granted on this table at all. The row keeps its `position`, which is what
  // makes an undo in a later slice a matter of clearing one column.
  const { error } = await client
    .from('list_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

export async function setChecked(
  client: SupabaseClient,
  itemId: string,
  checked: boolean,
): Promise<Outcome<void>> {
  // Check-off never writes `position`. One gesture, one fact: a checked item stays where
  // it is, and grouping checked items at the bottom is a sort at render time, not a
  // rewrite of everyone else's order.
  //
  // The timestamp is stored rather than a boolean because it answers "is it checked" and
  // "when" for the price of the first question alone.
  const { error } = await client
    .from('list_items')
    .update({ checked_at: checked ? new Date().toISOString() : null })
    .eq('id', itemId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}

/**
 * Moves one item into the gap between two others, writing exactly one row.
 *
 * The two bounds are the positions of the items that will sit either side of the moved
 * item once it lands, taken from the list as currently rendered and *excluding* the item
 * being moved. For a list sorted as `loadItems` returns it, moving the item at index `i`
 * up one place lands it between `items[i - 2]` and `items[i - 1]`; moving it down lands
 * it between `items[i + 1]` and `items[i + 2]`. At the ends of the list the missing
 * neighbour is null — moving the second item up gives `(null, items[0].position)`, and
 * moving the second-to-last down gives `(items[last].position, null)`.
 *
 * Getting the off-by-one wrong here does not throw; it produces a move that appears not
 * to have happened, because the new key lands back in the gap the item came from.
 */
export async function moveItem(
  client: SupabaseClient,
  itemId: string,
  beforePosition: string | null,
  afterPosition: string | null,
): Promise<Outcome<void>> {
  const key = keyBetween(beforePosition, afterPosition);

  if (!key.ok) {
    return key;
  }

  const { error } = await client
    .from('list_items')
    .update({ position: key.value })
    .eq('id', itemId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}
