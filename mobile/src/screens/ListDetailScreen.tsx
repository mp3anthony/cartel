import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Badge,
  CheckTarget,
  Confirm,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Row,
  Screen,
  SecondaryButton,
} from '../components/ui';
import { useListItems } from '../hooks/useListItems';
import type { ListsView } from '../hooks/useLists';
import type { Outcome } from '../lib/household';
import {
  addItem,
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
};

/**
 * One list, and everything you can do to it.
 *
 * The list's own name and scope come from the loaded index rather than a query of
 * their own, which is also what makes the not-found case answerable: RLS returns no
 * row for a list the caller cannot see, so a stale deep link, a foreign id and a
 * removed list are the same absence, and none of them can be told apart by asking
 * again.
 */
export function ListDetailScreen({
  client,
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

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [renamingList, setRenamingList] = useState(false);
  const [listNameDraft, setListNameDraft] = useState('');
  const [confirmingShare, setConfirmingShare] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list =
    lists.status === 'loaded'
      ? lists.lists.find((candidate) => candidate.id === listId) ?? null
      : null;

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
   * cleared afterwards. Spelled out seven times, the plumbing is what you read and
   * the write is what you skim past. `after` runs only on success, which is why the
   * caller's cleanup belongs there rather than below the await.
   */
  async function mutate(
    write: () => Promise<Outcome<unknown>>,
    after?: () => void | Promise<void>,
  ) {
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
  }

  function add(items: ListItemRow[]) {
    // The Add button is disabled on an empty draft, but the keyboard's return key
    // reaches here regardless. `list_items.name` carries a length check, so without
    // this the round trip comes back as raw constraint prose that `humanise` has no
    // mapping for and shows the user the schema.
    if (draft.trim().length === 0) {
      return;
    }

    // New items append, so the lower bound is the last item the caller can see and
    // the upper bound is nothing at all.
    const last = items.length > 0 ? items[items.length - 1].position : null;

    void mutate(
      () => addItem(client, listId, draft, last),
      () => setDraft(''),
    );
  }

  function commitRename() {
    const id = editingId;

    if (!id || editingName.trim().length === 0) {
      return;
    }

    void mutate(
      () => renameItem(client, id, editingName),
      () => setEditingId(null),
    );
  }

  function moveUp(index: number, items: ListItemRow[]) {
    // Neighbours are read from the rendered order and exclude the item being moved,
    // exactly as moveItem() documents: up one place lands between items[index - 2]
    // and items[index - 1], and the missing neighbour at the top reads as null.
    void mutate(() =>
      moveItem(
        client,
        items[index].id,
        index >= 2 ? items[index - 2].position : null,
        items[index - 1].position,
      ),
    );
  }

  function moveDown(index: number, items: ListItemRow[]) {
    void mutate(() =>
      moveItem(
        client,
        items[index].id,
        items[index + 1].position,
        index + 2 < items.length ? items[index + 2].position : null,
      ),
    );
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

  const items = view.status === 'loaded' ? view.items : [];
  const canShare = list.householdId === null && inHousehold;

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      <Badge label={list.householdId ? 'Shared' : 'Personal'} />

      <Field
        label="Add an item"
        value={draft}
        onChangeText={setDraft}
        placeholder="Milk"
        autoCapitalize="sentences"
        maxLength={120}
        editable={!busy}
        onSubmitEditing={() => add(items)}
        returnKeyType="done"
      />
      <PrimaryButton
        label="Add"
        onPress={() => add(items)}
        busy={busy}
        disabled={draft.trim().length === 0}
      />

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

      {items.map((item, index) =>
        item.id === editingId ? (
          <View key={item.id} style={styles.editor}>
            <Field
              label="Item name"
              value={editingName}
              onChangeText={setEditingName}
              autoFocus
              maxLength={120}
              editable={!busy}
              onSubmitEditing={commitRename}
              returnKeyType="done"
            />
            <SecondaryButton
              label="Save"
              onPress={commitRename}
              disabled={busy || editingName.trim().length === 0}
            />
            <SecondaryButton
              label="Cancel"
              onPress={() => setEditingId(null)}
              disabled={busy}
            />
          </View>
        ) : (
          <Row
            key={item.id}
            label={item.name}
            onPress={() => {
              setError(null);
              setEditingName(item.name);
              setEditingId(item.id);
            }}
            leading={
              <CheckTarget
                checked={item.checkedAt !== null}
                onToggle={() =>
                  void mutate(() =>
                    setChecked(client, item.id, item.checkedAt === null),
                  )
                }
                accessibilityLabel={item.name}
                disabled={busy}
              />
            }
            trailing={
              <View style={styles.rowActions}>
                <IconButton
                  glyph="↑"
                  accessibilityLabel={`Move ${item.name} up`}
                  onPress={() => moveUp(index, items)}
                  disabled={busy || index === 0}
                />
                <IconButton
                  glyph="↓"
                  accessibilityLabel={`Move ${item.name} down`}
                  onPress={() => moveDown(index, items)}
                  disabled={busy || index === items.length - 1}
                />
                <IconButton
                  glyph="×"
                  accessibilityLabel={`Remove ${item.name}`}
                  onPress={() => void mutate(() => removeItem(client, item.id))}
                  disabled={busy}
                />
              </View>
            }
          />
        ),
      )}

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
    editor: {
      gap: tokens.space.sm,
    },
    // No gap: each of these controls already carries the 44pt box around its glyph,
    // and spacing them further pushes the item's name off the end of a phone row.
    rowActions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  });
}
