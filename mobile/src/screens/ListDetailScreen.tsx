import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Body,
  CheckTarget,
  CompactItemRow,
  Confirm,
  EmptyState,
  ErrorNote,
  Field,
  InlineRowEditor,
  NAVIGATOR_EDGES,
  PrimaryButton,
  QuantityControl,
  QuantityEditor,
  Row,
  RowConfirm,
  Screen,
  SecondaryButton,
} from '../components/ui';
import { ReorderableList } from '../components/ReorderableList';
import { DragHandleIcon } from '../components/RowIcons';
import { ScopeIcon } from '../components/ScopeIcon';
import { useListItems } from '../hooks/useListItems';
import { useQuantityStepper } from '../hooks/useQuantityStepper';
import type { ListsView } from '../hooks/useLists';
import { useLocationItems } from '../hooks/useLocationItems';
import { useLocations } from '../hooks/useLocations';
import type { Household, Outcome } from '../lib/household';
import { sectionForItemName, tagItemLocation } from '../lib/locationItems';
import { voteLocationItemCorrection } from '../lib/locationItemVotes';
import {
  addItem,
  addItems,
  attachLocation,
  createList,
  MAX_QUANTITY,
  moveItem,
  promoteList,
  removeItem,
  removeList,
  renameItem,
  renameList,
  setChecked,
  type ListItemRow,
} from '../lib/lists';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ListDetail'> & {
  client: SupabaseClient;
  lists: ListsView;
  onListsChanged: () => Promise<void>;
  inHousehold: boolean;
  household: Household | null;
};

/**
 * One list, and everything you can do to it.
 *
 * The list's own name and scope come from the loaded index rather than a query of
 * their own, which is also what makes the not-found case answerable: RLS returns no
 * row for a list the caller cannot see, so a stale deep link, a foreign id and a
 * removed list are the same absence, and none of them can be told apart by asking
 * again.
 *
 * Items render as `CompactItemRow`s (#80, under #76), the same density as Shopping
 * Mode. Issue #102 slice 2 retired the pencil: the check circle ticks, tapping the name
 * turns that one row into an `InlineRowEditor` (rename field, ✓/✕), and a pin, shown only
 * when a store is attached, opens the same editor in a location mode. Only one row is
 * edited at a time (`editingId` plus `editingMode`). The location mode's ✓ tags the item when it has no section at
 * this store yet and proposes a correction when it has, the same two writes Shopping
 * Mode makes. No section pill here, which keeps room for the quantity control (#111).
 *
 * Issue #111: each row carries a `QuantityControl` (a "+" at 1, a "×N" chip above it)
 * through the row's `stepper` slot; the chip opens `QuantityEditor` ("− N + Done") in the
 * row's `editor` slot. `quantityEditingId` is one more single slot, mutually exclusive
 * with `editingId` and `confirmingRemoveId`, and it turns dragging off like they do.
 * Quantity writes go through `useQuantityStepper`, deliberately not `mutate()`: that
 * guard drops a tap that lands during a write, and a quantity tap must never be lost.
 * The stepper never toggles check; one tick covers the whole quantity.
 *
 * Issue #102: "×" now sits on the row itself, in place of the old pencil position, and opens an inline
 * `RowConfirm` ("Remove {item}?") in that row's place. It used to live on the editor's
 * second line, whose field is `autoFocus`; the leading guess for "the x did nothing" is
 * that a tap there closed the iOS keyboard, the layout shifted and the tap was lost
 * (not reproduced, see docs/lessons.md). `confirmingRemoveId` is a single slot,
 * mutually exclusive with `editingId`, and a removal confirms through the same
 * `mutate()` as every other write. A confirm for an item that another member removed
 * meanwhile is dropped by the effect below.
 *
 * Issue #102 slice 3: a drag handle on each row (`ReorderableList`) replaces the ↑ ↓
 * buttons. A drop writes one `moveItem` between the neighbours' current positions.
 * `pendingOrder` holds the dropped order on screen for the round trip, so the row does
 * not snap back to its old slot before the reload lands; it is cleared once the write
 * settles, success or not. Dragging is off while a write is in flight, an editor is
 * open, or a removal is being confirmed.
 */
