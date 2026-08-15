import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Badge,
  Body,
  Confirm,
  EmptyState,
  ErrorNote,
  Field,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Row,
  Screen,
  SecondaryButton,
} from '../components/ui';
import { useLocations } from '../hooks/useLocations';
import { requestLocation } from '../lib/geolocation';
import { attachLocation } from '../lib/lists';
import {
  createLocation,
  findNearbyLocations,
  MERGE_RADIUS_M,
  roundToNearest10,
  type NearbyLocation,
} from '../lib/locations';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Locations'> & {
  client: SupabaseClient;
  onListsChanged: () => Promise<void>;
};

/**
 * The global location index, and the one place a location gets created.
 *
 * Hard invariant (03-SPEC.md § 0): this screen never reads, displays, or filters by
 * `created_by`, household, or any notion of "locations I made" vs "locations others
 * made". `locations.ts` already withholds `created_by` from the SELECT grant — there
 * is no ownership concept here to accidentally add.
 *
 * `selected` is client-side and ephemeral when `attachToListId` is absent — nothing
 * about "which location is selected" is persisted or sent to the backend in that
 * case; it exists only so a row can show a "Selected" badge for the rest of this
 * screen's mounted lifetime. This is Slice 4's whole selection story, unchanged.
 *
 * `permissionDenied` is sticky for the same lifetime, once set. There is no retry
 * button and no settings deep link this phase — a user who denies location access
 * falls back to searching the existing index for the rest of this visit.
 *
 * `attachToListId` (Slice 5) is what turns a selection from client-side badging
 * into a real write. `handleSelect` is the one place a selection "becomes real" —
 * every path that finalizes a choice (row tap, merge-confirm, just-created-location)
 * calls it rather than setting `selected` directly, so the attach-vs-badge branch
 * lives in exactly one function. Absent, `handleSelect` does exactly what this
 * screen did before Slice 5 existed; present, it writes `location_id` onto that list
 * and returns to it instead.
 */
