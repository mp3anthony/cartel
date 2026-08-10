import type { SupabaseClient } from '@supabase/supabase-js';

import { humanise, type Outcome } from './household';

export type LocationRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  createdAt: string;
};

export type NearbyLocation = {
  id: string;
  name: string;
  distanceM: number;
};

/**
 * The database's spelling of the row above, kept separate rather than exported so that
 * snake_case stops at this file. `created_by` is deliberately absent — it is withheld
 * from the column-level SELECT grant on `public.locations` (see migration
 * 20260810000005), so selecting it would fail, and nothing in this app reads it back.
 */
type LocationRecord = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  created_at: string;
};

type NearbyLocationRecord = {
  id: string;
  name: string;
  distance_m: number;
};

/**
 * The one locked radius value in the app — every caller imports this rather than
 * re-writing 100. Locked at the tight end of 03-SPEC.md's ~100-150m range for the
 * merge prompt (see HANDOFF.md, Slice 4 Step 2).
 */
export const MERGE_RADIUS_M = 100;

/**
 * Rounds a metre distance to the nearest 10 for display in the merge prompt. The
 * underlying `nearby_locations` RPC returns a precise great-circle distance; showing
 * that precision to a person ("62.3814m away") would read as false accuracy for a
 * number that is itself only as good as a phone's GPS fix.
 */
export function roundToNearest10(metres: number): number {
  return Math.round(metres / 10) * 10;
}

export async function loadLocations(client: SupabaseClient): Promise<Outcome<LocationRow[]>> {
  // RLS grants SELECT on this table to every authenticated user unconditionally —
  // `public.locations` is deliberately global, unlike `lists`/`list_items` — so no
  // filter is needed here and none would narrow what comes back.
  const { data, error } = await client
    .from('locations')
    .select('id, name, lat, lng, created_at')
    .order('name');

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as LocationRecord[];

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      createdAt: row.created_at,
    })),
  };
}

export async function findNearbyLocations(
  client: SupabaseClient,
  lat: number,
  lng: number,
  radiusM: number,
): Promise<Outcome<NearbyLocation[]>> {
  const { data, error } = await client.rpc('nearby_locations', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
  });

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as NearbyLocationRecord[];

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      name: row.name,
      distanceM: row.distance_m,
    })),
  };
}

export async function createLocation(
  client: SupabaseClient,
  name: string,
  lat: number,
  lng: number,
): Promise<Outcome<string>> {
  // `created_by` is left out on purpose. The column defaults to auth.uid(), which is
  // the same value the insert policy checks it against, so a client that sends it can
  // only ever agree with the default or be rejected by the policy. One that never
  // names the column cannot get it wrong. Mirrors createList()'s treatment of
  // `owner_id` in lists.ts.
  const { data, error } = await client
    .from('locations')
    .insert({ name: name.trim(), lat, lng })
    .select('id')
    .single();

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: (data as { id: string }).id };
}
