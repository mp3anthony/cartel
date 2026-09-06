import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Badge,
  Banner,
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
import { useLocationItemVotes } from '../hooks/useLocationItemVotes';
import { computeRouteOrder } from '../lib/locationCheckoffs';
import { sectionForItemName, tagItemLocation } from '../lib/locationItems';
import { pendingCorrectionsForItemName, voteLocationItemCorrection } from '../lib/locationItemVotes';
import { finishShopping, setChecked, type ListItemRow } from '../lib/lists';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Shopping'> & {
  client: SupabaseClient;
  lists: ListsView;
  onListsChanged: () => Promise<void>;
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
 * Until Batch F (#39), `toggle()` awaited `setChecked()` before calling `refresh()`,
 * so the UI only ever showed a checked state the database had already accepted —
 * never optimistic. That's no longer true: `toggle()` now sets an `optimisticChecked`
 * overlay entry immediately and no longer awaits its own `refresh()` at all (see the
 * Batch F paragraph below for why). "Closed and resumed" is still trivially true for
 * the same underlying reason as before, though: neither `optimisticChecked` nor
 * `pending` survive unmount, so re-entering Shopping for the same `listId` — button,
 * deep-link URL, or cold restart landing here — mounts a fresh `useListItems`, which
 * runs a plain `SELECT ... where list_id = listId` and reads back whatever
 * `checked_at` is currently stored, with no overlay left over to contradict it. There
 * is no `shop_sessions` row to resume and nothing here to reconstruct.
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
 * `location_checkoffs` row, snapshotting whatever's checked, in check-off
 * order, the moment it's pressed (originally via a direct client write,
 * `recordLocationCheckoff` — folded into `finish_shopping()` by issue #58,
 * see below) — it does not uncheck
 * anything or touch list reuse across weeks, matching this project's habit of not
 * building ahead of the slice (9) that actually needs that.
 *
 * Slice 8 adds correction voting on top of an already-tagged item. A tagged
 * item's `Badge` gains a sibling pencil `IconButton` that opens a second inline
 * composer (`correctingItemId`, the same one-row-at-a-time shape
 * `composingItemId` already established) for proposing a new section. Any
 * pending corrections for that item — one row per distinct proposed value,
 * computed client-side from `useLocationItemVotes` via
 * `pendingCorrectionsForItemName` — render beneath the tag row as a plain
 * `Body` line plus a single-tap `PrimaryButton` labelled "Confirm", not gated
 * behind the `Confirm` in-place-card primitive: there is no reject/veto verb in
 * this system (a user who disagrees with a proposed correction simply never
 * taps it), so borrowing a component whose contract requires an `onCancel`
 * would invent meaning nothing here actually has. Every viewer sees the same
 * "Confirm" affordance regardless of whether they proposed the correction
 * themselves — the app never learns or shows who voted (migration
 * 20260811000002), so it makes no client-side attempt to hide the button from a
 * proposer; a proposer's own re-tap is rejected server-side (`already_voted`)
 * and surfaces through the same `error`/`ErrorNote` path every other rejected
 * write in this screen already uses. Both the propose-submit and the
 * confirm-tap reuse the same shared `pending` Set this screen's other two
 * writes already use, for the same reason Slice 6 gave: each is "this item's
 * row has a write in flight."
 *
 * Slice 9 makes "Finish shopping" write two independent rows instead of one.
 * The pre-existing `location_checkoffs` write (anonymous, feeds route
 * learning) is unchanged; alongside it, the finish-shopping write also wrote
 * a household-attributed `shop_sessions` row (originally via a direct client
 * write, `recordShopSession()` — folded into `finish_shopping()` by issue
 * #58, see below) — the full item snapshot plus which of them were checked —
 * that feeds the new History screen and its copy-into-a-new-list flow. At
 * the time, both were plain direct-to-table writes with no atomicity
 * requirement in the resolved design, so this was two sequential awaited
 * calls, not an RPC: a failure landing after the first write succeeds but
 * before the second was a real, accepted possibility (a checkoff recorded
 * with no matching session row), the same class of risk this project already
 * tolerates elsewhere — see Slice 4's accepted location-merge race window —
 * rather than a case worth an atomic function for.
 *
 * Issue #58 replaced Batch C's (#33 + #35) `archiveList()`/`unarchiveList()`
 * client-side claim-and-compensate sequence with a single `security definer`
 * RPC, `finishShopping()` (`../lib/lists`, calling `finish_shopping()`,
 * migration 20260906000000). Batch C's mechanism relied on `archived_at`'s
 * null-to-non-null transition being the one thing every successful finish
 * did — but a *partial* finish (issue #58's whole point: some items left
 * unchecked) must never archive the list at all, so there is no longer a
 * single column whose transition can serve as that claim. The RPC moves the
 * whole "check what's true, then act on it" sequence server-side instead: it
 * locks the list row and every one of its item rows, re-reads live state
 * under those locks, records the checkoff/session snapshots, and then either
 * archives the list (everything was checked) or soft-deletes just the
 * checked items (the list stays active with only the unchecked ones left) —
 * all inside one transaction. This is why `finishThisShop()` below is a
 * single awaited call with no claim/compensate dance: a partial failure
 * anywhere inside the function rolls the whole thing back, so there is
 * nothing left for the client to undo. `onListsChanged` is still called
 * after a real (non-error) result, same reason as before: `ListsScreen`/
 * `DashboardScreen` filter `archivedAt === null` into their active views, and
 * a full finish needs to make this list disappear from those views promptly
 * rather than waiting on their own next unrelated reload. A partial finish
 * leaves `archivedAt` null, so those views keep showing the list — correctly,
 * since it is still active with items left to buy.
 *
 * Item check/uncheck (`toggle()`) is gated on `list.archivedAt` the same way
 * the "Finish shopping" button already is — an archived list's item state is
 * read-only from that point on, consistent with the "already recorded"
 * messaging a returning visit to the same screen shows.
 *
 * Batch E (#32) makes the untagged affordance self-explanatory: the bare `+`
 * `IconButton` is replaced with a small labeled `Pressable` ("+ Tag aisle")
 * in the accent color, so it reads as an action rather than stray
 * punctuation. Presentational only — `beginTagging`, `composingItemId`, and
 * the inline composer it opens are unchanged.
 *
 * Batch F (#39) addresses check-off latency two ways. First, `toggle()`
 * writes an optimistic entry into `optimisticChecked` (a `Map<string, boolean>`
 * of item id to the checked state the user just asked for) at the moment it's
 * pressed, rather than waiting for the round trip — both the checked-count
 * header and each row's `checked` prop read through a small `isChecked()`
 * helper that consults this overlay before falling back to `item.checkedAt`.
 * A failed write deletes its own overlay entry and surfaces the error exactly
 * as before; a successful write leaves the overlay entry in place rather than
 * clearing it immediately, because clearing it here would just show the old
 * `item.checkedAt` again until a fresh `view` arrives. Second, `toggle()` no
 * longer awaits its own `refresh()` after a successful write at all — that
 * was the redundant second reload #39 named, on top of the round trip
 * `setChecked()` itself already needed. `useListItems.ts`'s existing Realtime
 * subscription already calls `refresh()` on every write to this list's items,
 * including the writer's own echo, so the reload still happens — just once,
 * not twice. A separate `useEffect` reconciles the overlay against that
 * arrival: whenever `view` changes (i.e. a refresh completes, from any
 * source) it drops every overlay entry whose item is no longer in `pending`,
 * unconditionally — not by comparing the overlay's guess against what came
 * back, so a write that raced with someone else's concurrent edit still
 * settles on whatever the server actually has, not on this device's own
 * optimistic guess. This is a deliberate, scoped override of the "never
 * optimistic" decision recorded above, not a workaround: it only widens what
 * this one screen renders while a write is in flight, using the exact same
 * `pending` Set as the guard against a second tap racing the first.
 *
 * The staleness problem Batch F's own `finishShopping()` had to work around
 * (`toggle()` dropping its own `refresh()` meant the render-time `items`
 * array could be stale by the time "Finish shopping" was pressed) is now
 * moot: `finish_shopping()`'s own row locks mean it reads its own fresh copy
 * of every item under lock, inside the same transaction that records the
 * checkoff/session snapshots — the client's `items` is never passed to the
 * RPC at all, so there is nothing for this screen to freshen before calling
 * it.
 */
export function ShoppingScreen({ client, lists, navigation, onListsChanged, route }: Props) {
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

  const { view: itemVotes, refresh: refreshLocationItemVotes } = useLocationItemVotes(
    client,
    list?.locationId ?? null,
  );

  const [pending, setPending] = useState<Set<string>>(new Set());
  const [optimisticChecked, setOptimisticChecked] = useState<Map<string, boolean>>(new Map());

  // `pending` read inside the reconciliation effect below without being one of its
  // dependencies — see that effect's own comment for why triggering on `pending`
  // changes rather than just reading it was a real bug (fixed post-review): a
  // ref keeps the effect's one trigger (`view`) separate from the up-to-date value
  // it needs to check against.
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    // Reconciles the optimistic overlay against every completed refresh, from any
    // source (this device's own writer echo, another device's write, or a manual
    // refresh) — not just the one this device itself triggered. An overlay entry is
    // dropped once its item is no longer pending, unconditionally: this settles on
    // whatever the server actually has rather than comparing against the overlay's
    // own guess, so a write that raced with someone else's concurrent edit still
    // lands on the real value instead of silently keeping this device's stale
    // optimism. An entry whose item is still pending survives the reconciliation —
    // its own write hasn't resolved yet, so there's nothing fresher to reconcile
    // against.
    //
    // Deliberately keyed on `[view]` alone, not `[view, pending]` — `toggle()`'s own
    // `finally` clears an item's `pending` entry as soon as `setChecked()`'s round
    // trip resolves, which is well before the separate, slower Realtime-echo refresh
    // that actually updates `view` lands. Depending on `pending` here (an earlier
    // draft did, caught in review) re-ran this effect at that clear, read `view`
    // while it was still the pre-write snapshot, and deleted the just-set overlay
    // entry before the real confirmation existed — visible as a checked→unchecked→
    // checked flicker, or a checkbox stuck unchecked if the echo never arrives at
    // all. Reading `pending` through the ref above instead of the dependency array
    // means this only ever reconciles at the moment `view` itself actually changes.
    if (view.status !== 'loaded' || optimisticChecked.size === 0) {
      return;
    }
    setOptimisticChecked((current) => {
      if (current.size === 0) {
        return current;
      }
      let changed = false;
      const next = new Map(current);
      for (const id of current.keys()) {
        if (!pendingRef.current.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [view]);

  const [error, setError] = useState<string | null>(null);
  const [composingItemId, setComposingItemId] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState('');
  const [correctingItemId, setCorrectingItemId] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [finishingShopping, setFinishingShopping] = useState(false);
  const [justFinished, setJustFinished] = useState(false);

  // Effective checked state for a row: the optimistic overlay above wins while a
  // value is present, otherwise falls back to whatever the database last reported.
  // Used everywhere a row's checked state matters — the row's own `checked` prop,
  // the header's `checkedCount`, and nowhere else (`computeRouteOrder` stays reading
  // `checkoffs`/`locationItems`, unrelated to this per-item toggle state).
  function isChecked(item: ListItemRow): boolean {
    return optimisticChecked.has(item.id) ? optimisticChecked.get(item.id)! : item.checkedAt !== null;
  }

  useLayoutEffect(() => {
    // Same reasoning as ListDetailScreen's header: it carries the list's name, and
    // it's what carries back too.
    if (list) {
      navigation.setOptions({ title: list.name });
    }
  }, [list, navigation]);

  async function toggle(item: ListItemRow) {
    if (!list || list.archivedAt !== null) {
      return;
    }
    if (pending.has(item.id)) {
      return;
    }
    setJustFinished(false);

    const nextChecked = !isChecked(item);

    setPending((current) => new Set(current).add(item.id));
    setOptimisticChecked((current) => {
      const next = new Map(current);
      next.set(item.id, nextChecked);
      return next;
    });
    setError(null);

    try {
      const outcome = await setChecked(client, item.id, nextChecked);

      if (!outcome.ok) {
        setOptimisticChecked((current) => {
          const next = new Map(current);
          next.delete(item.id);
          return next;
        });
        setError(outcome.message);
        return;
      }

      // No explicit refresh() here — this was the second, redundant reload #39
      // named. useListItems.ts's Realtime subscription already calls refresh() on
      // this row's own echo; the optimistic entry above stands in until that
      // lands (see the reconciliation effect above).
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

  function beginCorrecting(itemId: string) {
    setError(null);
    setCorrectingItemId(itemId);
    setCorrectionDraft('');
  }

  function cancelCorrecting() {
    setCorrectingItemId(null);
    setCorrectionDraft('');
  }

  async function submitCorrection(item: ListItemRow) {
    if (!list || list.locationId === null) {
      return;
    }
    if (correctionDraft.trim().length === 0 || pending.has(item.id)) {
      return;
    }

    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await voteLocationItemCorrection(
        client,
        list.locationId,
        item.name,
        correctionDraft,
      );

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      await refreshLocationItems();
      await refreshLocationItemVotes();
      cancelCorrecting();
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function confirmCorrection(item: ListItemRow, proposedSection: string) {
    if (!list || list.locationId === null) {
      return;
    }
    if (pending.has(item.id)) {
      return;
    }

    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await voteLocationItemCorrection(
        client,
        list.locationId,
        item.name,
        proposedSection,
      );

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      await refreshLocationItems();
      await refreshLocationItemVotes();
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function finishThisShop() {
    if (!list || list.locationId === null) {
      return;
    }
    if (list.archivedAt !== null) {
      // Can happen if the list was archived remotely (another device) while
      // this device's confirm dialog was already open — the "Finish shopping"
      // button itself is disabled once archivedAt is set, so this only ever
      // catches a dialog that opened before that. Close it rather than leaving
      // it stuck open with no feedback; the "already recorded" messaging
      // (reads list.archivedAt directly) explains the rest.
      setConfirmingFinish(false);
      return;
    }
    if (checkedCount === 0) {
      return;
    }
    if (finishingShopping || pending.size > 0) {
      return;
    }
    setFinishingShopping(true);
    setError(null);
    try {
      const outcome = await finishShopping(client, list.id);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      // Whether this call actually claimed the finish (archived === true means
      // full finish; false means partial — either way this call's own write
      // succeeded) or lost a race to another device (surfaces as the
      // already_finished/nothing_checked exceptions humanise() maps to
      // friendly text, landing in the branch above instead), refresh so this
      // screen reflects whatever is now true server-side — a partial finish
      // leaves this list showing only the items still left unchecked.
      await refresh();
      await refreshCheckoffs();
      await onListsChanged();
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
    checkoffs.status === 'loading' ||
    itemVotes.status === 'loading'
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

  if (itemVotes.status === 'error') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ErrorNote message={itemVotes.message} />
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
  const checkedCount = items.filter((item) => isChecked(item)).length;

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      <Body>{`${checkedCount} of ${items.length} checked`}</Body>

      {error ? <ErrorNote message={error} /> : null}

      {orderedItems.map((item) => {
        const section = sectionForItemName(locationItems.items, item.name);
        const composing = composingItemId === item.id;
        const correcting = correctingItemId === item.id;
        const corrections =
          section !== null
            ? pendingCorrectionsForItemName(itemVotes.votes, item.name, section)
            : [];

        return (
          <View key={item.id} style={styles.itemGroup}>
            <CheckTarget
              size="large"
              label={item.name}
              checked={isChecked(item)}
              onToggle={() => void toggle(item)}
              disabled={pending.has(item.id) || list.archivedAt !== null}
              accessibilityLabel={item.name}
            />

            <View style={styles.tagRow}>
              {section !== null ? (
                correcting ? (
                  <View style={styles.tagComposer}>
                    <Field
                      label="New section"
                      value={correctionDraft}
                      onChangeText={setCorrectionDraft}
                      placeholder={`Currently: ${section}`}
                      autoCapitalize="sentences"
                      autoFocus
                      maxLength={60}
                      editable={!pending.has(item.id)}
                      onSubmitEditing={() => void submitCorrection(item)}
                      returnKeyType="done"
                    />
                    <PrimaryButton
                      label="Propose"
                      onPress={() => void submitCorrection(item)}
                      busy={pending.has(item.id)}
                      disabled={correctionDraft.trim().length === 0}
                    />
                    <SecondaryButton
                      label="Cancel"
                      onPress={cancelCorrecting}
                      disabled={pending.has(item.id)}
                    />
                  </View>
                ) : (
                  <View style={styles.tagBadgeRow}>
                    <Badge label={section} />
                    <IconButton
                      glyph="✏"
                      accessibilityLabel={`Propose a new location for ${item.name}`}
                      onPress={() => beginCorrecting(item.id)}
                      disabled={pending.has(item.id)}
                    />
                  </View>
                )
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Tag a section for ${item.name}`}
                  onPress={() => beginTagging(item.id)}
                  style={({ pressed }) => [styles.tagPrompt, pressed && styles.tagPromptPressed]}
                >
                  <Text style={styles.tagPromptGlyph}>+</Text>
                  <Text style={styles.tagPromptLabel}>Tag aisle</Text>
                </Pressable>
              )}
            </View>

            {corrections.length > 0 ? (
              <View style={styles.pendingCorrections}>
                {corrections.map((correction) => (
                  <View key={correction.proposedSection} style={styles.pendingCorrectionRow}>
                    <Body>{`Proposed new location: "${correction.proposedSection}"`}</Body>
                    <PrimaryButton
                      label="Confirm"
                      onPress={() => void confirmCorrection(item, correction.proposedSection)}
                      busy={pending.has(item.id)}
                      disabled={pending.has(item.id)}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {justFinished ? (
        <Banner message="Shop recorded — this location's ordering will reflect it next time." />
      ) : list.archivedAt !== null ? (
        <Body>This shop has already been recorded.</Body>
      ) : null}

      {confirmingFinish ? (
        <Confirm
          message="This records everything currently checked, in the order you checked it, as one completed shop at this location. It won't uncheck anything or change today's list."
          confirmLabel="Finish shopping"
          onConfirm={() => void finishThisShop()}
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
          disabled={checkedCount === 0 || pending.size > 0 || list.archivedAt !== null}
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
    tagPrompt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.xs,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.sm,
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.color.border,
    },
    tagPromptPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    tagPromptGlyph: {
      color: tokens.color.accent,
      fontSize: tokens.fontSize.body,
      fontWeight: '700',
      lineHeight: tokens.fontSize.body,
    },
    tagPromptLabel: {
      color: tokens.color.accent,
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
    },
    tagBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
    },
    pendingCorrections: {
      paddingLeft: tokens.minTouchTargetLarge,
      gap: tokens.space.xs,
    },
    pendingCorrectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
    },
  });
}