export function LocationsScreen({ client, navigation, onListsChanged, route }: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { view, refresh } = useLocations(client);
  const attachToListId = route.params?.attachToListId;

  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [nearbyMatch, setNearbyMatch] = useState<NearbyLocation | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    null,
  );

  /**
   * The single place a selection "becomes real". Absent `attachToListId`, this is
   * byte-identical to Slice 4's row tap: set the ephemeral badge state and stop.
   * Present, it writes instead — `.eq('id', ...)`-style scoping and RLS already
   * cover who may attach (see migration 20260810000006), so this never re-derives
   * an authorization check the database already makes.
   *
   * The `busy` guard only applies on the attach path: a bare badge-select has
   * nothing to race, so gating it here too would make the no-`attachToListId`
   * branch stop being byte-identical to before.
   */
  async function handleSelect(id: string, name: string) {
    if (!attachToListId) {
      setSelected({ id, name });
      return;
    }

    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const outcome = await attachLocation(client, attachToListId, id);

    if (!outcome.ok) {
      setBusy(false);
      setError(outcome.message);
      return;
    }

    await onListsChanged();
    setBusy(false);
    navigation.navigate('ListDetail', { listId: attachToListId });
  }

  function beginComposing() {
    setError(null);
    setName('');
    setComposing(true);
  }

  function cancelComposing() {
    setError(null);
    setComposing(false);
  }

  async function submitCreate() {
    // The button is disabled on an empty name, but the keyboard's return key is not.
    if (name.trim().length === 0) {
      return;
    }

    setBusy(true);
    setError(null);

    const perm = await requestLocation();

    if (perm.status === 'denied') {
      setBusy(false);
      setPermissionDenied(true);
      setComposing(false);
      return;
    }

    if (perm.status === 'error') {
      setBusy(false);
      setError(perm.message);
      return;
    }

    const nearby = await findNearbyLocations(
      client,
      perm.lat,
      perm.lng,
      MERGE_RADIUS_M,
    );

    if (!nearby.ok) {
      setBusy(false);
      setError(nearby.message);
      return;
    }

    if (nearby.value.length > 0) {
      // Already ordered by distance — the nearest candidate is the one worth
      // surfacing, and there is only ever room for one merge prompt on screen.
      setBusy(false);
      setNearbyMatch(nearby.value[0]);
      return;
    }

    const created = await createLocation(client, name, perm.lat, perm.lng);

    if (!created.ok) {
      setBusy(false);
      setError(created.message);
      return;
    }

    // Captured before setName('') clears it, and before handleSelect's own attach
    // path may navigate this screen away.
    const createdName = name.trim();

    await refresh();
    setBusy(false);
    setComposing(false);
    setName('');
    await handleSelect(created.value, createdName);
  }

  function confirmMerge() {
    if (!nearbyMatch) {
      return;
    }

    // The nearby location already exists, so there is no write for the location
    // itself here — "using" it is either a client-side selection (byte-identical to
    // before) or the same attach write every other selection path uses, decided by
    // handleSelect, not here.
    void handleSelect(nearbyMatch.id, nearbyMatch.name);
    setNearbyMatch(null);
    setComposing(false);
    setName('');
  }

  function cancelMerge() {
    // Leaves `composing` true and `name` intact — the user backed out of this one
    // match, not out of naming a location.
    setNearbyMatch(null);
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
  const query = search.trim().toLowerCase();
  const filtered = query
    ? locations.filter((location) => location.name.toLowerCase().includes(query))
    : locations;

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      <Field
        label="Search locations"
        value={search}
        onChangeText={setSearch}
        placeholder="e.g. Papanui PakNSave"
        autoCapitalize="none"
      />

      {filtered.map((location) => (
        <Row
          key={location.id}
          label={location.name}
          onPress={() => void handleSelect(location.id, location.name)}
          trailing={
            location.id === selected?.id ? <Badge label="Selected" /> : undefined
          }
        />
      ))}

      {locations.length > 0 && search.trim().length > 0 && filtered.length === 0 ? (
        <Body>{`No locations match "${search}".`}</Body>
      ) : null}

      {!composing && locations.length === 0 ? (
        permissionDenied ? (
          <EmptyState
            heading="No locations yet"
            body="Location access isn’t available, so new locations can’t be created this session."
          />
        ) : (
          <EmptyState
            heading="No locations yet"
            body="Create one to get started."
            actionLabel="New location"
            onAction={beginComposing}
          />
        )
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      {composing && !nearbyMatch ? (
        <View style={styles.composer}>
          <Field
            label="Location name"
            value={name}
            onChangeText={setName}
            autoCapitalize="sentences"
            autoFocus
            maxLength={60}
            editable={!busy}
            onSubmitEditing={submitCreate}
            returnKeyType="done"
          />
          <PrimaryButton
            label="Create"
            onPress={submitCreate}
            busy={busy}
            disabled={name.trim().length === 0}
          />
          <SecondaryButton
            label="Cancel"
            onPress={cancelComposing}
            disabled={busy}
          />
        </View>
      ) : null}

      {composing && nearbyMatch !== null ? (
        <Confirm
          message={`There's already a location nearby: "${nearbyMatch.name}" (~${roundToNearest10(nearbyMatch.distanceM)}m away). Cartel keeps one location per spot to avoid duplicates.`}
          confirmLabel="Use this location"
          onConfirm={confirmMerge}
          onCancel={cancelMerge}
        />
      ) : null}

      {!composing && !permissionDenied && locations.length > 0 ? (
        <PrimaryButton label="New location" onPress={beginComposing} />
      ) : null}

      {permissionDenied && locations.length > 0 ? (
        <Body>
          Location access isn’t available, so new locations can’t be created this
          session. Search for an existing one above.
        </Body>
      ) : null}
    </Screen>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    composer: {
      gap: tokens.space.sm,
    },
  });
}
