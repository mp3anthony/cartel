import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ItemLocationPicker } from '../components/ItemLocationPicker';
import { CheckIcon } from '../components/RowIcons';
import { ChevronIcon } from '../components/ScopeIcon';
import {
  CompactItemRow,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  NAVIGATOR_EDGES,
  Screen,
} from '../components/ui';
import { useLocationItems } from '../hooks/useLocationItems';
import { useLocationItemVotes } from '../hooks/useLocationItemVotes';
import { useLocations } from '../hooks/useLocations';
import { buildCatalogGroups, isCatalogGroupOpen } from '../lib/itemCatalog';
import type { ItemCatalogGroup } from '../lib/itemCatalog';
import { capitaliseFirst, foldItemName } from '../lib/itemName';
import { usedAisleNumbers } from '../lib/itemLocationPicker';
import { parseLayoutLabel } from '../lib/layoutOrder';
import { pendingCorrectionsForItemName, voteLocationItemCorrection } from '../lib/locationItemVotes';
import type { PendingCorrection } from '../lib/locationItemVotes';
import type { LocationItemRow } from '../lib/locationItems';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationCatalog'> & {
  client: SupabaseClient;
};

export type CatalogRow = {
  item: LocationItemRow;
  /** `capitaliseFirst` of the folded stored name; accents and inner capitals are not recoverable (D11). */
  displayName: string;
  corrections: PendingCorrection[];
};

export type CatalogGroup = ItemCatalogGroup<CatalogRow>;

const catalogGroupOptions = {
  getName: (row: CatalogRow) => row.item.name,
  getSection: (row: CatalogRow) => row.item.section,
  hasPendingCorrection: (row: CatalogRow) => row.corrections.length > 0,
  fold: foldItemName,
};

/**
 * The per-store Item catalog (#65, redesigned in #148, search and collapsing groups in
 * #149): every item with an Item location at the store, grouped by it, one compact row per
 * item with an edit icon and, where a correction is pending, a "Proposed: X" line with a
 * check to confirm it.
 *
 * Never creates a first tag; that stays in Shopping Mode and the list's Location pin.
 * The edit opens the Item location picker (#154), the same chips as those two; its
 * "Missing one? Tell us" link opens Feedback with this Store attached.
 * Propose/confirm is a deliberate local copy of `ShoppingScreen`'s flow (this codebase
 * duplicates small per-screen logic rather than sharing it across screens with different
 * context). Names show as `capitaliseFirst` of the folded stored name: accents and inner
 * capitals are not recoverable (D11).
 *
 * Grouping and search live in `lib/itemCatalog.ts`. Groups start collapsed; the open set
 * is per-mount state, not remembered between visits. Search matches item names only
 * (folded with `foldItemName`) and has its own collapse set, so clearing it restores the
 * user's own choices. The dot on a header is the only hint that a correction is waiting,
 * since Home no longer lists them (#144).
 */
