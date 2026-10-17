import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import { CloseIcon } from '../components/HeaderIcons';
import { ChevronIcon, ChevronRightIcon } from '../components/ScopeIcon';
import { GraphPopup } from '../components/GraphPopup';
import { StoreBadge } from '../components/StoreBadge';
import {
  ButtonRow,
  Confirm,
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
import { useItemsLocated } from '../hooks/useItemsLocated';
import { useLocations } from '../hooks/useLocations';
import { useShopSessions } from '../hooks/useShopSessions';
import {
  filterLabel,
  historyFilterKey,
  parseHistoryFilter,
  type HistoryFilter,
} from '../lib/historyFilter';
import type { Household } from '../lib/household';
import { addItems, attachLocation, createList, itemLabel } from '../lib/lists';
import type { LocationRow } from '../lib/locations';
import { formatCompletedAt, itemsLocatedText, shopRowText } from '../lib/shopHistory';
import {
  deleteAllShopSessions,
  deleteShopSession,
  notBoughtItems,
  type ShopSessionRow,
} from '../lib/shopSessions';
import type { RootStackParamList } from '../navigation/types';
import { pressFill, pressScale, useReduceMotion } from '../theme/motion';
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
 * most recent `SHOP_SESSION_HISTORY_CAP` shops (`../lib/shopSessions`), or every
 * shop matching a History filter (#216: route params `period`, `start`, `stores`, set by
 * Home's graph pop-ups; a chip shows it and clears it), and
 * scoped by the same RLS an owner-or-household-member gets everywhere else
 * in this app (migration 20260811000003).
 *
 * Each entry is a compact row (#229): the Store's badge and name, a quieter "date · list
 * name" line and a chevron. A row opens a pop-up (`GraphPopup`, the Home graph pop-up
 * pattern) with the Store, "date · list name" and the "N items located" line pinned, a
 * scrolling body of what was bought (`checkedItemNames`, in the order it was ticked) and a
 * collapsed "Not bought (n)" group (`notBoughtItems()`), and a pinned footer with the entry's
 * actions, "Reuse list" and "Delete" side by side. The "New list name" composer opens in the
 * scrolling body (a footer composer could overflow a short viewport or the iOS keyboard); the
 * delete Confirm takes the footer. "Clear all history" stays at the top. The list name is
 * read through an embed (`list:lists(name)`), so a rename shows up here and a removed list
 * simply drops that part of the line.
 *
 * The open entry is a snapshot (`openSession`), separate from `popupVisible`: the card's
 * content survives the fade-out when a delete or a realtime refresh removes the entry, and
 * closing only flips `popupVisible`.
 *
 * "Reuse list" is a template flow: it creates a brand-new list,
 * populates it with the session's `itemNames` (the round's snapshot, not
 * `checkedItemNames` — templating means "give me what I shopped for," not "give
 * me what I already got"), and attaches it to the same location the shop
 * happened at. One composer at a time, matching this codebase's established shape
 * (`ShoppingScreen`'s `editingItemId`, `ListDetailScreen`'s new copy composer below its own
 * action cluster) — deliberately not a shared component with either of those, see
 * `ListDetailScreen.tsx`'s own copy-composer comment for why.
 *
 * Two real, permanent-delete actions (issue #57): removing one entry
 * (`confirmingDelete`, the same in-place-Confirm shape `ListDetailScreen`'s
 * own "Remove list" uses) and "Clear all history", which wipes every entry
 * currently visible to this user under RLS — not just this screen's own
 * capped page (`deleteAllShopSessions`'s own doc comment covers why it isn't
 * scoped to `SHOP_SESSION_HISTORY_CAP`). Neither is soft-delete/undo; both
 * ask first, per the issue's own explicit instruction. The pop-up's composer and delete
 * confirm are mutually exclusive, and "Clear all history" is unreachable while the pop-up is
 * open. Closing the pop-up resets what it owns, never while a write is in flight.
 */
export function HistoryScreen({ client, household, navigation, onListsChanged, route }: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  // The History filter (#216) from the route params: parsed defensively (a bad part is
  // dropped), and keyed by a string so an equal filter never reloads.
  const { period, start, stores } = route.params ?? {};
  const filter = useMemo(
    () => parseHistoryFilter({ period, start, stores }, new Date()),
    [period, start, stores],
  );
  const filterKey = historyFilterKey(filter);
  const { view, refresh } = useShopSessions(client, filter, filterKey);
  const { view: locationsView } = useLocations(client);

  // The open entry's snapshot and whether its pop-up shows (see the header comment).
  const [openSession, setOpenSession] = useState<ShopSessionRow | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyName, setCopyName] = useState('');
  const [copyShared, setCopyShared] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [notBoughtOpen, setNotBoughtOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Guards against a double press before `busy` has rendered.
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // A different filter is a different list: close the pop-up and drop any open composer or
  // confirm.
  useEffect(() => {
    setPopupVisible(false);
    resetPopupState();
    setConfirmingClearAll(false);
    setError(null);
  }, [filterKey]);

  // The open entry vanished (deleted elsewhere, or by a realtime refresh): close the pop-up
  // but keep the snapshot, so the card does not blank or crash during the fade.
  useEffect(() => {
    if (
      popupVisible &&
      openSession &&
      view.status === 'loaded' &&
      !view.sessions.some((session) => session.id === openSession.id)
    ) {
      setPopupVisible(false);
    }
  }, [popupVisible, openSession, view]);

  const openStore =
    openSession && locationsView.status === 'loaded'
      ? (locationsView.locations.find((location) => location.id === openSession.locationId) ??
        null)
      : null;
  const itemsLocated = useItemsLocated(
    client,
    openSession && openStore
      ? {
          sessionId: openSession.id,
          locationId: openSession.locationId,
          completedAt: openSession.completedAt,
        }
      : null,
  );

  function clearFilter() {
    navigation.setParams({ period: undefined, start: undefined, stores: undefined });
  }

  function findStore(locationId: string): LocationRow | null {
    if (locationsView.status !== 'loaded') {
      return null;
    }
    return locationsView.locations.find((location) => location.id === locationId) ?? null;
  }

  function storeNameFor(locationId: string): string {
    return findStore(locationId)?.name ?? 'a store';
  }

  function resetComposer() {
    setCopying(false);
    setCopyName('');
    setCopyShared(false);
  }

  function resetPopupState() {
    resetComposer();
    setConfirmingDelete(false);
    setNotBoughtOpen(false);
  }

  function openRow(session: ShopSessionRow) {
    if (busyRef.current) {
      return;
    }
    setError(null);
    setConfirmingClearAll(false);
    resetPopupState();
    setOpenSession(session);
    setPopupVisible(true);
  }

  // Ignored while a write is in flight: the in-flight handler finishes its own state.
  function closePopup() {
    if (busyRef.current) {
      return;
    }
    setPopupVisible(false);
    setError(null);
    resetPopupState();
  }

  function beginCopy(session: ShopSessionRow) {
    setError(null);
    setConfirmingDelete(false);
    setConfirmingClearAll(false);
    setCopying(true);
    setCopyName(
      `${findStore(session.locationId)?.name ?? 'a store'} — ${formatCompletedAt(session.completedAt)}`,
    );
    setCopyShared(false);
  }

  function cancelCopy() {
    setError(null);
    resetComposer();
  }

  function beginDeleteSession() {
    setError(null);
    resetComposer();
    setConfirmingClearAll(false);
    setConfirmingDelete(true);
  }

  function cancelDeleteSession() {
    setError(null);
    setConfirmingDelete(false);
  }

  async function deleteSessionNow(session: ShopSessionRow) {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);

    const outcome = await deleteShopSession(client, session.id);

    if (!outcome.ok) {
      busyRef.current = false;
      setBusy(false);
      setError(outcome.message);
      return;
    }

    await refresh();
    // Only hide the card: its state resets on the next open, so the footer does not flip
    // from the Confirm back to the buttons while it fades.
    setPopupVisible(false);
    busyRef.current = false;
    setBusy(false);
  }

  function beginClearAll() {
    setError(null);
    setConfirmingClearAll(true);
  }

  function cancelClearAll() {
    setError(null);
    setConfirmingClearAll(false);
  }

  async function clearAllNow() {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);

    const outcome = await deleteAllShopSessions(client);

    if (!outcome.ok) {
      busyRef.current = false;
      setBusy(false);
      setError(outcome.message);
      return;
    }

    await refresh();
    setConfirmingClearAll(false);
    busyRef.current = false;
    setBusy(false);
  }

  async function submitCopy(session: ShopSessionRow) {
    if (copyName.trim().length === 0 || busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);

    const createOutcome = await createList(
      client,
      copyName,
      copyShared && household ? household.id : null,
    );

    if (!createOutcome.ok) {
      busyRef.current = false;
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
      busyRef.current = false;
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
      busyRef.current = false;
      setBusy(false);
      setError(attachOutcome.message);
      resetComposer();
      return;
    }

    await onListsChanged();
    busyRef.current = false;
    setBusy(false);
    resetComposer();
    // Close the pop-up first, so it is not left over the list screen.
    setPopupVisible(false);
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

  if (view.sessions.length === 0 && filter !== null) {
    return (
      <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
        <FilterChip filter={filter} nameFor={storeNameFor} onClear={clearFilter} />
        <EmptyState
          heading="No matching shops"
          body="Nothing recorded for this filter. Clear it to see all your shops."
        />
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

  const popupText = openSession
    ? shopRowText({
        storeName: openStore?.name ?? null,
        listName: openSession.listName,
        completedAt: openSession.completedAt,
      })
    : null;
  const notBought = openSession ? notBoughtItems(openSession) : [];

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      {filter !== null ? (
        <FilterChip filter={filter} nameFor={storeNameFor} onClear={clearFilter} />
      ) : null}

      {error && !popupVisible ? <ErrorNote message={error} /> : null}

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

      {view.sessions.map((session) => (
        <ShopHistoryRow
          key={session.id}
          chain={findStore(session.locationId)?.chain}
          text={shopRowText({
            storeName: findStore(session.locationId)?.name ?? null,
            listName: session.listName,
            completedAt: session.completedAt,
          })}
          onPress={() => openRow(session)}
        />
      ))}

      {openSession && popupText ? (
        <GraphPopup
          visible={popupVisible}
          title={popupText.title}
          onClose={closePopup}
          pinned={
            <View style={styles.popupPinned}>
              <Text style={styles.secondary}>{popupText.secondary}</Text>
              {openStore ? (
                <Text accessibilityLiveRegion="polite" style={styles.itemsLocated}>
                  {itemsLocated.status === 'loaded'
                    ? itemsLocatedText(itemsLocated.count)
                    : itemsLocated.status === 'error'
                      ? 'Couldn’t count items located'
                      : 'Counting items located…'}
                </Text>
              ) : null}
            </View>
          }
          footer={
            <>
              {error ? <ErrorNote message={error} /> : null}
              {confirmingDelete ? (
                <Confirm
                  message="This permanently deletes this shop from your history. This can’t be undone."
                  confirmLabel="Delete"
                  onConfirm={() => void deleteSessionNow(openSession)}
                  onCancel={cancelDeleteSession}
                  busy={busy}
                />
              ) : copying ? null : (
                // Deliberate exception to content-sized buttons (#229): an equal-width pair
                // filling the footer, sized by the row parent as on Home's Start a shop card.
                <View style={styles.popupFooterButtons}>
                  <View style={styles.popupFooterSlot}>
                    <SecondaryButton
                      label="Reuse list"
                      onPress={() => beginCopy(openSession)}
                      disabled={busy}
                      fullWidth
                    />
                  </View>
                  <View style={styles.popupFooterSlot}>
                    <SecondaryButton
                      label="Delete"
                      onPress={beginDeleteSession}
                      disabled={busy}
                      fullWidth
                    />
                  </View>
                </View>
              )}
            </>
          }
        >
          {copying ? (
            <View style={styles.composer}>
              <Field
                label="New list name"
                value={copyName}
                onChangeText={setCopyName}
                autoCapitalize="sentences"
                autoFocus
                maxLength={60}
                editable={!busy}
                onSubmitEditing={() => void submitCopy(openSession)}
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
                  onPress={() => void submitCopy(openSession)}
                  busy={busy}
                  disabled={copyName.trim().length === 0}
                />
                <SecondaryButton label="Cancel" onPress={cancelCopy} disabled={busy} />
              </ButtonRow>
            </View>
          ) : null}

          <View style={styles.itemList}>
            {openSession.checkedItemNames.map((name, index) => (
              <Text key={`${name}-${index}`} style={styles.itemLine}>
                {itemLabel(name, openSession.checkedItemQuantities[index] ?? 1)}
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
                onPress={() => setNotBoughtOpen(!notBoughtOpen)}
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
        </GraphPopup>
      ) : null}
    </Screen>
  );
}

/**
 * One shop as a compact row (#229), styled like the Stores screen's `StorePickerRow`: the
 * Store's chain badge, its name wrapping in full, "date · list name" underneath and a chevron.
 * The whole row is one button that opens the shop's pop-up.
 */
function ShopHistoryRow({
  chain,
  text,
  onPress,
}: {
  chain: string | null | undefined;
  text: { title: string; secondary: string; accessibilityLabel: string };
  onPress: () => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text.accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <StoreBadge chain={chain} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{text.title}</Text>
        <Text style={styles.secondary}>{text.secondary}</Text>
      </View>
      <ChevronRightIcon />
    </Pressable>
  );
}

/**
 * The active History filter and its way out, as one chip: "Week of 6 Oct · Clear" with a
 * close glyph. Same structure as the Item location picker's chip (a 44pt hit box around a
 * 36pt pill), but the pill wraps its text rather than keeping one line.
 */
function FilterChip({
  filter,
  nameFor,
  onClear,
}: {
  filter: HistoryFilter;
  nameFor: (locationId: string) => string;
  onClear: () => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const reduceMotion = useReduceMotion();
  const { text, accessibilityLabel } = filterLabel(filter, nameFor);

  return (
    <View style={styles.chipRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onClear}
        style={({ pressed }) => [styles.chipTarget, pressScale(pressed, reduceMotion)]}
      >
        {({ pressed }) => (
          <View style={[styles.chip, pressed && styles.chipPressed, pressFill(pressed, reduceMotion)]}>
            <Text
              style={[
                styles.chipLabel,
                pressed && styles.chipLabelPressed,
                pressFill(pressed, reduceMotion),
              ]}
            >
              {`${text} · Clear`}
            </Text>
            <CloseIcon color={pressed ? tokens.color.accentContrast : tokens.color.accent} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    // The row is a button; `minHeight` carries the 44pt floor (hitSlop does nothing on
    // react-native-web).
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.md,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.md,
    },
    rowPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    rowText: {
      flex: 1,
      gap: tokens.space.xs,
    },
    rowTitle: {
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    headerPressed: {
      opacity: 0.7,
    },
    secondary: {
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
    },
    popupPinned: {
      gap: tokens.space.xs,
    },
    itemsLocated: {
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      color: tokens.color.textSecondary,
    },
    popupFooterButtons: {
      flexDirection: 'row',
      gap: tokens.space.sm,
    },
    // Equal slots for the footer pair, as on Home's Start a shop card (#213).
    popupFooterSlot: {
      flex: 1,
      minWidth: 0,
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
    chipRow: {
      flexDirection: 'row',
    },
    chipTarget: {
      flexShrink: 1,
      minHeight: tokens.minTouchTarget,
      justifyContent: 'center',
      borderRadius: tokens.radius.pill,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.xs,
      minHeight: 36,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.xs,
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.color.accent,
      backgroundColor: tokens.color.accentWash,
    },
    chipPressed: {
      backgroundColor: tokens.color.accent,
    },
    chipLabel: {
      flexShrink: 1,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    chipLabelPressed: {
      color: tokens.color.accentContrast,
    },
  });
}
