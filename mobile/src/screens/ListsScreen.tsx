import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { appVersion, buildChannel, buildChannelLabel } from '../lib/buildInfo';
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
 * The home screen, for everyone.
 *
 * Not the household screen, and not conditionally: a user who has never created or
 * joined a household still has lists, and Slice 2's acceptance test says so outright.
 * The household is reached from here instead — an offer in the header rather than the
 * wall the app opens with.
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

  useLayoutEffect(() => {
    navigation.setOptions({
      // The header is the only place a control can sit without competing with the
      // list for the top of the screen, and it is where the destination — a different
      // place, not a mode of this one — belongs.
      headerRight: () => (
        <View style={styles.headerButtons}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Locations')}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.headerButtonPressed,
            ]}
          >
            <Text style={styles.headerButtonLabel}>Locations</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              household
                ? navigation.navigate('Household')
                : navigation.navigate('HouseholdSetup')
            }
            style={({ pressed }) => [
              styles.headerButton,
              pressed && styles.headerButtonPressed,
            ]}
          >
            <Text style={styles.headerButtonLabel}>Household</Text>
          </Pressable>
        </View>
      ),
    });
  }, [household, navigation, styles]);

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

  const lists = view.status === 'loaded' ? view.lists : [];

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

      {/* Pins to the visual bottom for a short list (flexGrow absorbs the leftover
          space); trails after the last row instead once the list overflows the
          screen. Scoped to this screen only — see buildInfo.ts for why. */}
      <View style={styles.footerSpacer} />
      <Text style={styles.footer}>
        {`v${appVersion} · ${buildChannelLabel[buildChannel]}`}
      </Text>
    </Screen>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    composer: {
      gap: tokens.space.sm,
    },
    headerButtons: {
      flexDirection: 'row',
      gap: tokens.space.sm,
    },
    headerButton: {
      minHeight: tokens.minTouchTarget,
      justifyContent: 'center',
      paddingHorizontal: tokens.space.sm,
      borderRadius: tokens.radius.md,
    },
    headerButtonPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    headerButtonLabel: {
      color: tokens.color.accent,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
    },
    footerSpacer: {
      flexGrow: 1,
    },
    footer: {
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
      textAlign: 'center',
    },
  });
}
