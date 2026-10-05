import type { SupabaseClient } from '@supabase/supabase-js';

import { humanise, type Outcome } from './household';
import type { Chain } from '../theme/chainColors';

/**
 * Stores are catalog-only: seeded by Cartel, never created or edited from the app
 * (ADR 0007). This file therefore only reads.
 */
export type LocationRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  createdAt: string;
  chain: Chain | null;
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
  chain: Chain | null;
};

type NearbyLocationRecord = {
  id: string;
  name: string;
  distance_m: number;
};

/**
 * Radius for the dashboard's passive nearby-store nudge: a walking distance, not a
 * dedup check. A plain judgement call, not a locked constant other code depends on.
 */
export const NEARBY_STORE_RADIUS_M = 200;

/**
 * Radius for the Stores picker's "Find stores near me". Wider than the dashboard
 * nudge because the picker is for choosing a store to attach, not a quick
 * "you're at a store" hint (Ant decided 2 km).
 */
export const PICKER_NEARBY_RADIUS_M = 2000;

/**
 * Rounds a metre distance to the nearest 10 for display next to a nearby store. The
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
    .select('id, name, lat, lng, created_at, chain')
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
      chain: row.chain,
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
