import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Badge,
  CheckTarget,
  EmptyState,
  ErrorNote,
  Field,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Row,
  Screen,
  SecondaryButton,
} from '../components/ui';
import type { ListsView } from '../hooks/useLists';
import type { Household } from '../lib/household';
import { createList } from '../lib/lists';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Lists'> & {
  client: SupabaseClient;
  view: ListsView;
  refresh: () => Promise<void>;
  household: Household | null;
};

/**
 * The lists index. Its own standalone page as of #22 — it was home for every
 * user from Slice 2 through Slice 9, but the Dashboard screen took that over,
 * and every navigation surface that used to reach this screen's siblings
 * from its header (Locations/History/Household) now goes through the global
 * `NavMenu` (#24) instead. `household` stays a prop here regardless: the
 * "share with {household}" checkbox in the composer below still needs it.
 */
export function ListsScreen({
  client,
  household,
  navigation,
  refresh,
  view,
}: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function beginComposing() {
    setError(null);
    setName('');
    setShared(false);
    setComposing(true);
  }

  function cancelComposing() {
    setError(null);
    setComposing(false);
  }

  async function submit() {
    // The button is disabled on an empty name, but the keyboard's return key is not.
    // `lists.name` carries a length check, and an empty one comes back as raw
    // constraint prose that `humanise` has no mapping for.
    if (name.trim().length === 0) {
      return;
    }

    setBusy(true);
    setError(null);

    const outcome = await createList(
      client,
      name,
      shared && household ? household.id : null,
    );

    if (!outcome.ok) {
      setBusy(false);
      setError(outcome.message);
      return;
    }

    // Awaited before navigating, not after. The detail screen reads its list's name
    // and scope out of this same loaded index, so a list that is not in it yet reads
    // there as a list that does not exist.
    await refresh();

    setBusy(false);
    setComposing(false);
    setName('');
    setShared(false);
    navigation.navigate('ListDetail', { listId: outcome.value });
  }

  // Archived lists (Batch C, #33) are done — they're `finishShopping()`'s own
  // record of a completed shop, not an active list to keep resurfacing here.
  const lists =
    view.status === 'loaded' ? view.lists.filter((list) => list.archivedAt === null) : [];

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      {view.status === 'loading' ? (
        <ActivityIndicator color={tokens.color.accent} size="large" />
      ) : null}

      {view.status === 'error' ? <ErrorNote message={view.message} /> : null}

      {lists.map((list) => (
        <Row
          key={list.id}
          label={list.name}
          trailing={<Badge label={list.householdId ? 'Shared' : 'Personal'} />}
          onPress={() => navigation.navigate('ListDetail', { listId: list.id })}
        />
      ))}

      {error ? <ErrorNote message={error} /> : null}

      {composing ? (
        <View style={styles.composer}>
          <Field
            label="List name"
            value={name}
            onChangeText={setName}
            placeholder="Weekly shop"
            autoCapitalize="sentences"
            autoFocus
            maxLength={60}
            editable={!busy}
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          {household ? (
            // A checkbox rather than a pair of buttons: there are two scopes, one of
            // them is the default, and the difference between them is whether other
            // people can see the list. That is a thing you opt into, and saying so in
            // the household's own name is shorter than explaining what "Household"
            // would have meant.
            <Row
              label={`Share with ${household.name}`}
              leading={
                <CheckTarget
                  checked={shared}
                  onToggle={() => setShared(!shared)}
                  accessibilityLabel={`Share with ${household.name}`}
                  disabled={busy}
                />
              }
            />
          ) : null}
          <PrimaryButton
            label="Create list"
            onPress={submit}
            busy={busy}
            disabled={name.trim().length === 0}
          />
          <SecondaryButton
            label="Cancel"
            onPress={cancelComposing}
            disabled={busy}
          />
        </View>
      ) : view.status === 'loaded' && lists.length === 0 ? (
        <EmptyState
          heading="No lists yet."
          body={
            household
              ? 'Make one for yourself, or one the whole household can see.'
              : 'Make one for yourself. You can share it with a household later.'
          }
          actionLabel="New list"
          onAction={beginComposing}
        />
      ) : view.status === 'loaded' ? (
        <PrimaryButton label="New list" onPress={beginComposing} />
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