export function ListDetailScreen({
  client,
  household,
  inHousehold,
  lists,
  navigation,
  onListsChanged,
  route,
}: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { listId } = route.params;
  const { view, refresh } = useListItems(client, listId);
  // Resolves the attached location's display name only — attaching/detaching itself
  // is a plain write on the `lists` row via attachLocation(), not anything this hook
  // owns. No `refresh` taken from here: nothing on this screen creates a location.
  const { view: locationsView } = useLocations(client);

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  // What the one open editor is for: the item's name, or its location at the attached
  // store. `editingName` holds the draft text for either.
  const [editingMode, setEditingMode] = useState<'rename' | 'location'>('rename');
  const [renamingList, setRenamingList] = useState(false);
  const [listNameDraft, setListNameDraft] = useState('');
  const [confirmingShare, setConfirmingShare] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [copyComposing, setCopyComposing] = useState(false);
  const [copyName, setCopyName] = useState('');
  const [copyShared, setCopyShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Quantity writes are their own optimistic, never-dropped path, not `mutate()` (#111).
  const { quantityOf, step } = useQuantityStepper({ client, view, refresh, setError });
  // The one row showing the quantity editor ("− N + Done"); mutually exclusive with
  // `editingId` and `confirmingRemoveId`.
  const [quantityEditingId, setQuantityEditingId] = useState<string | null>(null);
  // `busy` is React state, batched: several keydown-triggered `add()` calls fired in
  // the same synchronous burst (a fast typist double-hitting Return) all read the same
  // stale `busy === false` from their closures before any render flushes, so a state
  // check alone never trips. This ref is set synchronously inside `add()` itself,
  // before anything async happens, purely for that re-entrancy guard — `busy` state
  // stays the source of truth for everything UI-facing (button disabling, spinners).
  const busyRef = useRef(false);
  // Same idea for `mutate()` itself: the row editor's arrows and ✓ stay tappable
  // between a tap and the next render, so a fast double-tap on ↓ would otherwise fire
  // two moves computed from the same stale neighbours. Separate from `busyRef` so
  // `add()`, which holds that one across its own `mutate()` call, doesn't block itself.
  const mutatingRef = useRef(false);
  // Mirrors `editingId` synchronously so a write that resolves later can tell whether
  // its own row's editor is still the open one (see `finishEditing`).
  const editingIdRef = useRef<string | null>(null);
  // The one row showing "Remove {item}?", and its synchronous mirror for the same
  // stale-write guard as `editingIdRef`.
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const confirmingRemoveIdRef = useRef<string | null>(null);
  // Item ids in the order a drop has just asked for, until its write settles.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);

  const list =
    lists.status === 'loaded'
      ? lists.lists.find((candidate) => candidate.id === listId) ?? null
      : null;

  // Another member removed the item this row was asking about: nothing is left to
  // confirm. Only reacts to a loaded view, so a reload in progress cannot clear it.
  useEffect(() => {
    if (
      confirmingRemoveId !== null &&
      view.status === 'loaded' &&
      !view.items.some((item) => item.id === confirmingRemoveId)
    ) {
      confirmingRemoveIdRef.current = null;
      setConfirmingRemoveId(null);
    }
  }, [view, confirmingRemoveId]);

  // Same for the quantity editor: its item was removed by another member.
  useEffect(() => {
    if (
      quantityEditingId !== null &&
      view.status === 'loaded' &&
      !view.items.some((item) => item.id === quantityEditingId)
    ) {
      setQuantityEditingId(null);
    }
  }, [view, quantityEditingId]);

  // The pin's data: sections already tagged at the attached store. Called unconditionally
  // (null until a store is attached), above this screen's early returns.
  const { view: locationItems, refresh: refreshLocationItems } = useLocationItems(
    client,
    list?.locationId ?? null,
  );

  // The store was detached (here or by another member) while the location editor was
  // open: its ✓ would have nothing to write to, so close it.
  useEffect(() => {
    if (editingMode === 'location' && editingId !== null && !list?.locationId) {
      editingIdRef.current = null;
      setEditingId(null);
      setEditingName('');
    }
  }, [list?.locationId, editingMode, editingId]);

  useLayoutEffect(() => {
    // The header carries the list's name for the same reason it carries the
    // household's on the household screen: it is also what carries back, and naming
    // the same thing twice on one screen is what the header replaced.
    if (list) {
      navigation.setOptions({ title: list.name });
    }
  }, [list, navigation]);

  /**
   * Every write on this screen is the same four steps — mark busy, clear the last
   * error, write, reload — differing only in the write itself and in what gets
   * cleared afterwards. Spelled out this many times, the plumbing is what you read and
   * the write is what you skim past. `after` runs only on success, which is why the
   * caller's cleanup belongs there rather than below the await.
   */
  async function mutate(
    write: () => Promise<Outcome<unknown>>,
    after?: () => void | Promise<void>,
  ) {
    if (mutatingRef.current) {
      return;
    }

    mutatingRef.current = true;

    try {
      setBusy(true);
      setError(null);

      const outcome = await write();

      if (!outcome.ok) {
        setBusy(false);
        setError(outcome.message);
        return;
      }

      await refresh();
      await after?.();
      setBusy(false);
    } finally {
      mutatingRef.current = false;
    }
  }

  function beginRemoving(itemId: string) {
    setError(null);
    // One slot at a time with the editor: opening one closes the other.
    cancelEditing();
    setQuantityEditingId(null);
    confirmingRemoveIdRef.current = itemId;
    setConfirmingRemoveId(itemId);
  }

  function cancelRemoving() {
    confirmingRemoveIdRef.current = null;
    setConfirmingRemoveId(null);
  }

  // Clears the confirmation only if it is still the one for `itemId`.
  function finishRemoving(itemId: string) {
    if (confirmingRemoveIdRef.current === itemId) {
      cancelRemoving();
    }
  }

  function beginQuantityEditing(itemId: string) {
    setError(null);
    cancelEditing();
    cancelRemoving();
    setQuantityEditingId(itemId);
  }

  function beginEditing(item: ListItemRow) {
    setError(null);
    cancelRemoving();
    setQuantityEditingId(null);
    editingIdRef.current = item.id;
    setEditingMode('rename');
    setEditingName(item.name);
    setEditingId(item.id);
  }

  function beginLocating(item: ListItemRow) {
    setError(null);
    cancelRemoving();
    setQuantityEditingId(null);
    editingIdRef.current = item.id;
    setEditingMode('location');
    setEditingName('');
    setEditingId(item.id);
  }

  function cancelEditing() {
    editingIdRef.current = null;
    setEditingId(null);
    setEditingName('');
  }

  // Closes the editor only if it is still the one for `itemId`: the user may have
  // opened another row's editor while this row's write was in flight, and closing it
  // would lose their typing.
  function finishEditing(itemId: string) {
    if (editingIdRef.current === itemId) {
      cancelEditing();
    }
  }

  function add(items: ListItemRow[]) {
    // The Add button is disabled on an empty draft, but the keyboard's return key
    // reaches here regardless. `list_items.name` carries a length check, so without
    // this the round trip comes back as raw constraint prose that `humanise` has no
    // mapping for and shows the user the schema. The `busy` check exists because the
    // field itself no longer disables while a write is in flight — the keyboard stays
    // up between submits — so without it a fast double-Return could fire two writes.
    if (draft.trim().length === 0 || busy || busyRef.current) {
      return;
    }

    // New items append, so the lower bound is the last item the caller can see and
    // the upper bound is nothing at all.
    const last = items.length > 0 ? items[items.length - 1].position : null;

    busyRef.current = true;

    void mutate(
      () => addItem(client, listId, draft, last),
      () => setDraft(''),
    ).finally(() => {
      busyRef.current = false;
    });
  }

  function commitRename() {
    const id = editingId;

    if (!id || editingName.trim().length === 0) {
      return;
    }

    void mutate(
      () => renameItem(client, id, editingName),
      () => finishEditing(id),
    );
  }

  // First tag for an item with no section at this store, a correction proposal for one
  // that has one: the same two writes Shopping Mode's editor makes. Copy and wording are
  // kept local to each screen (docs/conventions.md).
  function commitLocation(item: ListItemRow, section: string | null) {
    if (!list || list.locationId === null || editingName.trim().length === 0) {
      return;
    }

    const locationId = list.locationId;
    const proposed = editingName;

    void mutate(
      () =>
        section !== null
          ? voteLocationItemCorrection(client, locationId, item.name, proposed)
          : tagItemLocation(client, locationId, item.name, proposed),
      async () => {
        await refreshLocationItems();
        finishEditing(item.id);
      },
    );
  }

  // A drop lands between two neighbours, read from the order the list showed when the
  // drag began and excluding the moved item, exactly as moveItem() documents. Positions
  // come from the loaded rows by id; a neighbour another member has removed since reads
  // as the end of the list, which still lands the item somewhere sensible.
  function dropItem(
    itemId: string,
    beforeId: string | null,
    afterId: string | null,
    items: ListItemRow[],
  ) {
    if (mutatingRef.current) {
      return;
    }

    const position = (id: string | null) =>
      items.find((candidate) => candidate.id === id)?.position ?? null;
    const others = items.map((item) => item.id).filter((id) => id !== itemId);
    const at = beforeId === null ? 0 : others.indexOf(beforeId) + 1;

    others.splice(at, 0, itemId);
    setPendingOrder(others);

    void mutate(() =>
      moveItem(client, itemId, position(beforeId), position(afterId)),
    ).finally(() => setPendingOrder(null));
  }

  function share() {
    void mutate(
      () => promoteList(client, listId),
      async () => {
        // The scope lives on the list row, not on the items, so the index is what has
        // to be reloaded for this screen's badge — and the index's own — to agree
        // with the database. Both screens read the same loaded lists, so one reload
        // settles both.
        await onListsChanged();
        setConfirmingShare(false);
      },
    );
  }

  function removeLocation() {
    // `location_id` lives on the `lists` row the app-wide index holds, not on
    // anything useListItems reloads — same reasoning as share()/renameList() above,
    // so onListsChanged is what settles this screen and the Lists screen behind it.
    void mutate(() => attachLocation(client, listId, null), onListsChanged);
  }

  function startRenameList() {
    if (!list) {
      return;
    }

    setError(null);
    setListNameDraft(list.name);
    setRenamingList(true);
  }

  function commitRenameList() {
    if (listNameDraft.trim().length === 0) {
      return;
    }

    // Same reasoning as share(): the name lives on the list row the index loaded,
    // not on anything useListItems reloads, so the header and the Lists screen
    // behind it both need that index reloaded to agree with the database.
    void mutate(
      () => renameList(client, listId, listNameDraft),
      async () => {
        await onListsChanged();
        setRenamingList(false);
      },
    );
  }

  function removeListNow() {
    void mutate(
      () => removeList(client, listId),
      async () => {
        // A removed list has nothing left on this screen to show — reload the index
        // so it drops out there too, and leave for the one that still does.
        await onListsChanged();
        navigation.navigate('Lists');
      },
    );
  }

  function beginCopy() {
    if (!list) {
      return;
    }
    setError(null);
    setCopyName(list.name);
    setCopyShared(false);
    setCopyComposing(true);
  }

  function cancelCopy() {
    setCopyComposing(false);
    setCopyName('');
    setCopyShared(false);
  }

  /**
   * A third, explicit copy-composer submit — not shared with HistoryScreen's own
   * `submitCopy` or ListsScreen's create-list `submit`, despite the visible overlap.
   * See this function's own header note below: the three composers' submit logic
   * differs in what feeds `addItems()` (here: this screen's own loaded `items`,
   * already in scope from `useListItems`) and what happens after `createList()`
   * succeeds (`attachLocation()` here is conditional on `list.locationId !== null`
   * — a source list may have no location attached at all — where HistoryScreen's
   * own version is unconditional, because a `shop_sessions` row's `location_id` is
   * never null). A shared component would need most of its behaviour prop-drilled
   * away to cover both differences, which this codebase already treats as not
   * worth it — see `mutate()`'s own doc comment above for the established stance
   * on this class of duplication.
   */
  async function submitCopy(sourceItems: ListItemRow[]) {
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
      sourceItems.map((item) => item.name),
      null,
    );

    if (!addOutcome.ok) {
      setBusy(false);
      setError(addOutcome.message);
      cancelCopy();
      return;
    }

    if (list && list.locationId !== null) {
      const attachOutcome = await attachLocation(client, newListId, list.locationId);

      if (!attachOutcome.ok) {
        setBusy(false);
        setError(attachOutcome.message);
        cancelCopy();
        return;
      }
    }

    await onListsChanged();
    setBusy(false);
    cancelCopy();
    navigation.navigate('ListDetail', { listId: newListId });
  }

  if (lists.status === 'loading') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ActivityIndicator color={tokens.color.accent} size="large" />
      </Screen>
    );
  }

  if (lists.status === 'error') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ErrorNote message={lists.message} />
      </Screen>
    );
  }

  if (!list) {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <EmptyState
          heading="This list isn’t here"
          body="It may have been removed, or it may belong to someone else — lists are private until they are shared with a household."
          actionLabel="Back to your lists"
          onAction={() => navigation.navigate('Lists')}
        />
      </Screen>
    );
  }

  const loadedItems = view.status === 'loaded' ? view.items : [];
  const items = pendingOrder
    ? [...loadedItems].sort((x, y) => pendingOrder.indexOf(x.id) - pendingOrder.indexOf(y.id))
    : loadedItems;
  const dragDisabled =
    busy || editingId !== null || confirmingRemoveId !== null || quantityEditingId !== null;
  const canShare = list.householdId === null && inHousehold;
  const attachedLocation =
    list.locationId && locationsView.status === 'loaded'
      ? locationsView.locations.find((location) => location.id === list.locationId) ??
        null
      : null;

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      <View style={styles.scope}>
        <ScopeIcon shared={list.householdId !== null} householdName={household?.name ?? null} />
      </View>

      {list.locationId ? (
        <>
          <Body>
            {attachedLocation
              ? `Shopping at ${attachedLocation.name}`
              : 'Shopping at a store'}
          </Body>
          <SecondaryButton
            label="Start shopping"
            onPress={() => navigation.navigate('Shopping', { listId })}
            disabled={busy}
          />
          <SecondaryButton
            label="Change store"
            onPress={() =>
              navigation.navigate('Locations', { attachToListId: listId })
            }
            disabled={busy}
          />
          <SecondaryButton
            label="Remove store"
            onPress={removeLocation}
            disabled={busy}
          />
        </>
      ) : (
        <SecondaryButton
          label="Attach a store"
          onPress={() => navigation.navigate('Locations', { attachToListId: listId })}
          disabled={busy}
        />
      )}

      <View style={styles.addComposer}>
        <View style={styles.addField}>
          <Field
            accessibilityLabel="Add an item"
            value={draft}
            onChangeText={setDraft}
            placeholder="Add an item"
            autoCapitalize="sentences"
            maxLength={120}
            onSubmitEditing={() => add(items)}
            returnKeyType="done"
            submitBehavior="submit"
            blurOnSubmit={false}
          />
        </View>
        <PrimaryButton
          label="+"
          accessibilityLabel="Add item"
          compact
          onPress={() => add(items)}
          busy={busy}
          disabled={draft.trim().length === 0}
          keepFocus
        />
      </View>

      {error ? <ErrorNote message={error} /> : null}

      {view.status === 'loading' ? (
        <ActivityIndicator color={tokens.color.accent} />
      ) : null}

      {view.status === 'error' ? <ErrorNote message={view.message} /> : null}

      {view.status === 'loaded' && items.length === 0 ? (
        <EmptyState
          heading="Nothing on it yet"
          body="Whatever you add goes to the bottom of the list."
        />
      ) : null}

      <ReorderableList
        items={items}
        disabled={dragDisabled}
        dimmed={editingId !== null || confirmingRemoveId !== null || quantityEditingId !== null}
        handleIcon={<DragHandleIcon />}
        handleLabel={(item) => `Drag to reorder ${item.name}`}
        onDrop={(itemId, beforeId, afterId) => dropItem(itemId, beforeId, afterId, loadedItems)}
        renderRow={(item, handle) => {
          // The section this item already has at the attached store, if any: only
          // decides tag vs. propose-a-correction for the pin. Never shown as a pill.
          const section =
            list.locationId && locationItems.status === 'loaded'
              ? sectionForItemName(locationItems.items, item.name)
              : null;

          return (
          <CompactItemRow
            name={item.name}
            leading={handle}
            checked={item.checkedAt !== null}
            onToggle={() => {
              void mutate(() => setChecked(client, item.id, item.checkedAt === null));
            }}
            disabled={busy}
            stepper={
              <QuantityControl
                name={item.name}
                quantity={quantityOf(item)}
                onIncrement={() => void step(item, 1)}
                onOpenEditor={() => beginQuantityEditing(item.id)}
              />
            }
            onRename={() => beginEditing(item)}
            renameLabel={`Rename ${item.name}`}
            // Only once the store's tags have loaded: until then an already-tagged item
            // would look untagged and a correction would be written as a (rejected) tag.
            onLocation={
              list.locationId && locationItems.status === 'loaded'
                ? () => beginLocating(item)
                : undefined
            }
            locationLabel={
              section !== null
                ? `Propose a new item location for ${item.name}`
                : `Add an item location for ${item.name}`
            }
            locationDisabled={busy}
            editor={
              item.id === editingId ? (
                <InlineRowEditor
                  value={editingName}
                  onChangeText={setEditingName}
                  placeholder={
                    editingMode === 'location'
                      ? section !== null
                        ? `Currently: ${section}`
                        : 'Aisle 4'
                      : undefined
                  }
                  accessibilityLabel={
                    editingMode === 'location'
                      ? section !== null
                        ? `New item location for ${item.name}`
                        : `Item location for ${item.name}`
                      : `Name for ${item.name}`
                  }
                  onSubmit={() =>
                    editingMode === 'location' ? commitLocation(item, section) : commitRename()
                  }
                  onCancel={cancelEditing}
                  busy={busy}
                  submitDisabled={editingName.trim().length === 0}
                  maxLength={editingMode === 'location' ? 60 : 120}
                />
              ) : item.id === quantityEditingId ? (
                <QuantityEditor
                  name={item.name}
                  quantity={quantityOf(item)}
                  max={MAX_QUANTITY}
                  onIncrement={() => void step(item, 1)}
                  onDecrement={() => void step(item, -1)}
                  onDone={() => setQuantityEditingId(null)}
                />
              ) : undefined
            }
            onRemove={() => beginRemoving(item.id)}
            removeLabel={`Remove ${item.name}`}
            removeDisabled={busy}
            confirm={
              item.id === confirmingRemoveId ? (
                <RowConfirm
                  message={`Remove ${item.name}?`}
                  confirmLabel="Remove"
                  onConfirm={() =>
                    void mutate(
                      () => removeItem(client, item.id),
                      () => finishRemoving(item.id),
                    )
                  }
                  onCancel={cancelRemoving}
                  busy={busy}
                />
              ) : undefined
            }
          />
          );
        }}
      />

      {renamingList ? (
        <View style={styles.editor}>
          <Field
            label="List name"
            value={listNameDraft}
            onChangeText={setListNameDraft}
            autoCapitalize="sentences"
            autoFocus
            maxLength={60}
            editable={!busy}
            onSubmitEditing={commitRenameList}
            returnKeyType="done"
          />
          <SecondaryButton
            label="Save"
            onPress={commitRenameList}
            disabled={busy || listNameDraft.trim().length === 0}
          />
          <SecondaryButton
            label="Cancel"
            onPress={() => setRenamingList(false)}
            disabled={busy}
          />
        </View>
      ) : (
        <SecondaryButton
          label="Rename list"
          onPress={startRenameList}
          disabled={busy}
        />
      )}

      {copyComposing ? (
        <View style={styles.editor}>
          <Field
            label="New list name"
            value={copyName}
            onChangeText={setCopyName}
            autoCapitalize="sentences"
            autoFocus
            maxLength={60}
            editable={!busy}
            onSubmitEditing={() => void submitCopy(items)}
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
          <SecondaryButton
            label="Create"
            onPress={() => void submitCopy(items)}
            disabled={busy || copyName.trim().length === 0}
          />
          <SecondaryButton label="Cancel" onPress={cancelCopy} disabled={busy} />
        </View>
      ) : (
        <SecondaryButton
          label="Start new list from this"
          onPress={beginCopy}
          disabled={busy || items.length === 0}
        />
      )}

      {confirmingRemove ? (
        <Confirm
          message="Removing this list takes it off your Lists screen for good, along with everything on it. This can’t be undone."
          confirmLabel="Remove list"
          onConfirm={removeListNow}
          onCancel={() => setConfirmingRemove(false)}
          busy={busy}
        />
      ) : (
        <SecondaryButton
          label="Remove list"
          onPress={() => {
            setError(null);
            setConfirmingRemove(true);
          }}
          disabled={busy}
        />
      )}

      {canShare && confirmingShare ? (
        <Confirm
          message="Sharing puts this list, and everything on it, in front of everyone in your household. There is no way to make it private again."
          confirmLabel="Share with household"
          onConfirm={share}
          onCancel={() => setConfirmingShare(false)}
          busy={busy}
        />
      ) : null}

      {canShare && !confirmingShare ? (
        <SecondaryButton
          label="Share with household"
          onPress={() => {
            setError(null);
            setConfirmingShare(true);
          }}
          disabled={busy}
        />
      ) : null}
    </Screen>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    scope: {
      alignSelf: 'flex-start',
    },
    editor: {
      gap: tokens.space.sm,
    },
    addComposer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
    },
    addField: {
      flex: 1,
    },
  });
}
