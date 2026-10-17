import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Body,
  ErrorNote,
  NAVIGATOR_EDGES,
  Row,
  Screen,
  SecondaryButton,
} from '../components/ui';
import type { DonutSegment } from '../components/DonutChart';
import { HomeGraphs } from '../components/HomeGraphs';
import { HomeHero } from '../components/HomeHero';
import { StoreBadge } from '../components/StoreBadge';
import { StoresRow, type StoresRowEntry } from '../components/StoresRow';
import type { ListsView } from '../hooks/useLists';
import { useLocations } from '../hooks/useLocations';
import { useShopSessions } from '../hooks/useShopSessions';
import { requestLocation } from '../lib/geolocation';
import type { Household } from '../lib/household';
import { attachLocation, createList } from '../lib/lists';
import {
  findNearbyLocations,
  NEARBY_STORE_RADIUS_M,
  roundToNearest10,
  type LocationRow,
  type NearbyLocation,
} from '../lib/locations';
import { loadShopSessionStats, type ShopSessionStats } from '../lib/shopSessions';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type NearbyState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'found'; results: NearbyLocation[] };

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'> & {
  client: SupabaseClient;
  listsView: ListsView;
  onListsChanged: () => Promise<void>;
  household: Household | null;
};

/**
 * Home, as the #110 dashboard (#144, #145): a hero, a Stores row, two graph tiles ("Where you
 * shop" and "How often you shop", `HomeGraphs`). The graphs animate on mount, once per
 * mount, never when the history is refetched. Recent activity was removed in #214; History
 * lives in the nav.
 *
 * Hero: one card per shop in progress (a list with at least one ticked item, #89), read
 * straight off `listsView`, whose counts stay live through the lists channel. With none, the
 * hero is a "Start a shop" card (New list, and a Nearby stores chip), so Home is never empty.
 *
 * Stores row: stores in the shop history, most-shopped first, then any store attached to one
 * of the user's lists, in list order. A tap does what a donut legend tap does: start or
 * continue a shop there. It does not open the Store page.
 *
 * Every section after the hero renders nothing (not an empty card) when it has nothing to
 * show: a dashboard that reserves space for every widget reads as broken on a fresh account.
 * `stats` is `null` while loading, not empty, so a not-yet-fetched result does not
 * briefly hide a section for a household with real data.
 *
 * The nearby check is passive (the #23 Problem Agreement): it runs only on a tap, never on
 * mount or focus, because a location permission prompt on every cold open would surprise.
 * Its denied/error states stay scoped to the hero card and never touch `error`.
 *
 * Pending corrections no longer appear here; they live only in the Store's Item catalog
 * ("Proposed: X").
 */
