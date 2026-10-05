import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Banner,
  Body,
  Card,
  CompactItemRow,
  EmptyState,
  ErrorNote,
  Field,
  InlineRowEditor,
  NAVIGATOR_EDGES,
  PendingCorrectionLine,
  PrimaryButton,
  QuantityControl,
  QuantityEditor,
  RowConfirm,
  Screen,
  SecondaryButton,
} from '../components/ui';
import { useListItems } from '../hooks/useListItems';
import { useQuantityStepper } from '../hooks/useQuantityStepper';
import type { ListsView } from '../hooks/useLists';
import { useLocations } from '../hooks/useLocations';
import { useLocationCheckoffs } from '../hooks/useLocationCheckoffs';
import { useLocationItems } from '../hooks/useLocationItems';
import { useLocationItemVotes } from '../hooks/useLocationItemVotes';
import { computeRouteOrder } from '../lib/locationCheckoffs';
import { sectionForItemName, tagItemLocation } from '../lib/locationItems';
import { pendingCorrectionsForItemName, voteLocationItemCorrection } from '../lib/locationItemVotes';
import {
  addOrBumpItem,
  finishShopping,
  MAX_QUANTITY,
  removeItem,
  resetList,
  setChecked,
  type FinishEnding,
  type ListItemRow,
} from '../lib/lists';
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
 * Slice 6 adds crowdsourced section tagging alongside check-off, as a control
 * separate from the check-off target rather than folded into it — `CheckTarget`'s
 * own doc comment already names the "two nested Pressables reacting to one tap"
 * anti-pattern this avoids by keeping the two controls as siblings. A tagged item
 * shows its section; an untagged one opens a small inline editor for this row only
 * (`editingItemId`, see the #77 paragraph below) rather than a modal or a second
 * screen, matching the low-friction, walking-through-the-store spirit the rest of
 * this screen already has.
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
 * item gains a pencil that opens the same inline editor, there to propose a new
 * section rather than tag one. Any
 * pending corrections for that item — one row per distinct proposed value,
 * computed client-side from `useLocationItemVotes` via
 * `pendingCorrectionsForItemName` — render under the item as a proposal line
 * with a single-tap "Confirm" (see #78 below), not gated
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
 * client-side claim-and-compensate sequence with a single `security definer` RPC,
 * `finishShopping()` (`../lib/lists`, calling `finish_shopping()`). Issue #89 made lists
 * reusable and reshaped the RPC: nothing is archived or removed any more. A finish records
 * the items ticked *since the last finish* (`checkedAt !== null && recordedAt === null`),
 * then ends one of two ways. **Done shopping** unticks everything; **Continue at another
 * store** keeps the ticks (the server stamps them `recorded_at`) so the next store records
 * only new ticks, and opens the store picker. A third ending, **Reset list** (`resetList()`,
 * the `reset_list()` RPC), is offered only when everything ticked is already recorded: it
 * unticks the list and records no shop. The server locks the rows and re-checks live state,
 * so `finishThisShop()`/`resetThisList()` stay single awaited calls with nothing for the
 * client to compensate. `onListsChanged` is still called after a success so the Lists and
 * Home counts reflect it promptly.
 *
 * Issue #63 adds a persistent "Add an item" composer, always rendered (not
 * tap-to-reveal) at the **top** of the item list — above every row, below the
 * checked-count caption — rather than at the bottom. This was a deliberate
 * correction after an initial bottom placement: while shopping, the top of
 * the screen is where a user's attention already is (the next item to grab),
 * so a bottom-anchored composer would sit out of sight, disconnected from the
 * point of view this screen is built around. `addNewItem()` uses its own
 * `addBusy`/`addBusyRef` pair rather than the shared `pending` Set above —
 * `pending` is keyed by an *existing* item's id, and a not-yet-inserted item
 * has none, so folding this into `pending` isn't possible; a brand-new,
 * separate ref/state pair is the correct shape here, not a shortcut. The new
 * item needs no ordering logic of its own: `computeRouteOrder`'s tier-3
 * fallback (no check-off history, no section tag) already keeps a
 * newly-added item in its entry-order position via `Array.prototype.sort`'s
 * stability, confirmed by reading that function rather than assumed. Nothing here is
 * gated on a list's finish state any more: a finished list is simply reusable.
 *
 * Batch E (#32) briefly gave untagged items a labeled "+ Tag aisle" affordance;
 * #77 (below) replaced it with the pencil.
 *
 * Batch F (#39) addresses check-off latency two ways. First, `toggle()`
 * writes an optimistic entry into `optimisticChecked` (a `Map<string, boolean>`
 * of item id to the checked state the user just asked for) at the moment it's
 * pressed, rather than waiting for the round trip — both the checked-count
 * caption and each row's `checked` prop read through a small `isChecked()`
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
 *
 * Issue #77 (compact list rows, parent #76) supersedes the Slice 6/8 and Batch E
 * paragraphs above wherever they describe the tag UI: each item is now one
 * `CompactItemRow` line (check circle + name, a right-aligned neutral pill for the
 * section, a pencil) instead of a `CheckTarget` plus a separate tag row. An untagged
 * item shows the pencil alone — the "+ Tag aisle" prompt is gone. The pencil turns
 * that row into an `InlineRowEditor`, and `editingItemId` is a single slot, so only
 * one editor is ever open (previously the tag and correction composers had separate
 * ids and could both be open). Tagged vs. untagged only decides which existing write
 * the editor's ✓ calls — `submitTag` (first-write-wins) or `submitCorrection` (quorum
 * proposal); neither write changed.
 *
 * Issue #78: each pending correction is one `PendingCorrectionLine` in the row's
 * `footer` slot (muted "Proposed: X" + a text-style Confirm), only on rows that have
 * a proposal. `confirmCorrection` and the quorum RPC behind it are unchanged, so a
 * same-proposer confirm still comes back `already_voted` through `ErrorNote`.
 *
 * `beginEditing`/`cancelEditing` also write `editingItemIdRef`, and a finished write
 * only closes the editor if the ref still names its own row (`finishEditing`), so a
 * slow write for row A can't close, or wipe the draft of, an editor since opened on B.
 * `writingRef` does for these three writes what `addBusyRef` does for adds: `pending`
 * is batched state, so it alone can't stop a same-tick double submit. A new `error`
 * scrolls the list to the top, where `ErrorNote` renders, so it can't stay off-screen.
 *
 * Issue #79 (one-line add-item composer, parent #76): the #63 composer is now a single
 * row — a label-less `Field` (placeholder "Add an item", in a `flex: 1` wrapper because
 * `Field`'s `style` only reaches the TextInput) plus a compact "+" `PrimaryButton`.
 * `addNewItem`, `addBusyRef`/`addBusy`, `keepFocus` and `blurOnSubmit={false}` are
 * unchanged, so #63's behaviour is too. "N of M checked" is now a small muted caption
 * above it rather than a body-size header line.
 *
 * Issue #102 slice 2 retired the pencil: the location editor (tag, or propose a correction)
 * now opens from a pin on the row, and tapping the name still ticks. Slice 1: each row gets
 * a "×" after the pin, which swaps the row for an inline
 * `RowConfirm` ("Remove {item}?"). `confirmingRemoveId` is one slot, mutually exclusive
 * with `editingItemId`. `removeThisItem` uses the same `pending` Set and `writingRef` as
 * the tag writes, and like `toggle()` it does not call `refresh()` afterwards: the
 * Realtime echo on the soft delete reloads the list, so the row disappears from there
 * (and the "N of M checked" count drops with it). The confirmation is cleared on
 * success and, by an effect, if the item disappears from `view` first (another member
 * removed it).
 *
 * Issue #111: each row's `stepper` slot holds a `QuantityControl` (a "+" at 1, a "×N" chip
 * above it) and the chip opens `QuantityEditor` in the row's `editor` slot
 * (`quantityEditingId`, a third single slot beside `editingItemId` and
 * `confirmingRemoveId`). Quantity writes go through `useQuantityStepper`, not the `pending`
 * Set: stepping is tapped in bursts and no tap may be dropped, and it never toggles check
 * (one tick covers the whole quantity). Finish and Reset are held back while any quantity
 * write is in flight (`inFlightTotal`), so the recorded quantity matches the screen.
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

  // Only for the store's name in the finish card's wording.
  const { view: locationsView } = useLocations(client);
  const storeName =
    list?.locationId && locationsView.status === 'loaded'
      ? (locationsView.locations.find((location) => location.id === list.locationId)?.name ?? null)
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
  // Quantity writes (#111): optimistic and never dropped, so not the `pending` Set.
  const { quantityOf, step, inFlightTotal } = useQuantityStepper({
    client,
    view,
    refresh,
    setError,
  });
  // The one row showing the quantity editor; exclusive with `editingItemId` and
  // `confirmingRemoveId`.
  const [quantityEditingId, setQuantityEditingId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (error) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [error]);

  // One inline location editor at a time (#77). Whether it tags an untagged item or
  // proposes a correction to a tagged one is derived from the item's current section
  // at render time, not stored — so the two flows can't drift apart.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState('');
  // Mirrors `editingItemId` synchronously so a write that resolves later can tell
  // whether its own row's editor is still the open one (see `finishEditing`).
  const editingItemIdRef = useRef<string | null>(null);
  // Item ids with a tag/correction/confirm write in flight. Synchronous, unlike
  // `pending` (batched state) — see `addBusyRef` for the same idiom.
  const writingRef = useRef<Set<string>>(new Set());
  // The one row showing "Remove {item}?" (#102), and its synchronous mirror.
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const confirmingRemoveIdRef = useRef<string | null>(null);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [finishingShopping, setFinishingShopping] = useState(false);
  // Synchronous twin of `finishingShopping` (batched state alone cannot stop a same-tick
  // double submit); same idiom as `addBusyRef`.
  const finishingRef = useRef(false);
  // The confirmation shown after a finish or reset, or null. Cleared by the next tick.
  const [banner, setBanner] = useState<string | null>(null);
  // The note under the composer after an add that bumped an existing item (#111), or null.
  // Kept until the next add or tick; no timer. `id` makes each note a fresh Banner, so a
  // dismissed note does not hide the next one even when the words are the same.
  const [bumpNote, setBumpNote] = useState<{ id: number; text: string } | null>(null);
  const [addDraft, setAddDraft] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const addBusyRef = useRef(false);

  // Effective checked state for a row: the optimistic overlay above wins while a
  // value is present, otherwise falls back to whatever the database last reported.
  // Used everywhere a row's checked state matters — the row's own `checked` prop,
  // the caption's `checkedCount`, and nowhere else (`computeRouteOrder` stays reading
  // `checkoffs`/`locationItems`, unrelated to this per-item toggle state).
  function isChecked(item: ListItemRow): boolean {
    return optimisticChecked.has(item.id) ? optimisticChecked.get(item.id)! : item.checkedAt !== null;
  }

  // A reset from another device can leave nothing ticked while the confirm card is armed;
  // drop the armed state so the Finish button doesn't sit disabled and re-arm later.
  const anyChecked = view.status === 'loaded' && view.items.some((item) => isChecked(item));
  useEffect(() => {
    if (!anyChecked) {
      setConfirmingFinish(false);
    }
  }, [anyChecked]);

  // Another member removed the item this row was asking about: nothing left to confirm.
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

  useLayoutEffect(() => {
    // Same reasoning as ListDetailScreen's header: it carries the list's name, and
    // it's what carries back too.
    if (list) {
      navigation.setOptions({ title: list.name });
    }
  }, [list, navigation]);

  async function toggle(item: ListItemRow) {
    if (!list) {
      return;
    }
    if (pending.has(item.id)) {
      return;
    }
    setBanner(null);
    setBumpNote(null);

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

  function beginRemoving(itemId: string) {
    setError(null);
    // One slot at a time with the location editor: opening one closes the other.
    cancelEditing();
    setQuantityEditingId(null);
    confirmingRemoveIdRef.current = itemId;
    setConfirmingRemoveId(itemId);
  }

  function beginQuantityEditing(itemId: string) {
    setError(null);
    cancelEditing();
    cancelRemoving();
    setQuantityEditingId(itemId);
  }

  function cancelRemoving() {
    confirmingRemoveIdRef.current = null;
    setConfirmingRemoveId(null);
  }

  async function removeThisItem(item: ListItemRow) {
    if (pending.has(item.id) || writingRef.current.has(item.id)) {
      return;
    }

    writingRef.current.add(item.id);
    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await removeItem(client, item.id);

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      // No refresh() here, as in toggle(): the Realtime echo on this soft delete reloads
      // the list. Clear the confirmation only if it is still this row's.
      if (confirmingRemoveIdRef.current === item.id) {
        cancelRemoving();
      }
    } finally {
      writingRef.current.delete(item.id);
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  function beginEditing(itemId: string) {
    setError(null);
    cancelRemoving();
    setQuantityEditingId(null);
    editingItemIdRef.current = itemId;
    setEditingItemId(itemId);
    setLocationDraft('');
  }

  function cancelEditing() {
    editingItemIdRef.current = null;
    setEditingItemId(null);
    setLocationDraft('');
  }

  // Closes the editor only if it is still the one for `itemId`: the user may have
  // opened another row's editor while this row's write was in flight, and closing
  // (or wiping the draft of) that one would lose their typing.
  function finishEditing(itemId: string) {
    if (editingItemIdRef.current === itemId) {
      cancelEditing();
    }
  }

  async function submitTag(item: ListItemRow) {
    if (!list || list.locationId === null) {
      return;
    }
    if (
      locationDraft.trim().length === 0 ||
      pending.has(item.id) ||
      writingRef.current.has(item.id)
    ) {
      return;
    }

    writingRef.current.add(item.id);
    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await tagItemLocation(
        client,
        list.locationId,
        item.name,
        locationDraft,
      );

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      await refreshLocationItems();
      finishEditing(item.id);
    } finally {
      writingRef.current.delete(item.id);
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function submitCorrection(item: ListItemRow) {
    if (!list || list.locationId === null) {
      return;
    }
    if (
      locationDraft.trim().length === 0 ||
      pending.has(item.id) ||
      writingRef.current.has(item.id)
    ) {
      return;
    }

    writingRef.current.add(item.id);
    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await voteLocationItemCorrection(
        client,
        list.locationId,
        item.name,
        locationDraft,
      );

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      await refreshLocationItems();
      await refreshLocationItemVotes();
      finishEditing(item.id);
    } finally {
      writingRef.current.delete(item.id);
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
    if (pending.has(item.id) || writingRef.current.has(item.id)) {
      return;
    }

    writingRef.current.add(item.id);
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
      writingRef.current.delete(item.id);
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function finishThisShop(ending: FinishEnding) {
    if (!list || list.locationId === null) {
      return;
    }
    if (newCheckedCount === 0) {
      return;
    }
    // A quantity write still in flight would be recorded at the old number.
    if (finishingRef.current || finishingShopping || pending.size > 0 || inFlightTotal > 0) {
      return;
    }
    finishingRef.current = true;
    setFinishingShopping(true);
    setError(null);
    try {
      const outcome = await finishShopping(client, list.id, ending);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      // Refresh so this screen reflects whatever is now true server-side: after Done
      // the items are unticked, after Continue they stay ticked and recorded.
      await refresh();
      await refreshCheckoffs();
      await onListsChanged();
      setConfirmingFinish(false);

      if (ending === 'continue') {
        setBanner('Shop recorded. Ticked items stay ticked for the next store.');
        // `returnTo` makes the picker go back here (not push a second Shopping screen)
        // once a store is chosen, and offers "Keep the current store".
        navigation.navigate('Locations', { attachToListId: list.id, returnTo: 'Shopping' });
      } else {
        setBanner('Shop recorded. Your list is unticked and ready for next time.');
      }
    } finally {
      finishingRef.current = false;
      setFinishingShopping(false);
    }
  }

  // The Reset list ending: only reachable when everything ticked is already recorded.
  // Records no shop; the server refuses (`has_new_checks`) if someone has ticked
  // something new in the meantime.
  async function resetThisList() {
    if (!list) {
      return;
    }
    if (checkedCount === 0) {
      return;
    }
    if (finishingRef.current || finishingShopping || pending.size > 0 || inFlightTotal > 0) {
      return;
    }
    finishingRef.current = true;
    setFinishingShopping(true);
    setError(null);
    try {
      const outcome = await resetList(client, list.id);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      await refresh();
      await onListsChanged();
      setConfirmingFinish(false);
      setBanner('List reset. Everything is unticked and ready for next time.');
    } finally {
      finishingRef.current = false;
      setFinishingShopping(false);
    }
  }

  async function addNewItem() {
    if (!list) {
      return;
    }
    if (addDraft.trim().length === 0 || addBusy || addBusyRef.current) {
      return;
    }

    // Read straight off `view` rather than the later-computed `orderedItems`/
    // `items` locals (those are defined below this component's early returns,
    // out of scope here) — same source ListDetailScreen.add() already reads
    // from, just accessed defensively since this handler must stay above the
    // early returns that guarantee `view.status === 'loaded'`.
    const currentItems = view.status === 'loaded' ? view.items : [];
    const last = currentItems.length > 0 ? currentItems[currentItems.length - 1].position : null;

    addBusyRef.current = true;
    setAddBusy(true);
    setError(null);
    setBumpNote(null);

    try {
      // Never retried: a bump is a delta (see `addOrBumpItem`).
      const outcome = await addOrBumpItem(client, listId, addDraft, last);

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      if (outcome.value.bumped) {
        const { name, quantity, capped } = outcome.value;
        setBumpNote({
          id: Date.now(),
          text: capped ? `${name} is already \u00D7${quantity}` : `${name} is now \u00D7${quantity}`,
        });
      }

      await refresh();
      setAddDraft('');
    } finally {
      setAddBusy(false);
      addBusyRef.current = false;
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
          heading="No store attached"
          body="Attach a store to this list before you start shopping."
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
  // Ticks not yet recorded as a shop. An item ticked just now (optimistic overlay) counts
  // as new even if the stale `recordedAt` still shows, because untick-then-retick clears
  // it server-side. `recordedOnly` (everything ticked is already recorded) swaps the
  // finish card for Reset list.
  const newCheckedCount = items.filter(
    (item) => isChecked(item) && (optimisticChecked.has(item.id) || item.recordedAt === null),
  ).length;
  const recordedOnly = checkedCount > 0 && newCheckedCount === 0;

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll scrollRef={scrollRef}>
      <Text style={styles.caption}>{`${checkedCount} of ${items.length} checked`}</Text>

      {error ? <ErrorNote message={error} /> : null}

      <View style={styles.addComposer}>
        <View style={styles.addField}>
          <Field
            accessibilityLabel="Add an item"
            value={addDraft}
            onChangeText={setAddDraft}
            placeholder="Add an item"
            autoCapitalize="sentences"
            maxLength={120}
            onSubmitEditing={() => void addNewItem()}
            returnKeyType="done"
            submitBehavior="submit"
            blurOnSubmit={false}
          />
        </View>
        <PrimaryButton
          label="+"
          accessibilityLabel="Add item"
          compact
          onPress={() => void addNewItem()}
          busy={addBusy}
          disabled={addDraft.trim().length === 0}
          keepFocus
        />
      </View>

      {bumpNote ? <Banner key={bumpNote.id} message={bumpNote.text} /> : null}

      <View>
        {orderedItems.map((item) => {
          const section = sectionForItemName(locationItems.items, item.name);
          const editing = editingItemId === item.id;
          const corrections =
            section !== null
              ? pendingCorrectionsForItemName(itemVotes.votes, item.name, section)
              : [];

          return (
            <CompactItemRow
              key={item.id}
              name={item.name}
              checked={isChecked(item)}
              onToggle={() => void toggle(item)}
              disabled={pending.has(item.id)}
              pill={section}
              stepper={
                <QuantityControl
                  name={item.name}
                  quantity={quantityOf(item)}
                  onIncrement={() => void step(item, 1)}
                  onOpenEditor={() => beginQuantityEditing(item.id)}
                  disabled={finishingShopping}
                />
              }
              onLocation={() => beginEditing(item.id)}
              locationLabel={
                section !== null
                  ? `Propose a new item location for ${item.name}`
                  : `Add an item location for ${item.name}`
              }
              locationDisabled={pending.has(item.id)}
              onRemove={() => beginRemoving(item.id)}
              removeLabel={`Remove ${item.name}`}
              removeDisabled={pending.has(item.id)}
              confirm={
                confirmingRemoveId === item.id ? (
                  <RowConfirm
                    message={`Remove ${item.name}?`}
                    confirmLabel="Remove"
                    onConfirm={() => void removeThisItem(item)}
                    onCancel={cancelRemoving}
                    busy={pending.has(item.id)}
                  />
                ) : undefined
              }
              editor={
                editing ? (
                  <InlineRowEditor
                    value={locationDraft}
                    onChangeText={setLocationDraft}
                    placeholder={section !== null ? `Currently: ${section}` : 'Aisle 4'}
                    accessibilityLabel={
                      section !== null ? `New item location for ${item.name}` : `Item location for ${item.name}`
                    }
                    onSubmit={() => void (section !== null ? submitCorrection(item) : submitTag(item))}
                    onCancel={cancelEditing}
                    busy={pending.has(item.id)}
                    submitDisabled={locationDraft.trim().length === 0}
                    maxLength={60}
                  />
                ) : quantityEditingId === item.id ? (
                  <QuantityEditor
                    name={item.name}
                    quantity={quantityOf(item)}
                    max={MAX_QUANTITY}
                    onIncrement={() => void step(item, 1)}
                    onDecrement={() => void step(item, -1)}
                    onDone={() => setQuantityEditingId(null)}
                    disabled={finishingShopping}
                  />
                ) : undefined
              }
              footer={
                corrections.length > 0 ? (
                  <View>
                    {corrections.map((correction) => (
                      <PendingCorrectionLine
                        key={correction.proposedSection}
                        proposedSection={correction.proposedSection}
                        onConfirm={() => void confirmCorrection(item, correction.proposedSection)}
                        busy={pending.has(item.id)}
                      />
                    ))}
                  </View>
                ) : undefined
              }
            />
          );
        })}
      </View>

      {banner ? <Banner key={banner} message={banner} /> : null}

      {confirmingFinish && recordedOnly ? (
        <Card>
          <Body>
            Everything checked has already been recorded. Reset the list to untick it all for
            next time? No shop is recorded.
          </Body>
          <View style={styles.confirmActions}>
            <PrimaryButton
              label="Reset list"
              onPress={() => void resetThisList()}
              busy={finishingShopping}
              disabled={inFlightTotal > 0}
            />
            <SecondaryButton
              label="Cancel"
              onPress={() => setConfirmingFinish(false)}
              disabled={finishingShopping}
            />
          </View>
        </Card>
      ) : confirmingFinish && newCheckedCount > 0 ? (
        <Card>
          <Body>
            {`This records what you've checked since the last finish, in the order you checked it, as a shop at ${storeName ?? 'this store'}.`}
          </Body>
          <View style={styles.confirmActions}>
            <PrimaryButton
              label="Done shopping"
              onPress={() => void finishThisShop('done')}
              busy={finishingShopping}
              disabled={inFlightTotal > 0}
            />
            <SecondaryButton
              label="Continue at another store"
              onPress={() => void finishThisShop('continue')}
              disabled={finishingShopping || inFlightTotal > 0}
            />
            <SecondaryButton
              label="Cancel"
              onPress={() => setConfirmingFinish(false)}
              disabled={finishingShopping}
            />
          </View>
        </Card>
      ) : (
        <SecondaryButton
          label="Finish shopping"
          onPress={() => {
            setError(null);
            setConfirmingFinish(true);
          }}
          disabled={checkedCount === 0 || pending.size > 0 || inFlightTotal > 0}
        />
      )}
    </Screen>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    addComposer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
    },
    addField: {
      flex: 1,
    },
    confirmActions: {
      gap: tokens.space.sm,
    },
    caption: {
      fontSize: tokens.fontSize.caption,
      lineHeight: tokens.fontSize.caption * 1.5,
      color: tokens.color.textSecondary,
    },
  });
}
