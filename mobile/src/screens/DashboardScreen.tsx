import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Badge,
  Body,
  Card,
  ErrorNote,
  Heading,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Row,
  Screen,
  SecondaryButton,
} from '../components/ui';
import { DonutChart, type DonutSegment } from '../components/DonutChart';
import type { ListsView } from '../hooks/useLists';
import { useLocations } from '../hooks/useLocations';
import { useShopSessions } from '../hooks/useShopSessions';
import { requestLocation } from '../lib/geolocation';
import type { Household } from '../lib/household';
import { attachLocation, createList, loadInProgressListIds } from '../lib/lists';
import {
  loadPendingCorrectionCounts,
  type PendingCorrectionCount,
} from '../lib/locationItemVotes';
import {
  findNearbyLocations,
  roundToNearest10,
  type NearbyLocation,
} from '../lib/locations';
import { loadShopSessionLocationCounts, type LocationShopCount } from '../lib/shopSessions';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * How far "nearby" reaches for the #23 nudge — deliberately not
 * `MERGE_RADIUS_M` (`locations.ts`, 100m): that constant answers "is this
 * close enough to be the same physical store," a dedup check. This answers
 * "close enough that starting a list here is worth suggesting," a walking
 * distance. No spec value exists for this one; 200m is a plain judgement
 * call, not a locked constant other code depends on.
 */
const NEARBY_STORE_RADIUS_M = 200;

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
  memberCount: number;
};

/**
 * Home, as of #22, with #23's two stretch widgets folded in afterward: a
 * nearby-store nudge and a pending-corrections summary. Render order: new
 * list, nearby stores, continue shopping, store frequency, pending
 * corrections, household snapshot, recent activity — #22's five widgets in
 * their original priority order, with #23's two slotted in near the
 * shopping-action widgets they're closest in kind to (neither issue
 * mandates exact placement for the stretch pair).
 *
 * Every section but "New list", "Nearby stores" and "Household snapshot"
 * renders nothing (not an empty card) when it has nothing to show — a
 * dashboard that always reserves space for every widget regardless of data
 * reads as broken on a fresh account, and #22's acceptance test says as
 * much for the chart specifically ("a sane empty state, not an empty
 * chart"). "Nearby stores" is the deliberate exception: it's an on-demand
 * action (the #23 Problem Agreement resolved the permission-prompt question
 * as "a passive button, never an automatic check on load"), so the button
 * itself has to stay visible for there to be anything to tap — what's
 * conditional is only the *result* area below it, once checked.
 *
 * `inProgressListIds`, `locationCounts` and `pendingCorrections` are `null`
 * while loading rather than defaulting to empty — an empty *result*
 * (genuinely nothing to show) and a *not-yet-fetched* result would
 * otherwise both render as "hide this section," which very briefly hides a
 * section on every dashboard mount even for a household with real data.
 */
