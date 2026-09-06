import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Body,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from '../components/ui';
import { useLocationItems } from '../hooks/useLocationItems';
import { useLocationItemVotes } from '../hooks/useLocationItemVotes';
import { useLocations } from '../hooks/useLocations';
import { pendingCorrectionsForItemName, voteLocationItemCorrection } from '../lib/locationItemVotes';
import type { LocationItemRow } from '../lib/locationItems';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationCatalog'> & {
  client: SupabaseClient;
};

/**
 * Issue #65 — a per-location catalog: every `location_items` row ever tagged
 * at a store, grouped by section, browsable from `LocationsScreen`'s new
 * "View catalog" button on each row. The point is answering "has anyone
 * tagged this before" at a glance, without a direct DB check — raised by the
 * user in the context of #64's unresolved tag-loss investigation.
 *
 * Correction voting here is not a new mechanism — it reuses
 * `ShoppingScreen.tsx`'s Slice 8 propose/confirm flow verbatim (the same
 * `voteLocationItemCorrection` RPC, the same pencil-opens-inline-composer
 * shape, the same "pending corrections render below as a Body line plus a
 * single-tap Confirm button" rendering, since this system has no
 * reject/veto verb). This codebase's established stance (see
 * `ListDetailScreen.submitCopy()`'s own doc comment) is to duplicate small
 * per-screen logic like this rather than force a shared abstraction across
 * two screens with different surrounding context, so the propose/confirm
 * handlers below are a deliberate, local reimplementation, not an
 * accidental fork.
 *
 * `pending` here is a single shared `Set<string>` of in-flight item ids,
 * same idea as `ShoppingScreen`'s own `pending` — but simpler, since this
 * screen has no check-off concern at all: the only writes it ever makes are
 * correction propose/confirm, so one Set covering both is fine with no risk
 * of blocking an unrelated tap.
 *
 * Deliberately does **not** offer any way to tag a brand-new, never-tagged
 * item — that stays `tagItemLocation()`'s first-write-wins path in Shopping
 * Mode only (issue's explicit non-goal). This screen only ever shows/corrects
 * rows that already exist in `location_items`.
 *
 * Item names render as a plain bold row label, not `Badge` — `Badge`'s own
 * doc comment in `ui.tsx` calls it "a small scope marker," which an item
 * name isn't; `Badge` stays reserved for section text, consistent with every
 * other screen's usage (each section is already this group's own heading
 * here, so no `Badge` is needed for it inline either).
 *
 * Grouping is section-then-alphabetical, presentational only (the issue
 * leaves this to the implementer's judgment) — a plain two-level string
 * sort, unrelated to `computeRouteOrder`'s history-weighted mean ordering
 * used in Shopping Mode.
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
  const [correctingItemId, setCorrectingItemId] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const location =
    locationsView.status === 'loaded'
      ? locationsView.locations.find((candidate) => candidate.id === locationId) ?? null
      : null;

  useLayoutEffect(() => {
    if (location) {
      navigation.setOptions({ title: location.name });
    }
  }, [location, navigation]);

  function beginCorrecting(item: LocationItemRow) {
    setError(null);
    setCorrectingItemId(item.id);
    setCorrectionDraft('');
  }

  function cancelCorrecting() {
    setCorrectingItemId(null);
    setCorrectionDraft('');
  }

  async function submitCorrection(item: LocationItemRow) {
    if (correctionDraft.trim().length === 0 || pending.has(item.id)) {
      return;
    }

    setPending((current) => new Set(current).add(item.id));
    setError(null);

    try {
      const outcome = await voteLocationItemCorrection(
        client,
        locationId,
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

  async function confirmCorrection(item: LocationItemRow, proposedSection: string) {
    if (pending.has(item.id)) {
      return;
    }

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
          heading="Nothing tagged here yet"
          body="Items show up here as people shop and tag them."
        />
      </Screen>
    );
  }

  const bySection = new Map<string, LocationItemRow[]>();
  for (const item of locationItems.items) {
    const bucket = bySection.get(item.section);
    if (bucket) {
      bucket.push(item);
    } else {
      bySection.set(item.section, [item]);
    }
  }
  const sections = Array.from(bySection.keys()).sort((a, b) => a.localeCompare(b));

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      {error ? <ErrorNote message={error} /> : null}

      {sections.map((section) => (
        <View key={section} style={styles.sectionGroup}>
          <Body>{section}</Body>
          {bySection
            .get(section)!
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => {
              const correcting = correctingItemId === item.id;
              const corrections = pendingCorrectionsForItemName(
                itemVotes.votes,
                item.name,
                item.section,
              );

              return (
                <View key={item.id} style={styles.itemGroup}>
                  {correcting ? (
                    <View style={styles.composer}>
                      <Field
                        label="New section"
                        value={correctionDraft}
                        onChangeText={setCorrectionDraft}
                        placeholder={`Currently: ${item.section}`}
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
                    <View style={styles.itemRow}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <IconButton
                        glyph="✏"
                        accessibilityLabel={`Propose a new location for ${item.name}`}
                        onPress={() => beginCorrecting(item)}
                        disabled={pending.has(item.id)}
                      />
                    </View>
                  )}

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
        </View>
      ))}
    </Screen>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    sectionGroup: {
      gap: tokens.space.sm,
    },
    itemGroup: {
      gap: tokens.space.xs,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
    },
    itemName: {
      flex: 1,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    composer: {
      gap: tokens.space.sm,
    },
    pendingCorrections: {
      gap: tokens.space.xs,
      paddingLeft: tokens.space.md,
    },
    pendingCorrectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
    },
  });
}