export function LocationCatalogScreen({ client, navigation, route }: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { locationId } = route.params;

  const { view: locationsView } = useLocations(client);
  const { view: locationItems, refresh: refreshLocationItems } = useLocationItems(
    client,
    locationId,
  );
  const { view: itemVotes, refresh: refreshLocationItemVotes } = useLocationItemVotes(
    client,
    locationId,
  );

  const [pending, setPending] = useState<Set<string>>(new Set());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Mirrors `editingItemId` so an in-flight write can tell whether its editor is still open.
  const editingItemIdRef = useRef<string | null>(null);
  const writingRef = useRef<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const location =
    locationsView.status === 'loaded'
      ? locationsView.locations.find((candidate) => candidate.id === locationId) ?? null
      : null;

  useLayoutEffect(() => {
    if (location) {
      navigation.setOptions({ title: location.name });
    }
  }, [location, navigation]);

  useEffect(() => {
    if (error) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [error]);

  // The Store's aisle numbers already in use: the picker's quick chips (#154).
  const usedAisles = useMemo(
    () =>
      locationItems.status === 'loaded'
        ? usedAisleNumbers(
            locationItems.items.map((row) => row.section),
            (label) => parseLayoutLabel(label, foldItemName),
          )
        : [],
    [locationItems],
  );

  const [search, setSearch] = useState('');
  // Empty means every group is collapsed. Search never writes it (see `isCatalogGroupOpen`).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchCollapsed, setSearchCollapsed] = useState<Set<string>>(new Set());
  // Set while a correction is in flight, so a section the item moves into can be opened.
  const [reveal, setReveal] = useState<{ itemId: string; fromSection: string } | null>(null);

  const foldedQuery = foldItemName(search);
  const searching = foldedQuery !== '';

  const rows = useMemo<CatalogRow[]>(
    () =>
      locationItems.status === 'loaded' && itemVotes.status === 'loaded'
        ? locationItems.items.map((item) => ({
            item,
            displayName: capitaliseFirst(item.name),
            corrections: pendingCorrectionsForItemName(itemVotes.votes, item.name, item.section),
          }))
        : [],
    [locationItems, itemVotes],
  );

  // A correction that applied (or only changed case) moves the item to another section;
  // open that section so it does not vanish into a collapsed group. A proposal that
  // leaves the item where it is changes nothing and the effect finds no move.
  useEffect(() => {
    if (reveal === null || locationItems.status !== 'loaded') {
      return;
    }
    const moved = locationItems.items.find((item) => item.id === reveal.itemId);
    if (moved && moved.section !== reveal.fromSection) {
      setExpanded((current) => new Set(current).add(moved.section));
      setSearchCollapsed((current) => {
        const next = new Set(current);
        next.delete(moved.section);
        return next;
      });
      setReveal(null);
    }
  }, [reveal, locationItems]);

  function onChangeSearch(text: string) {
    setSearch(text);
    setSearchCollapsed(new Set());

    // An open editor survives typing while its row stays on screen; otherwise close it
    // (unless a write is in flight; `finishEditing` closes it when that returns).
    const editingId = editingItemIdRef.current;
    if (editingId !== null && !pending.has(editingId)) {
      const nextQuery = foldItemName(text);
      const stillVisible = buildCatalogGroups(rows, { ...catalogGroupOptions, query: nextQuery }).some(
        (group) =>
          isCatalogGroupOpen(group.section, {
            searching: nextQuery !== '',
            expanded,
            searchCollapsed: new Set(),
          }) && group.items.some((row) => row.item.id === editingId),
      );
      if (!stillVisible) {
        cancelEditing();
      }
    }
  }

  function toggleGroup(group: CatalogGroup, open: boolean) {
    const setter = searching ? setSearchCollapsed : setExpanded;
    // Search collapses by adding to the set; browsing expands by adding to it.
    const adding = searching ? open : !open;
    setter((current) => {
      const next = new Set(current);
      if (adding) {
        next.add(group.section);
      } else {
        next.delete(group.section);
      }
      return next;
    });

    // Collapsing hides the editor; drop it unless its write is still in flight.
    const editingId = editingItemIdRef.current;
    if (
      open &&
      editingId !== null &&
      !pending.has(editingId) &&
      group.items.some((row) => row.item.id === editingId)
    ) {
      cancelEditing();
    }
  }

  function beginEditing(id: string) {
    setError(null);
    editingItemIdRef.current = id;
    setEditingItemId(id);
  }

  function cancelEditing() {
    editingItemIdRef.current = null;
    setEditingItemId(null);
  }

  // Closes the editor only if it still belongs to `id` (a slow write must not close another row's).
  function finishEditing(id: string) {
    if (editingItemIdRef.current === id) {
      cancelEditing();
    }
  }

  // "Missing one? Tell us": closes the picker and opens Feedback with the subject and the
  // Store filled in (#154).
  function reportMissingLocation() {
    cancelEditing();
    navigation.navigate('Feedback', {
      fromScreen: 'LocationCatalog',
      title: 'Item location missing',
      storeName: location?.name,
      locationId,
    });
  }

  async function submitCorrection(item: LocationItemRow, label: string) {
    if (pending.has(item.id) || writingRef.current.has(item.id)) {
      return;
    }

    writingRef.current.add(item.id);
    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await voteLocationItemCorrection(
        client,
        locationId,
        item.name,
        label,
      );

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      setReveal({ itemId: item.id, fromSection: item.section });
      await refreshLocationItems();
      await refreshLocationItemVotes();
      finishEditing(item.id);
    } finally {
      setReveal(null);
      writingRef.current.delete(item.id);
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function confirmCorrection(item: LocationItemRow, proposedSection: string) {
    if (pending.has(item.id) || writingRef.current.has(item.id)) {
      return;
    }

    writingRef.current.add(item.id);
    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await voteLocationItemCorrection(
        client,
        locationId,
        item.name,
        proposedSection,
      );

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      setReveal({ itemId: item.id, fromSection: item.section });
      await refreshLocationItems();
      await refreshLocationItemVotes();
    } finally {
      setReveal(null);
      writingRef.current.delete(item.id);
      setPending((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  if (locationItems.status === 'loading' || itemVotes.status === 'loading') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ActivityIndicator color={tokens.color.accent} size="large" />
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

  if (itemVotes.status === 'error') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <ErrorNote message={itemVotes.message} />
      </Screen>
    );
  }

  if (locationItems.items.length === 0) {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <EmptyState
          heading="No item locations here yet"
          body="Items show up here once people add their item locations while shopping."
        />
      </Screen>
    );
  }

  const groups = buildCatalogGroups(rows, { ...catalogGroupOptions, query: foldedQuery });

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll scrollRef={scrollRef}>
      {error ? <ErrorNote message={error} /> : null}

      <View>
        <Field
          label="Search items"
          value={search}
          onChangeText={onChangeSearch}
          placeholder="e.g. milk"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          inputMode="search"
        />
        {/* Always mounted so screen readers announce the text changing, not a node appearing. */}
        <Text accessibilityLiveRegion="polite" aria-live="polite" style={styles.noMatch}>
          {searching && groups.length === 0 ? 'No items match' : ''}
        </Text>
      </View>

      {groups.map((group) => {
        const open = isCatalogGroupOpen(group.section, { searching, expanded, searchCollapsed });
        return (
          <CatalogGroupSection
            key={group.section}
            group={group}
            open={open}
            onToggle={() => toggleGroup(group, open)}
          >
            {group.items.map(({ item, displayName, corrections }) => (
              <CompactItemRow
                key={item.id}
                name={displayName}
                onEdit={() => beginEditing(item.id)}
                editLabel={`Propose a new item location for ${displayName}`}
                editDisabled={pending.has(item.id)}
                editor={
                  editingItemId === item.id ? (
                    <ItemLocationPicker
                      itemName={displayName}
                      currentLabel={item.section}
                      usedAisles={usedAisles}
                      onPick={(label) => void submitCorrection(item, label)}
                      onCancel={cancelEditing}
                      onReportMissing={reportMissingLocation}
                      busy={pending.has(item.id)}
                    />
                  ) : undefined
                }
                footer={
                  corrections.length > 0 ? (
                    <View>
                      {corrections.map((correction) => (
                        <ProposedLine
                          key={correction.proposedSection}
                          proposedSection={correction.proposedSection}
                          displayName={displayName}
                          busy={pending.has(item.id)}
                          onConfirm={() => void confirmCorrection(item, correction.proposedSection)}
                        />
                      ))}
                    </View>
                  ) : undefined
                }
              />
            ))}
          </CatalogGroupSection>
        );
      })}
    </Screen>
  );
}

/**
 * A collapsible header: the heading element wraps the button so heading navigation still
 * finds it. Pressed is opacity only (no scale or fill on rows, #156). The dot marks a
 * pending correction; the count is the group's items (matches while searching).
 */
function CatalogGroupHeader({
  group,
  open,
  onToggle,
}: {
  group: CatalogGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const count = group.items.length;

  return (
    <View accessibilityRole="header">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.section}, ${count} ${count === 1 ? 'item' : 'items'}${
          group.hasPendingCorrection ? ', correction waiting' : ''
        }`}
        aria-expanded={open}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.groupHeader, pressed && styles.groupHeaderPressed]}
      >
        <Text numberOfLines={1} style={styles.groupName}>
          {group.section}
        </Text>
        {group.hasPendingCorrection ? <View accessible={false} style={styles.pendingDot} /> : null}
        <Text style={styles.groupCount}>{count}</Text>
        <ChevronIcon expanded={open} />
      </Pressable>
    </View>
  );
}

function CatalogGroupSection({
  group,
  open,
  onToggle,
  children,
}: {
  group: CatalogGroup;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.group}>
      <CatalogGroupHeader group={group} open={open} onToggle={onToggle} />
      {open ? <View>{children}</View> : null}
    </View>
  );
}

/** "Proposed: X" with a check to confirm it; a real 44pt line, flush with the row's left edge. */
function ProposedLine({
  proposedSection,
  displayName,
  busy,
  onConfirm,
}: {
  proposedSection: string;
  displayName: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.proposedLine}>
      <Text numberOfLines={2} style={styles.proposedLabel}>
        {`Proposed: ${proposedSection}`}
      </Text>
      <IconButton
        icon={(color) => <CheckIcon color={color} />}
        accessibilityLabel={`Confirm ${proposedSection} as the item location for ${displayName}`}
        onPress={onConfirm}
        disabled={busy}
      />
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    group: {
      gap: tokens.space.sm,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
      minHeight: tokens.minTouchTarget,
    },
    groupHeaderPressed: {
      opacity: 0.7,
    },
    groupName: {
      flex: 1,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    pendingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: tokens.color.accent,
    },
    groupCount: {
      fontSize: tokens.fontSize.body,
      color: tokens.color.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    noMatch: {
      fontSize: tokens.fontSize.body,
      color: tokens.color.textSecondary,
    },
    proposedLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.xs,
      paddingLeft: 0,
    },
    proposedLabel: {
      flex: 1,
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
    },
  });
}
