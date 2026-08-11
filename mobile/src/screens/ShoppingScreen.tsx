import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Badge,
  Body,
  CheckTarget,
  Confirm,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from '../components/ui';
import { useListItems } from '../hooks/useListItems';
import type { ListsView } from '../hooks/useLists';
import { useLocationCheckoffs } from '../hooks/useLocationCheckoffs';
import { useLocationItems } from '../hooks/useLocationItems';
import {
  computeRouteOrder,
  orderedCheckedItemNames,
  recordLocationCheckoff,
} from '../lib/locationCheckoffs';
import { sectionForItemName, tagItemLocation } from '../lib/locationItems';
import { setChecked, type ListItemRow } from '../lib/lists';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Shopping'> & {
  client: SupabaseClient;
  lists: ListsView;
};

/**
 * The oversized, one-item-per-row check-off screen a shopper walks through.
 *
 * Per-item pending state (a `Set<string>` of in-flight item ids), not one shared
 * `busy` boolean like `ListDetailScreen`'s `mutate()`: Shopping Mode's whole point
 * is checking several items off in quick succession while walking, so serializing
 * every row behind a single flag would make the second tap wait on the first row's
 * round trip for no reason. The `Set` only guards a row against racing itself — a
 * second tap on the *same* item before its first write lands — which is the one
 * case double-firing would actually corrupt (two in-flight writes toggling the same
 * `checked_at` back and forth, or double-submitting the same tag). Different rows
 * are free to be in flight together. Slice 6 reuses this same `pending` Set for a
 * tag-submit write too, rather than adding a second Set: both a check-off write and
 * a tag-submit write are "this item's row has a write in flight," the same fact
 * the Set already tracks.
 *
 * "Closed and resumed without losing check-off state" needs no new mechanism here.
 * `toggle()` awaits `setChecked()` before calling `refresh()`, so the UI only ever
 * shows a checked state the database has already accepted — never optimistic. This
 * screen holds no check-off state of its own beyond that one pending `Set`, which
 * matters only while a row's own write is in flight and is worthless the moment
 * that write lands or the screen unmounts. Re-entering Shopping for the same
 * `listId` — button, deep-link URL, or cold restart landing here — mounts a fresh
 * `useListItems`, which runs a plain `SELECT ... where list_id = listId` and reads
 * back whatever `checked_at` is currently stored. There is no `shop_sessions` row
 * to resume and nothing here to reconstruct.
 *
 * No grouping of checked items — out of scope per Slice 5's plan, still: checked
 * items stay in place rather than sinking to the bottom, and there is no session
 * row to finalize beyond the one Slice 7 adds below.
 *
 * Slice 6 adds crowdsourced section tagging alongside check-off, one control per
 * item beneath its `CheckTarget` row rather than folded into it — `CheckTarget`'s
 * own doc comment already names the "two nested Pressables reacting to one tap"
 * anti-pattern this avoids by keeping the two controls as siblings. A tagged item
 * shows its section as a `Badge`; an untagged one shows a `+` that opens a small
 * inline composer for this row only (`composingItemId`) rather than a modal or a
 * second screen, matching the low-friction, walking-through-the-store spirit the
 * rest of this screen already has.
 *
 * Slice 7 adds both reordering and a "Finish shopping" button. Items render via
 * `computeRouteOrder` (`../lib/locationCheckoffs`) rather than in whatever order
 * `useListItems` returns — a read-time sort only, `position` is never written
 * (03-SPEC.md § Slice 7's Agreed block). "Finish shopping" is confirm-gated like
 * this screen's siblings' occasional destructive/one-way actions and records one
 * `location_checkoffs` row via `recordLocationCheckoff`, snapshotting whatever's
 * checked, in check-off order, the moment it's pressed — it does not uncheck
 * anything or touch list reuse across weeks, matching this project's habit of not
 * building ahead of the slice (9) that actually needs that.
 */
