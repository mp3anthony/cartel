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
import type { Household } from '../lib/household';
import { attachLocation, createList, loadInProgressListIds } from '../lib/lists';
import { loadShopSessionLocationCounts, type LocationShopCount } from '../lib/shopSessions';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'> & {
  client: SupabaseClient;
  listsView: ListsView;
  onListsChanged: () => Promise<void>;
  household: Household | null;
  memberCount: number;
};

/**
 * Home, as of #22. `Lists` held this role from Slice 2 through Slice 9; this
 * screen takes over, in the priority order the issue sets: new list,
 * continue shopping, store frequency, household snapshot, recent activity.
 *
 * Every section but "New list" and "Household snapshot" renders nothing
 * (not an empty card) when it has nothing to show — a dashboard that always
 * reserves space for five widgets regardless of data reads as broken on a
 * fresh account, and the issue's own acceptance test says as much for the
 * chart specifically ("a sane empty state, not an empty chart").
 *
 * `inProgressListIds` and `locationCounts` are `null` while loading rather
 * than defaulting to empty — an empty *result* (genuinely no in-progress
 * lists) and a *not-yet-fetched* result would otherwise both render as "hide
 * this section," which very briefly hides a section on every dashboard
 * mount even for a household with real data.
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