export function DashboardScreen({
  client,
  navigation,
  listsView,
  onListsChanged,
  household,
}: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { view: locationsView } = useLocations(client);
  const { view: shopSessionsView } = useShopSessions(client);

  const [stats, setStats] = useState<ShopSessionStats | null>(null);
  // State is for the spinner only; the re-entry guard is the ref (set synchronously).
  const [busyLocationId, setBusyLocationId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Entirely separate from `error` on purpose: a denied location permission stays scoped
  // to the hero card and never touches any other section's state.
  const [nearbyState, setNearbyState] = useState<NearbyState>({ status: 'idle' });

  const refreshStats = useCallback(async () => {
    const outcome = await loadShopSessionStats(client);
    if (outcome.ok) {
      setStats(outcome.value);
    }
  }, [client]);

  // Re-runs when the shop history changes (finishing a shop adds a session), so the Stores
  // row and donut update on returning to Home without a remount.
  const sessionsKey =
    shopSessionsView.status === 'loaded'
      ? shopSessionsView.sessions.map((s) => s.id).join(',')
      : null;

  useEffect(() => {
    if (sessionsKey !== null) {
      void refreshStats();
    }
  }, [refreshStats, sessionsKey]);

  // A failed shop-history load must not hide the Stores row for stores on the user's lists:
  // treat it as an empty history so the list-attached stores still appear.
  const sessionsFailed = shopSessionsView.status === 'error';
  useEffect(() => {
    if (sessionsFailed) {
      setStats((prev) => prev ?? { locationCounts: [], completedAt: [] });
    }
  }, [sessionsFailed]);

  const storeById = useMemo(() => {
    const map = new Map<string, LocationRow>();
    if (locationsView.status === 'loaded') {
      for (const location of locationsView.locations) {
        map.set(location.id, location);
      }
    }
    return map;
  }, [locationsView]);

  const locationName = (locationId: string): string => storeById.get(locationId)?.name ?? 'a store';
  const locationChain = (locationId: string) => storeById.get(locationId)?.chain ?? null;

  // In progress = at least one ticked item, recorded or not (#89).
  const inProgressLists =
    listsView.status === 'loaded' ? listsView.lists.filter((list) => list.checkedCount > 0) : [];

  // Shop history first (most-shopped first), then stores on the user's lists in list order
  // (most recent activity first), deduped. Built once the counts have loaded, so the row
  // does not grow after first paint.
  const storesRowEntries = useMemo<StoresRowEntry[]>(() => {
    if (stats === null) {
      return [];
    }
    const ids: string[] = [];
    const seen = new Set<string>();
    const add = (id: string | null) => {
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    };
    [...stats.locationCounts].sort((a, b) => b.count - a.count).forEach((entry) => add(entry.locationId));
    if (listsView.status === 'loaded') {
      [...listsView.lists]
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
        .forEach((list) => add(list.locationId));
    }
    return ids.flatMap((id) => {
      const store = storeById.get(id);
      return store ? [{ id, name: store.name, chain: store.chain }] : [];
    });
  }, [stats, listsView, storeById]);

  async function startOrContinueAtLocation(locationId: string) {
    if (busyRef.current) {
      return;
    }

    // Already shopping this store: go straight there rather than starting a second,
    // redundant list at the same location.
    const existing =
      listsView.status === 'loaded'
        ? listsView.lists.find((list) => list.locationId === locationId && list.checkedCount > 0)
        : undefined;

    if (existing) {
      navigation.navigate('ListDetail', { listId: existing.id });
      return;
    }

    busyRef.current = true;
    setBusyLocationId(locationId);
    setError(null);

    try {
      // Personal by default, matching the manual composer's own starting state
      // (ListsScreen's `beginComposing`); renameable/promotable afterward like any other.
      const name = `${locationName(locationId)} — ${formatToday()}`;
      const createOutcome = await createList(client, name, null);

      if (!createOutcome.ok) {
        setError(createOutcome.message);
        return;
      }

      const newListId = createOutcome.value;
      const attachOutcome = await attachLocation(client, newListId, locationId);

      if (!attachOutcome.ok) {
        setError(attachOutcome.message);
        return;
      }

      await onListsChanged();
      navigation.navigate('ListDetail', { listId: newListId });
    } finally {
      busyRef.current = false;
      setBusyLocationId(null);
    }
  }

  /**
   * Runs only on a tap, never on mount, never on focus (see the header comment).
   */
  async function checkNearby() {
    setNearbyState({ status: 'checking' });

    const perm = await requestLocation();

    if (perm.status === 'denied') {
      setNearbyState({ status: 'denied' });
      return;
    }

    if (perm.status === 'error') {
      setNearbyState({ status: 'error', message: perm.message });
      return;
    }

    const nearby = await findNearbyLocations(client, perm.lat, perm.lng, NEARBY_STORE_RADIUS_M);

    if (!nearby.ok) {
      setNearbyState({ status: 'error', message: nearby.message });
      return;
    }

    setNearbyState({ status: 'found', results: nearby.value });
  }

  const chartSegments: DonutSegment[] = (stats?.locationCounts ?? []).map((entry) => ({
    key: entry.locationId,
    label: locationName(entry.locationId),
    value: entry.count,
    chain: locationChain(entry.locationId),
  }));

  const loadingCore =
    listsView.status === 'loading' ||
    locationsView.status === 'loading' ||
    shopSessionsView.status === 'loading';

  if (loadingCore) {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ActivityIndicator color={tokens.color.accent} size="large" />
      </Screen>
    );
  }

  const nearbyChip =
    nearbyState.status === 'idle' ? (
      <SecondaryButton label="Nearby stores" onPress={() => void checkNearby()} />
    ) : null;

  const nearbyResults =
    nearbyState.status === 'idle' ? null : (
      <View style={styles.nearby}>
        {nearbyState.status === 'checking' ? (
          <ActivityIndicator color={tokens.color.accent} />
        ) : nearbyState.status === 'denied' ? (
          <Body>Location Services isn't available, so nearby stores can't be checked this session.</Body>
        ) : nearbyState.status === 'error' ? (
          <ErrorNote message={nearbyState.message} />
        ) : nearbyState.results.length === 0 ? (
          <Body>No stores nearby right now.</Body>
        ) : (
          nearbyState.results.map((result) => (
            <Row
              key={result.id}
              leading={<StoreBadge chain={locationChain(result.id)} />}
              label={`${result.name} — ${roundToNearest10(result.distanceM)}m away`}
              onPress={() => void startOrContinueAtLocation(result.id)}
            />
          ))
        )}
        {nearbyState.status === 'denied' ||
        nearbyState.status === 'error' ||
        nearbyState.status === 'found' ? (
          <View style={styles.leftAligned}>
            <SecondaryButton label="Check again" onPress={() => void checkNearby()} />
          </View>
        ) : null}
      </View>
    );

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      {error ? <ErrorNote message={error} /> : null}

      <HomeHero
        inProgress={inProgressLists}
        storeFor={(locationId) => {
          const store = locationId ? storeById.get(locationId) : undefined;
          return store ? { name: store.name, chain: store.chain } : null;
        }}
        household={household}
        onResume={(listId) => navigation.navigate('ListDetail', { listId })}
        onNewList={() => navigation.navigate('Lists')}
        nearby={{ chip: nearbyChip, results: nearbyResults }}
      />

      {storesRowEntries.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionLabel}>
            Stores
          </Text>
          <StoresRow
            stores={storesRowEntries}
            busyId={busyLocationId}
            onPress={(id) => void startOrContinueAtLocation(id)}
          />
        </View>
      ) : null}

      {stats !== null && stats.completedAt.length > 0 ? (
        <HomeGraphs
          segments={chartSegments}
          completedAt={stats.completedAt}
          onStorePress={(locationId) => void startOrContinueAtLocation(locationId)}
        />
      ) : null}
    </Screen>
  );
}

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    section: {
      gap: tokens.space.sm,
    },
    sectionLabel: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.body,
      fontWeight: '700',
    },
    nearby: {
      gap: tokens.space.sm,
    },
    leftAligned: {
      alignItems: 'flex-start',
    },
  });
}
