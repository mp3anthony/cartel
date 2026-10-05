import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Badge,
  Body,
  ErrorNote,
  Field,
  NAVIGATOR_EDGES,
  Row,
  Screen,
  SecondaryButton,
  Select,
} from '../components/ui';
import { StoreBadge } from '../components/StoreBadge';
import { useLocations } from '../hooks/useLocations';
import { requestLocation } from '../lib/geolocation';
import { attachLocation } from '../lib/lists';
import {
  findNearbyLocations,
  PICKER_NEARBY_RADIUS_M,
  roundToNearest10,
  type NearbyLocation,
} from '../lib/locations';
import type { RootStackParamList } from '../navigation/types';
import { CHAIN_OPTIONS, type Chain } from '../theme/chainColors';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Locations'> & {
  client: SupabaseClient;
  onListsChanged: () => Promise<void>;
};

type NearbyState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'found'; results: NearbyLocation[] };

type ChainFilter = Chain | 'all';

const CHAIN_FILTER_OPTIONS: { value: ChainFilter; label: string }[] = [
  { value: 'all', label: 'All chains' },
  ...CHAIN_OPTIONS,
];

/**
 * The Store picker: catalog-only, no creation (ADR 0007). Stores are seeded by Cartel
 * and found here by nearby (Location Services, on request) or by name search with a
 * Chain filter. A store that is not listed goes through "Store missing?", which files
 * a report; nothing in this screen writes to `locations`.
 *
 * Hard invariant (03-SPEC.md § 0): this screen never reads, displays, or filters by
 * `created_by`, household, or any notion of "stores I made" vs "stores others made".
 * `locations.ts` withholds `created_by` from the SELECT grant, so there is no
 * ownership concept here to accidentally add.
 *
 * `selected` is client-side and ephemeral when `attachToListId` is absent — nothing
 * about "which store is selected" is persisted; it exists only so a row can show a
 * "Selected" badge for this screen's mounted lifetime.
 *
 * `attachToListId` turns a selection into a real write. `handleSelect` is the one
 * place a selection "becomes real": every path that finalizes a choice (a catalog row
 * or a nearby row) calls it, so the attach-vs-badge branch lives in exactly one
 * function. Present, it writes `location_id` onto that list and returns to it; absent,
 * it only sets the badge. `returnTo: 'Shopping'` (#89, "Continue at another store")
 * goes back to the Shopping screen underneath and adds "Keep the current store".
 *
 * The nearby search is passive: a button, never a Location Services prompt on mount
 * (docs/conventions.md). Denial is sticky for this screen's lifetime; there is no
 * retry and no settings deep link, and name search still works.
 *
 * "View catalog" (#65) is a sibling of each store's `Row`, not nested in its trailing
 * slot, to avoid two nested Pressables reacting to one tap (see `CheckTarget` in
 * `ui.tsx`).
 */
