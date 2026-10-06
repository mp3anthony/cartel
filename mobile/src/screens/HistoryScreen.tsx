import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ButtonRow,
  Card,
  CheckTarget,
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
import { ChevronIcon } from '../components/ScopeIcon';
import { useLocations } from '../hooks/useLocations';
import { useShopSessions } from '../hooks/useShopSessions';
import type { Household } from '../lib/household';
import { addItems, attachLocation, createList, itemLabel } from '../lib/lists';
import {
  deleteAllShopSessions,
  deleteShopSession,
  notBoughtItems,
  type ShopSessionRow,
} from '../lib/shopSessions';
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
 * write side is `ShoppingScreen.finishThisShop()`. Every row that appears
 * here is a snapshot "Finish shopping" recorded at the moment it was
 * pressed: the location shopped, what was on the list for that round, and
 * which of those were actually checked off. Nothing on this screen
 * changes what that snapshot says — it is read-only history, bounded to the
 * most recent `SHOP_SESSION_HISTORY_CAP` shops (`../lib/shopSessions`) and
 * scoped by the same RLS an owner-or-household-member gets everywhere else
 * in this app (migration 20260811000003).
 *
 * Each entry is a collapsed card (#89): a pressable header with the store as
 * its title, a quieter "{list name} · {date}" line, and a chevron. Expanding it
 * shows what was bought (`checkedItemNames`, in the order it was ticked), then
 * a collapsed "Not bought (n)" group (`notBoughtItems()`), then the entry's
 * actions, "Start new list from this" and "Delete" (with their composer and
 * confirm), which exist only inside an expanded card. "Clear all history"
 * stays at the top. The list name is read through an embed (`list:lists(name)`),
 * so a rename shows up here and a removed list simply drops that part of the
 * line.
 *
 * "Start new list from this" is a template flow: it creates a brand-new list,
 * populates it with the session's `itemNames` (the round's snapshot, not
 * `checkedItemNames` — templating means "give me what I shopped for," not "give
 * me what I already got"), and attaches it to the same location the shop
 * happened at. One inline composer at a time (`copyingSessionId`), matching this
 * codebase's established one-row-at-a-time shape (`ShoppingScreen`'s
 * `editingItemId`, `ListDetailScreen`'s new copy composer below its own action
 * cluster) — deliberately not a shared component with either of those, see
 * `ListDetailScreen.tsx`'s own copy-composer comment for why.
 *
 * Two real, permanent-delete actions (issue #57): removing one card
 * (`confirmingDeleteId`, the same in-place-Confirm shape `ListDetailScreen`'s
 * own "Remove list" uses) and "Clear all history", which wipes every entry
 * currently visible to this user under RLS — not just this screen's own
 * capped page (`deleteAllShopSessions`'s own doc comment covers why it isn't
 * scoped to `SHOP_SESSION_HISTORY_CAP`). Neither is soft-delete/undo; both
 * ask first, per the issue's own explicit instruction. A card's copy
 * composer, its own delete confirm, and the screen-level clear-all confirm
 * are mutually exclusive — opening one resets the others, so at most one
 * confirmation is ever on screen at a time. Collapsing a card resets only the
 * composer or confirm that card owns, and never while a write is in flight (the
 * in-flight handler resets on completion).
 */
export function HistoryScreen({ client, household, navigation, onListsChanged }: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { view, refresh } = useShopSessions(client);
  const { view: locationsView } = useLocations(client);

  const [copyingSessionId, setCopyingSessionId] = useState<string | null>(null);
  const [copyName, setCopyName] = useState('');
  const [copyShared, setCopyShared] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  // Cards start collapsed. Both sets hold session ids; "Not bought" has its own
  // expansion on top of its card's.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [notBoughtOpenIds, setNotBoughtOpenIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function locationNameFor(session: ShopSessionRow): string {
    if (locationsView.status !== 'loaded') {
      return 'a store';
    }
    return (
      locationsView.locations.find((location) => location.id === session.locationId)?.name ??
      'a store'
    );
  }

  // The card title: the store, falling back to the list's name when the store cannot
  // be found (not expected, since location_id is not null).
  function cardTitleFor(session: ShopSessionRow): string {
    if (locationsView.status === 'loaded') {
      const found = locationsView.locations.find((location) => location.id === session.locationId);
      if (found) {
        return found.name;
      }
    }
    return session.listName ?? 'a store';
  }

  function toggleExpanded(session: ShopSessionRow) {
    const wasExpanded = expandedIds.has(session.id);

    if (wasExpanded && !busy) {
      // Collapsing resets only what this card owns; another card's open composer or
      // confirm is left alone. Skipped while busy: the in-flight handler resets on
      // completion, and resetting now would orphan its state.
      if (copyingSessionId === session.id) {
        resetComposer();
      }
      if (confirmingDeleteId === session.id) {
        setConfirmingDeleteId(null);
      }
    }

    setExpandedIds((current) => {
      const next = new Set(current);
      if (wasExpanded) {
        next.delete(session.id);
      } else {
        next.add(session.id);
      }
      return next;
    });
  }

  function toggleNotBought(session: ShopSessionRow) {
    setNotBoughtOpenIds((current) => {
      const next = new Set(current);
      if (next.has(session.id)) {
        next.delete(session.id);
      } else {
        next.add(session.id);
      }
      return next;
    });
  }

  function beginCopy(session: ShopSessionRow) {
    setError(null);
    setConfirmingDeleteId(null);
    setConfirmingClearAll(false);
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

  function beginDeleteSession(session: ShopSessionRow) {
    setError(null);
    resetComposer();
    setConfirmingClearAll(false);
    setConfirmingDeleteId(session.id);
  }

  function cancelDeleteSession() {
    setError(null);
    setConfirmingDeleteId(null);
  }

  async function deleteSessionNow(session: ShopSessionRow) {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const outcome = await deleteShopSession(client, session.id);

    if (!outcome.ok) {
      setBusy(false);
      setError(outcome.message);
      return;
    }

    await refresh();
    setConfirmingDeleteId(null);
    setBusy(false);
  }

  function beginClearAll() {
    setError(null);
    resetComposer();
    setConfirmingDeleteId(null);
    setConfirmingClearAll(true);
  }

  function cancelClearAll() {
    setError(null);
    setConfirmingClearAll(false);
  }

  async function clearAllNow() {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const outcome = await deleteAllShopSessions(client);

    if (!outcome.ok) {
      setBusy(false);
      setError(outcome.message);
      return;
    }

    await refresh();
    setConfirmingClearAll(false);
    setBusy(false);
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

    const addOutcome = await addItems(
      client,
      newListId,
      session.itemNames.map((name, index) => ({
        name,
        quantity: session.itemQuantities[index] ?? 1,
      })),
      null,
    );

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

      {confirmingClearAll ? (
        <Confirm
          message="This permanently deletes every shop in your history — not just what's shown here. This can’t be undone."
          confirmLabel="Clear all history"
          onConfirm={clearAllNow}
          onCancel={cancelClearAll}
          busy={busy}
        />
      ) : (
        <SecondaryButton
          label="Clear all history"
          onPress={beginClearAll}
          disabled={busy}
        />
      )}

      {view.sessions.map((session) => {
        const title = cardTitleFor(session);
        const secondary = session.listName
          ? `${session.listName} · ${formatCompletedAt(session.completedAt)}`
          : formatCompletedAt(session.completedAt);
        const expanded = expandedIds.has(session.id);
        const notBought = notBoughtItems(session);
        const notBoughtOpen = notBoughtOpenIds.has(session.id);
        const composing = copyingSessionId === session.id;
        const confirmingDelete = confirmingDeleteId === session.id;

        return (
          <Card key={session.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${secondary}`}
              // Both spellings, same as `CheckTarget`: react-native-web 0.21 does not
              // map `accessibilityState.expanded` to `aria-expanded`.
              aria-expanded={expanded}
              accessibilityState={{ expanded }}
              onPress={() => toggleExpanded(session)}
              style={({ pressed }) => [styles.cardHeader, pressed && styles.headerPressed]}
            >
              <View style={styles.cardHeaderText}>
                <Text style={styles.locationName}>{title}</Text>
                <Text style={styles.secondary}>{secondary}</Text>
              </View>
              <ChevronIcon expanded={expanded} />
            </Pressable>

            {expanded ? (
              <>
                <View style={styles.itemList}>
                  {session.checkedItemNames.map((name, index) => (
                    <Text key={`${name}-${index}`} style={styles.itemLine}>
                      {itemLabel(name, session.checkedItemQuantities[index] ?? 1)}
                    </Text>
                  ))}
                </View>

                {notBought.length > 0 ? (
                  <View style={styles.itemList}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Not bought, ${notBought.length}`}
                      aria-expanded={notBoughtOpen}
                      accessibilityState={{ expanded: notBoughtOpen }}
                      onPress={() => toggleNotBought(session)}
                      style={({ pressed }) => [styles.notBoughtHeader, pressed && styles.headerPressed]}
                    >
                      <Text style={styles.notBoughtLabel}>{`Not bought (${notBought.length})`}</Text>
                      <ChevronIcon expanded={notBoughtOpen} />
                    </Pressable>
                    {notBoughtOpen
                      ? notBought.map(({ name, quantity }, index) => (
                          <Text key={`${name}-${index}`} style={styles.notBoughtLine}>
                            {itemLabel(name, quantity)}
                          </Text>
                        ))
                      : null}
                  </View>
                ) : null}

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
                    <ButtonRow>
                      <PrimaryButton
                        label="Create"
                        onPress={() => void submitCopy(session)}
                        busy={busy}
                        disabled={copyName.trim().length === 0}
                      />
                      <SecondaryButton label="Cancel" onPress={cancelCopy} disabled={busy} />
                    </ButtonRow>
                  </View>
                ) : confirmingDelete ? (
                  <Confirm
                    message="This permanently deletes this shop from your history. This can’t be undone."
                    confirmLabel="Delete"
                    onConfirm={() => void deleteSessionNow(session)}
                    onCancel={cancelDeleteSession}
                    busy={busy}
                  />
                ) : (
                  <ButtonRow>
                    <SecondaryButton
                      label="Start new list from this"
                      onPress={() => beginCopy(session)}
                      disabled={busy}
                    />
                    <SecondaryButton
                      label="Delete"
                      onPress={() => beginDeleteSession(session)}
                      disabled={busy}
                    />
                  </ButtonRow>
                )}
              </>
            ) : null}
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
    // The card header is a button; `minHeight` carries the 44pt floor (hitSlop does
    // nothing on react-native-web).
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.md,
      minHeight: tokens.minTouchTarget,
    },
    cardHeaderText: {
      flex: 1,
      gap: tokens.space.xs,
    },
    headerPressed: {
      opacity: 0.7,
    },
    locationName: {
      fontSize: tokens.fontSize.title,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    secondary: {
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
    },
    itemList: {
      gap: tokens.space.xs,
    },
    itemLine: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.body,
    },
    notBoughtHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.space.md,
      minHeight: tokens.minTouchTarget,
    },
    notBoughtLabel: {
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
      color: tokens.color.textSecondary,
    },
    notBoughtLine: {
      color: tokens.color.textSecondary,
      fontSize: tokens.fontSize.body,
    },
    composer: {
      gap: tokens.space.sm,
    },
  });
}