export function DashboardScreen({
  client,
  household,
  memberCount,
  navigation,
  listsView,
  onListsChanged,
}: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { view: locationsView } = useLocations(client);
  const { view: shopSessionsView } = useShopSessions(client);

  const [inProgressListIds, setInProgressListIds] = useState<Set<string> | null>(null);
  const [locationCounts, setLocationCounts] = useState<LocationShopCount[] | null>(null);
  const [busyLocationId, setBusyLocationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCorrections, setPendingCorrections] = useState<PendingCorrectionCount[] | null>(
    null,
  );
  // Entirely separate from `error`/`busyLocationId` above, on purpose: a
  // denied location permission has to stay scoped to this one widget and
  // never touch any other section's state — #23's own testing checklist
  // says so outright.
  const [nearbyState, setNearbyState] = useState<NearbyState>({ status: 'idle' });

  const listIds = useMemo(
    () => (listsView.status === 'loaded' ? listsView.lists.map((l) => l.id) : []),
    [listsView],
  );

  const refreshInProgress = useCallback(async () => {
    const outcome = await loadInProgressListIds(client, listIds);
    if (outcome.ok) {
      setInProgressListIds(outcome.value);
    }
    // A failure here just leaves "Continue shopping" hidden — the screen's
    // other widgets don't depend on it, so there's no full-screen error
    // worth showing over a section that already fails closed.
  }, [client, listIds]);

  const refreshLocationCounts = useCallback(async () => {
    const outcome = await loadShopSessionLocationCounts(client);
    if (outcome.ok) {
      setLocationCounts(outcome.value);
    }
  }, [client]);

  useEffect(() => {
    void refreshInProgress();
  }, [refreshInProgress]);

  useEffect(() => {
    void refreshLocationCounts();
  }, [refreshLocationCounts]);

  // The locations "the current household" has pending corrections at —
  // location_item_votes carries no household/user column to ask directly
  // (see loadPendingCorrectionCounts's own doc comment), so this is every
  // location this account's own lists or shop history touch. Serialized to
  // a sorted, deduped, comma-joined key so the effect below re-runs on a
  // real change in membership, not on every new-but-equal array from the
  // two useMemo/useState sources it's built from.
  const relevantLocationIds = useMemo(() => {
    const ids = new Set<string>();
    if (listsView.status === 'loaded') {
      for (const list of listsView.lists) {
        if (list.locationId) {
          ids.add(list.locationId);
        }
      }
    }
    for (const entry of locationCounts ?? []) {
      ids.add(entry.locationId);
    }
    return Array.from(ids).sort();
  }, [listsView, locationCounts]);
  const relevantLocationIdsKey = relevantLocationIds.join(',');

  useEffect(() => {
    // Waits for locationCounts to have loaded at least once — before that,
    // relevantLocationIds only reflects list-attached locations, and
    // running the (harmless but wasted) query against a known-partial set
    // would just mean doing it again a moment later anyway.
    if (locationCounts === null) {
      return;
    }
    void (async () => {
      const outcome = await loadPendingCorrectionCounts(client, relevantLocationIds);
      if (outcome.ok) {
        setPendingCorrections(outcome.value);
      }
    })();
    // relevantLocationIds is read inside but intentionally not listed below
    // — its array identity changes every render; relevantLocationIdsKey is
    // the same information, stable across renders where membership hasn't
    // changed, which is the condition that should actually re-run this.
  }, [client, locationCounts, relevantLocationIdsKey]);

  // Catches the case a user checks off the last item on some other screen and
  // then comes back Home — `list_items` isn't subscribed here (see
  // loadInProgressListIds's own doc comment on why this is a plain effect,
  // not a live hook), so re-deriving on focus is what keeps "in progress"
  // from reading stale after a screen the user didn't come back through here.
  useFocusEffect(
    useCallback(() => {
      void refreshInProgress();
    }, [refreshInProgress]),
  );

  const inProgressLists =
    listsView.status === 'loaded' && inProgressListIds
      ? listsView.lists.filter((list) => inProgressListIds.has(list.id))
      : [];

  const locationName = useCallback(
    (locationId: string): string =>
      locationsView.status === 'loaded'
        ? (locationsView.locations.find((l) => l.id === locationId)?.name ?? 'a location')
        : 'a location',
    [locationsView],
  );

  async function startOrContinueAtLocation(locationId: string) {
    if (busyLocationId) {
      return;
    }

    // Already shopping this store — go straight there rather than starting
    // a second, redundant list at the same location.
    const existing =
      listsView.status === 'loaded' && inProgressListIds
        ? listsView.lists.find(
            (list) => list.locationId === locationId && inProgressListIds.has(list.id),
          )
        : undefined;

    if (existing) {
      navigation.navigate('ListDetail', { listId: existing.id });
      return;
    }

    setBusyLocationId(locationId);
    setError(null);

    // Personal by default, matching the manual composer's own starting state
    // (ListsScreen's `beginComposing`) — this one-tap shortcut skips the
    // share checkbox rather than guessing "shared," and the list is
    // renameable/promotable afterward like any other.
    const name = `${locationName(locationId)} — ${formatToday()}`;
    const createOutcome = await createList(client, name, null);

    if (!createOutcome.ok) {
      setBusyLocationId(null);
      setError(createOutcome.message);
      return;
    }

    const newListId = createOutcome.value;
    const attachOutcome = await attachLocation(client, newListId, locationId);

    if (!attachOutcome.ok) {
      setBusyLocationId(null);
      setError(attachOutcome.message);
      return;
    }

    await onListsChanged();
    setBusyLocationId(null);
    navigation.navigate('ListDetail', { listId: newListId });
  }

  /**
   * Runs only on a tap — never on mount, never on focus. That's the whole
   * resolution to #23's own open question: a location permission prompt is
   * an interruption, and Home is the one screen guaranteed to be the first
   * thing every session sees, so it's the one screen an automatic check
   * would surprise on literally every cold open.
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

  const chartSegments: DonutSegment[] = (locationCounts ?? []).map((entry) => ({
    key: entry.locationId,
    label: locationName(entry.locationId),
    value: entry.count,
  }));

  const recentSessions = shopSessionsView.status === 'loaded' ? shopSessionsView.sessions.slice(0, 3) : [];

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

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      {error ? <ErrorNote message={error} /> : null}

      <PrimaryButton label="New list" onPress={() => navigation.navigate('Lists')} />

      <View style={styles.section}>
        <Heading>Nearby stores</Heading>
        {nearbyState.status === 'idle' ? (
          <SecondaryButton label="Check for nearby stores" onPress={() => void checkNearby()} />
        ) : nearbyState.status === 'checking' ? (
          <ActivityIndicator color={tokens.color.accent} />
        ) : nearbyState.status === 'denied' ? (
          <Body>Location access isn't available, so nearby stores can't be checked this session.</Body>
        ) : nearbyState.status === 'error' ? (
          <ErrorNote message={nearbyState.message} />
        ) : nearbyState.results.length === 0 ? (
          <Body>No stores nearby right now.</Body>
        ) : (
          nearbyState.results.map((result) => (
            <Row
              key={result.id}
              label={`${result.name} — ${roundToNearest10(result.distanceM)}m away`}
              onPress={() => void startOrContinueAtLocation(result.id)}
            />
          ))
        )}
      </View>

      {inProgressLists.length > 0 ? (
        <View style={styles.section}>
          <Heading>Continue shopping</Heading>
          {inProgressLists.map((list) => (
            <Row
              key={list.id}
              label={list.name}
              trailing={<Badge label={list.householdId ? 'Shared' : 'Personal'} />}
              onPress={() => navigation.navigate('ListDetail', { listId: list.id })}
            />
          ))}
        </View>
      ) : null}

      {locationCounts !== null ? (
        <View style={styles.section}>
          <Heading>Where you shop</Heading>
          {locationCounts.length === 0 ? (
            <Body>No shops yet — your store breakdown shows up here once you finish one.</Body>
          ) : (
            <DonutChart
              segments={chartSegments}
              onSegmentPress={(locationId) => void startOrContinueAtLocation(locationId)}
            />
          )}
        </View>
      ) : null}

      {pendingCorrections !== null && pendingCorrections.length > 0 ? (
        <View style={styles.section}>
          <Heading>Pending corrections</Heading>
          {pendingCorrections.map((entry) => (
            <Row
              key={entry.locationId}
              label={`${locationName(entry.locationId)} · ${entry.count} waiting for a second vote`}
              onPress={() => void startOrContinueAtLocation(entry.locationId)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Heading>Household</Heading>
        {household ? (
          <Card>
            <Text style={styles.householdName}>{household.name}</Text>
            <Body>{`${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}</Body>
            <SecondaryButton label="Open household" onPress={() => navigation.navigate('Household')} />
          </Card>
        ) : (
          <Card>
            <Body>You're not in a household yet. Join or create one to share lists.</Body>
            <SecondaryButton
              label="Join or create a household"
              onPress={() => navigation.navigate('HouseholdSetup')}
            />
          </Card>
        )}
      </View>

      {recentSessions.length > 0 ? (
        <View style={styles.section}>
          <Heading>Recent activity</Heading>
          <Card>
            {recentSessions.map((session) => (
              <Body key={session.id}>
                {`${locationName(session.locationId)} · ${formatSessionDate(session.completedAt)}`}
              </Body>
            ))}
            <SecondaryButton label="See all history" onPress={() => navigation.navigate('History')} />
          </Card>
        </View>
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

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
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
    householdName: {
      fontSize: tokens.fontSize.title,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
  });
}
