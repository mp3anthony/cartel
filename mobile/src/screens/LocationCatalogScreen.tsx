import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import { CheckIcon } from '../components/RowIcons';
import {
  CompactItemRow,
  EmptyState,
  ErrorNote,
  IconButton,
  InlineRowEditor,
  NAVIGATOR_EDGES,
  Screen,
} from '../components/ui';
import { useLocationItems } from '../hooks/useLocationItems';
import { useLocationItemVotes } from '../hooks/useLocationItemVotes';
import { useLocations } from '../hooks/useLocations';
import { capitaliseFirst } from '../lib/itemName';
import { pendingCorrectionsForItemName, voteLocationItemCorrection } from '../lib/locationItemVotes';
import type { LocationItemVoteRow, PendingCorrection } from '../lib/locationItemVotes';
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

export type CatalogGroup = { section: string; rows: CatalogRow[] };

/** Section then name, both `localeCompare`; presentational only. #149 builds search and collapsing on this. */
export function groupCatalog(
  items: readonly LocationItemRow[],
  votes: readonly LocationItemVoteRow[],
): CatalogGroup[] {
  const bySection = new Map<string, LocationItemRow[]>();
  for (const item of items) {
    const bucket = bySection.get(item.section);
    if (bucket) {
      bucket.push(item);
    } else {
      bySection.set(item.section, [item]);
    }
  }

  return Array.from(bySection.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((section) => ({
      section,
      rows: bySection
        .get(section)!
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({
          item,
          displayName: capitaliseFirst(item.name),
          corrections: pendingCorrectionsForItemName(votes, item.name, item.section),
        })),
    }));
}

/**
 * The per-store Item catalog (#65, redesigned in #148): every item with an Item location
 * at the store, grouped by it, one compact row per item with an edit icon and, where a
 * correction is pending, a "Proposed: X" line with a check to confirm it.
 *
 * Never creates a first tag; that stays in Shopping Mode and the list's Location pin.
 * Propose/confirm is a deliberate local copy of `ShoppingScreen`'s flow (this codebase
 * duplicates small per-screen logic rather than sharing it across screens with different
 * context). Names show as `capitaliseFirst` of the folded stored name: accents and inner
 * capitals are not recoverable (D11).
 *
 * `groupCatalog`, `CatalogGroupHeader` and `CatalogGroupSection` are separate seams so
 * #149 (search, collapsing groups) can slot in without rewriting the rows.
 */
export function LocationCatalogScreen({ client, navigation, route }: Props) {
  const tokens = useTheme();
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
  const [correctionDraft, setCorrectionDraft] = useState('');
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

  const groups = useMemo(
    () =>
      locationItems.status === 'loaded' && itemVotes.status === 'loaded'
        ? groupCatalog(locationItems.items, itemVotes.votes)
        : [],
    [locationItems, itemVotes],
  );

  function beginEditing(id: string) {
    setError(null);
    editingItemIdRef.current = id;
    setEditingItemId(id);
    setCorrectionDraft('');
  }

  function cancelEditing() {
    editingItemIdRef.current = null;
    setEditingItemId(null);
    setCorrectionDraft('');
  }

  // Closes the editor only if it still belongs to `id` (a slow write must not close another row's).
  function finishEditing(id: string) {
    if (editingItemIdRef.current === id) {
      cancelEditing();
    }
  }

  async function submitCorrection(item: LocationItemRow) {
    if (
      correctionDraft.trim().length === 0 ||
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
        locationId,
        item.name,
        capitaliseFirst(correctionDraft),
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

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll scrollRef={scrollRef}>
      {error ? <ErrorNote message={error} /> : null}

      {groups.map((group) => (
        <CatalogGroupSection key={group.section} group={group}>
          {group.rows.map(({ item, displayName, corrections }) => (
            <CompactItemRow
              key={item.id}
              name={displayName}
              onEdit={() => beginEditing(item.id)}
              editLabel={`Propose a new item location for ${displayName}`}
              editDisabled={pending.has(item.id)}
              editor={
                editingItemId === item.id ? (
                  <InlineRowEditor
                    value={correctionDraft}
                    onChangeText={setCorrectionDraft}
                    placeholder={`Currently: ${item.section}`}
                    accessibilityLabel={`New item location for ${displayName}`}
                    onSubmit={() => void submitCorrection(item)}
                    onCancel={cancelEditing}
                    busy={pending.has(item.id)}
                    submitDisabled={correctionDraft.trim().length === 0}
                    maxLength={60}
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
      ))}
    </Screen>
  );
}

function CatalogGroupHeader({ section }: { section: string }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Text accessibilityRole="header" style={styles.groupHeader}>
      {section}
    </Text>
  );
}

function CatalogGroupSection({ group, children }: { group: CatalogGroup; children: ReactNode }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.group}>
      <CatalogGroupHeader section={group.section} />
      <View>{children}</View>
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
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
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
