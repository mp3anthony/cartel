import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Body,
  Card,
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
import { useLocations } from '../hooks/useLocations';
import { useShopSessions } from '../hooks/useShopSessions';
import type { Household } from '../lib/household';
import { addItems, attachLocation, createList } from '../lib/lists';
import type { ShopSessionRow } from '../lib/shopSessions';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'History'> & {
  client: SupabaseClient;
  onListsChanged: () => Promise<void>;
  household: Household | null;
};

/**
 * The household's shop history — the read side of `shop_sessions`, whose
 * write side is `ShoppingScreen.finishShopping()`. Every row that appears
 * here is a snapshot "Finish shopping" recorded at the moment it was
 * pressed: the location shopped, the full list of items on it at the time,
 * and which of those were actually checked off. Nothing on this screen
 * changes what that snapshot says — it is read-only history, bounded to the
 * most recent `SHOP_SESSION_HISTORY_CAP` shops (`../lib/shopSessions`) and
 * scoped by the same RLS an owner-or-household-member gets everywhere else
 * in this app (migration 20260811000003).
 *
 * The one action this screen offers is "Start new list from this," a
 * template flow: it creates a brand-new list, populates it with the
 * session's full item snapshot (`itemNames`, not `checkedItemNames` —
 * templating means "give me what I shopped for," not "give me what I
 * already got"), and attaches it to the same location the shop happened at.
 * One inline composer at a time (`copyingSessionId`), matching this
 * codebase's established one-row-at-a-time shape
 * (`ShoppingScreen`'s `composingItemId`/`correctingItemId`,
 * `ListDetailScreen`'s new copy composer below its own action cluster) —
 * deliberately not a shared component with either of those, see
 * `ListDetailScreen.tsx`'s own copy-composer comment for why.
 */
export function HistoryScreen({ client, household, navigation, onListsChanged }: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { view } = useShopSessions(client);
  const { view: locationsView } = useLocations(client);

  const [copyingSessionId, setCopyingSessionId] = useState<string | null>(null);
  const [copyName, setCopyName] = useState('');
  const [copyShared, setCopyShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function locationNameFor(session: ShopSessionRow): string {
    if (locationsView.status !== 'loaded') {
      return 'a location';
    }
    return (
      locationsView.locations.find((location) => location.id === session.locationId)?.name ??
      'a location'
    );
  }

  function beginCopy(session: ShopSessionRow) {
    setError(null);
    setCopyingSessionId(session.id);
    setCopyName(`${locationNameFor(session)} — ${formatCompletedAt(session.completedAt)}`);
    setCopyShared(false);
  }

  function resetComposer() {
    setCopyingSessionId(null);
    setCopyName('');
    setCopyShared(false);
  }

  function cancelCopy() {
    setError(null);
    resetComposer();
  }

  async function submitCopy(session: ShopSessionRow) {
    if (copyName.trim().length === 0 || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const createOutcome = await createList(
      client,
      copyName,
      copyShared && household ? household.id : null,
    );

    if (!createOutcome.ok) {
      setBusy(false);
      setError(createOutcome.message);
      return;
    }

    const newListId = createOutcome.value;

    const addOutcome = await addItems(client, newListId, session.itemNames, null);

    if (!addOutcome.ok) {
      setBusy(false);
      setError(addOutcome.message);
      resetComposer();
      return;
    }

    // Unconditional, unlike ListDetailScreen's own copy flow — a shop_sessions
    // row always has a non-null location_id (the migration's own not-null
    // constraint), so there is no "source has no location" case to guard here.
    const attachOutcome = await attachLocation(client, newListId, session.locationId);

    if (!attachOutcome.ok) {
      setBusy(false);
      setError(attachOutcome.message);
      resetComposer();
      return;
    }

    await onListsChanged();
    setBusy(false);
    resetComposer();
    navigation.navigate('ListDetail', { listId: newListId });
  }

  if (view.status === 'loading' || locationsView.status === 'loading') {
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

  if (locationsView.status === 'error') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ErrorNote message={locationsView.message} />
      </Screen>
    );
  }

  if (view.sessions.length === 0) {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <EmptyState
          heading="No shops recorded yet"
          body="Finish a shop from Shopping Mode and it shows up here."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      {error ? <ErrorNote message={error} /> : null}

      {view.sessions.map((session) => {
        const locationName = locationNameFor(session);
        const composing = copyingSessionId === session.id;

        return (
          <Card key={session.id}>
            <Text style={styles.locationName}>{locationName}</Text>
            <Body>
              {`${formatCompletedAt(session.completedAt)} · ${session.itemNames.length} ${
                session.itemNames.length === 1 ? 'item' : 'items'
              }`}
            </Body>

            {composing ? (
              <View style={styles.composer}>
                <Field
                  label="New list name"
                  value={copyName}
                  onChangeText={setCopyName}
                  autoCapitalize="sentences"
                  autoFocus
                  maxLength={60}
                  editable={!busy}
                  onSubmitEditing={() => void submitCopy(session)}
                  returnKeyType="done"
                />
                {household ? (
                  <Row
                    label={`Share with ${household.name}`}
                    leading={
                      <CheckTarget
                        checked={copyShared}
                        onToggle={() => setCopyShared(!copyShared)}
                        accessibilityLabel={`Share with ${household.name}`}
                        disabled={busy}
                      />
                    }
                  />
                ) : null}
                <PrimaryButton
                  label="Create"
                  onPress={() => void submitCopy(session)}
                  busy={busy}
                  disabled={copyName.trim().length === 0}
                />
                <SecondaryButton label="Cancel" onPress={cancelCopy} disabled={busy} />
              </View>
            ) : (
              <SecondaryButton
                label="Start new list from this"
                onPress={() => beginCopy(session)}
                disabled={busy}
              />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

function formatCompletedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    locationName: {
      fontSize: tokens.fontSize.title,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    composer: {
      gap: tokens.space.sm,
    },
  });
}