export function LocationsScreen({ client, navigation, onListsChanged, route }: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { view } = useLocations(client);
  const attachToListId = route.params?.attachToListId;
  // #89: set when the picker was opened from Shopping Mode's "Continue at another store".
  // Finishing here goes back to the Shopping screen underneath, not on to the list.
  const returnToShopping = route.params?.returnTo === 'Shopping';

  const [search, setSearch] = useState('');
  const [chainFilter, setChainFilter] = useState<ChainFilter>('all');
  const [busy, setBusy] = useState(false);
  // Synchronous re-entry guard (docs/conventions.md); `busy`/`nearbyState` are display only.
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [nearbyState, setNearbyState] = useState<NearbyState>({ status: 'idle' });
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  /**
   * The single place a selection "becomes real". Absent `attachToListId`, it sets the
   * ephemeral badge state and stops. Present, it writes instead — RLS already covers
   * who may attach (see migration 20260810000006), so this never re-derives an
   * authorization check the database already makes.
   *
   * The `busy` guard only applies on the attach path: a bare badge-select has nothing
   * to race.
   */
  async function handleSelect(id: string, name: string) {
    if (!attachToListId) {
      setSelected({ id, name });
      return;
    }

    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const outcome = await attachLocation(client, attachToListId, id);

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      await onListsChanged();
      if (returnToShopping) {
        // `navigate` would push a second Shopping screen in React Navigation 7; `goBack`
        // returns to the one already underneath, whose list state has just refreshed.
        navigation.goBack();
      } else {
        navigation.navigate('ListDetail', { listId: attachToListId });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function findNearby() {
    if (busyRef.current || nearbyState.status === 'denied') {
      return;
    }

    busyRef.current = true;
    setNearbyState({ status: 'checking' });

    try {
      const perm = await requestLocation();

      if (perm.status === 'denied') {
        setNearbyState({ status: 'denied' });
        return;
      }

      if (perm.status === 'error') {
        setNearbyState({ status: 'error', message: perm.message });
        return;
      }

      const nearby = await findNearbyLocations(client, perm.lat, perm.lng, PICKER_NEARBY_RADIUS_M);

      if (!nearby.ok) {
        setNearbyState({ status: 'error', message: nearby.message });
        return;
      }

      setNearbyState({ status: 'found', results: nearby.value });
    } finally {
      busyRef.current = false;
    }
  }

  if (view.status === 'loading') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ActivityIndicator color={tokens.color.accent} size="large" />
      </Screen>
    );
  }

  if (view.status === 'error') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ErrorNote message={view.message} />
      </Screen>
    );
  }

  const locations = view.locations;
  const chainByLocationId = new Map(locations.map((location) => [location.id, location.chain]));
  const query = search.trim().toLowerCase();
  const chainLabel = CHAIN_FILTER_OPTIONS.find((option) => option.value === chainFilter)?.label ?? '';
  const filtered = locations.filter(
    (location) =>
      (query === '' || location.name.toLowerCase().includes(query)) &&
      (chainFilter === 'all' || location.chain === chainFilter),
  );

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      {returnToShopping ? (
        <SecondaryButton
          label="Keep the current store"
          onPress={() => navigation.goBack()}
          disabled={busy}
        />
      ) : null}

      <View style={styles.section}>
        <Body>Nearby stores</Body>
        <SecondaryButton
          label="Find stores near me"
          onPress={() => void findNearby()}
          disabled={busy || nearbyState.status === 'checking' || nearbyState.status === 'denied'}
        />
        {nearbyState.status === 'denied' ? (
          <Body>
            Location Services isn't available, so nearby stores can't be found this session.
            Search below instead.
          </Body>
        ) : nearbyState.status === 'error' ? (
          <ErrorNote message={nearbyState.message} />
        ) : nearbyState.status === 'found' ? (
          nearbyState.results.length === 0 ? (
            <Body>No stores nearby right now.</Body>
          ) : (
            nearbyState.results.map((result) => (
              <Row
                key={result.id}
                leading={<StoreBadge chain={chainByLocationId.get(result.id) ?? null} />}
                label={`${result.name} — ~${formatDistance(result.distanceM)} away`}
                onPress={() => void handleSelect(result.id, result.name)}
                trailing={result.id === selected?.id ? <Badge label="Selected" /> : undefined}
              />
            ))
          )
        ) : null}
      </View>

      <Field
        label="Search stores"
        value={search}
        onChangeText={setSearch}
        placeholder="e.g. Riccarton"
        autoCapitalize="none"
      />

      <Select label="Chain" value={chainFilter} onChange={setChainFilter} options={CHAIN_FILTER_OPTIONS} />

      {filtered.map((location) => (
        <View key={location.id} style={styles.locationGroup}>
          <Row
            leading={<StoreBadge chain={location.chain} />}
            label={location.name}
            onPress={() => void handleSelect(location.id, location.name)}
            trailing={location.id === selected?.id ? <Badge label="Selected" /> : undefined}
          />
          <SecondaryButton
            label="View catalog"
            onPress={() => navigation.navigate('LocationCatalog', { locationId: location.id })}
          />
        </View>
      ))}

      {filtered.length === 0 && (query !== '' || chainFilter !== 'all') ? (
        <Body>
          {query !== '' && chainFilter !== 'all'
            ? `No stores match "${search.trim()}" in ${chainLabel}.`
            : query !== ''
              ? `No stores match "${search.trim()}".`
              : 'No stores match this chain.'}
        </Body>
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      <SecondaryButton label="Store missing?" onPress={() => navigation.navigate('StoreMissing')} />

      <Body>Store data includes © OpenStreetMap contributors</Body>
    </Screen>
  );
}

/**
 * Distance for display: rounded to the nearest 10 m under a kilometre (a phone's GPS
 * fix does not justify more), one decimal of a kilometre from 1000 m up.
 */
function formatDistance(metres: number): string {
  if (metres >= 1000) {
    return `${(metres / 1000).toFixed(1)} km`;
  }
  return `${roundToNearest10(metres)}m`;
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    section: {
      gap: tokens.space.sm,
    },
    locationGroup: {
      gap: tokens.space.xs,
    },
  });
}