export function ShoppingScreen({ client, lists, navigation, route }: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { listId } = route.params;
  const { view, refresh } = useListItems(client, listId);

  // Computed here, not a hook itself, so the hook call below it (which depends on
  // `list.locationId`) can stay in the same, unconditional position on every
  // render — never behind one of this screen's own early returns further down.
  const list =
    lists.status === 'loaded'
      ? lists.lists.find((candidate) => candidate.id === listId) ?? null
      : null;

  const { view: locationItems, refresh: refreshLocationItems } = useLocationItems(
    client,
    list?.locationId ?? null,
  );

  const { view: checkoffs, refresh: refreshCheckoffs } = useLocationCheckoffs(
    client,
    list?.locationId ?? null,
  );

  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [composingItemId, setComposingItemId] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState('');
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [finishingShopping, setFinishingShopping] = useState(false);
  const [justFinished, setJustFinished] = useState(false);

  useLayoutEffect(() => {
    // Same reasoning as ListDetailScreen's header: it carries the list's name, and
    // it's what carries back too.
    if (list) {
      navigation.setOptions({ title: list.name });
    }
  }, [list, navigation]);

  async function toggle(item: ListItemRow) {
    if (pending.has(item.id)) {
      return;
    }
    setJustFinished(false);

    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await setChecked(client, item.id, item.checkedAt === null);

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      await refresh();
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  function beginTagging(itemId: string) {
    setError(null);
    setComposingItemId(itemId);
    setSectionDraft('');
  }

  function cancelTagging() {
    setComposingItemId(null);
    setSectionDraft('');
  }

  async function submitTag(item: ListItemRow) {
    if (!list || list.locationId === null) {
      return;
    }
    if (sectionDraft.trim().length === 0 || pending.has(item.id)) {
      return;
    }

    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await tagItemLocation(
        client,
        list.locationId,
        item.name,
        sectionDraft,
      );

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      await refreshLocationItems();
      cancelTagging();
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function finishShopping(items: ListItemRow[]) {
    if (!list || list.locationId === null) {
      return;
    }
    if (items.filter((item) => item.checkedAt !== null).length === 0) {
      return;
    }
    if (finishingShopping || pending.size > 0) {
      return;
    }
    setFinishingShopping(true);
    setError(null);
    try {
      const outcome = await recordLocationCheckoff(
        client,
        list.locationId,
        orderedCheckedItemNames(items),
      );
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      await refreshCheckoffs();
      setConfirmingFinish(false);
      setJustFinished(true);
    } finally {
      setFinishingShopping(false);
    }
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
          body="It may have been removed, or it may belong to someone else."
          actionLabel="Back to your lists"
          onAction={() => navigation.navigate('Lists')}
        />
      </Screen>
    );
  }

  if (list.locationId === null) {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <EmptyState
          heading="No location attached"
          body="Attach a location to this list before you start shopping."
          actionLabel="Back to list"
          onAction={() => navigation.navigate('ListDetail', { listId })}
        />
      </Screen>
    );
  }

  // Past this point `list.locationId` is known non-null, so `useLocationItems`
  // and `useLocationCheckoffs` above were both called with a real id rather
  // than null — these gates are safe to merge with (loading) and mirror
  // (error) the existing view.status ones.
  if (
    view.status === 'loading' ||
    locationItems.status === 'loading' ||
    checkoffs.status === 'loading'
  ) {
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

  if (locationItems.status === 'error') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ErrorNote message={locationItems.message} />
      </Screen>
    );
  }

  if (checkoffs.status === 'error') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ErrorNote message={checkoffs.message} />
      </Screen>
    );
  }

  if (view.items.length === 0) {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <EmptyState
          heading="Nothing to shop for"
          body="This list has no items yet."
          actionLabel="Back to list"
          onAction={() => navigation.navigate('ListDetail', { listId })}
        />
      </Screen>
    );
  }

  const items = view.items;
  const orderedItems = computeRouteOrder(items, locationItems.items, checkoffs.checkoffs);
  const checkedCount = items.filter((item) => item.checkedAt !== null).length;

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      <Body>{`${checkedCount} of ${items.length} checked`}</Body>

      {error ? <ErrorNote message={error} /> : null}

      {orderedItems.map((item) => {
        const section = sectionForItemName(locationItems.items, item.name);
        const composing = composingItemId === item.id;

        return (
          <View key={item.id} style={styles.itemGroup}>
            <CheckTarget
              size="large"
              label={item.name}
              checked={item.checkedAt !== null}
              onToggle={() => void toggle(item)}
              disabled={pending.has(item.id)}
              accessibilityLabel={item.name}
            />

            <View style={styles.tagRow}>
              {section !== null ? (
                <Badge label={section} />
              ) : composing ? (
                <View style={styles.tagComposer}>
                  <Field
                    label="Section"
                    value={sectionDraft}
                    onChangeText={setSectionDraft}
                    placeholder="Aisle 4"
                    autoCapitalize="sentences"
                    autoFocus
                    maxLength={60}
                    editable={!pending.has(item.id)}
                    onSubmitEditing={() => void submitTag(item)}
                    returnKeyType="done"
                  />
                  <PrimaryButton
                    label="Save"
                    onPress={() => void submitTag(item)}
                    busy={pending.has(item.id)}
                    disabled={sectionDraft.trim().length === 0}
                  />
                  <SecondaryButton
                    label="Cancel"
                    onPress={cancelTagging}
                    disabled={pending.has(item.id)}
                  />
                </View>
              ) : (
                <IconButton
                  glyph="+"
                  accessibilityLabel={`Tag a section for ${item.name}`}
                  onPress={() => beginTagging(item.id)}
                />
              )}
            </View>
          </View>
        );
      })}

      {justFinished ? (
        <Body>Shop recorded — this location's ordering will reflect it next time.</Body>
      ) : null}

      {confirmingFinish ? (
        <Confirm
          message="This records everything currently checked, in the order you checked it, as one completed shop at this location. It won't uncheck anything or change today's list."
          confirmLabel="Finish shopping"
          onConfirm={() => void finishShopping(items)}
          onCancel={() => setConfirmingFinish(false)}
          busy={finishingShopping}
        />
      ) : (
        <SecondaryButton
          label="Finish shopping"
          onPress={() => {
            setError(null);
            setConfirmingFinish(true);
          }}
          disabled={checkedCount === 0 || pending.size > 0}
        />
      )}
    </Screen>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    itemGroup: {
      gap: tokens.space.xs,
    },
    tagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: tokens.minTouchTargetLarge,
    },
    tagComposer: {
      gap: tokens.space.sm,
    },
  });
}
