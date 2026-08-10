import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Body,
  CheckTarget,
  EmptyState,
  ErrorNote,
  NAVIGATOR_EDGES,
  Screen,
} from '../components/ui';
import { useListItems } from '../hooks/useListItems';
import type { ListsView } from '../hooks/useLists';
import { setChecked, type ListItemRow } from '../lib/lists';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';

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
 * `checked_at` back and forth). Different rows are free to be in flight together.
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
 * No reordering, grouping, or "Finish shopping" button — out of scope per this
 * slice's plan: items render in whatever order `useListItems` returns, unchanged,
 * and there is no session row to finalize.
 */
export function ShoppingScreen({ client, lists, navigation, route }: Props) {
  const tokens = useTheme();
  const { listId } = route.params;
  const { view, refresh } = useListItems(client, listId);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const list =
    lists.status === 'loaded'
      ? lists.lists.find((candidate) => candidate.id === listId) ?? null
      : null;

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
  const checkedCount = items.filter((item) => item.checkedAt !== null).length;

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      <Body>{`${checkedCount} of ${items.length} checked`}</Body>

      {error ? <ErrorNote message={error} /> : null}

      {items.map((item) => (
        <CheckTarget
          key={item.id}
          size="large"
          label={item.name}
          checked={item.checkedAt !== null}
          onToggle={() => void toggle(item)}
          disabled={pending.has(item.id)}
          accessibilityLabel={item.name}
        />
      ))}
    </Screen>
  );
}
