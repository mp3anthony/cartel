import { useMemo, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from './ui';
import { ProgressRing } from './ProgressRing';
import { ScopeIcon } from './ScopeIcon';
import { StoreBadge } from './StoreBadge';
import type { Household } from '../lib/household';
import type { ListRow } from '../lib/lists';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

export type NearbyParts = { button: ReactNode; results: ReactNode };

type StoreInfo = { name: string; chain: string | null } | null;

/** How much of the next card peeks in when there are several shops in progress. */
const PEEK_FRACTION = 0.88;

/**
 * Home's hero (#144): one card per shop in progress, or "Start a shop" when there is none,
 * so Home never has an empty hero. A card is a plain View with one Resume button (no
 * nested touchables). With several, the cards sit in a sideways scroller that snaps, with
 * the next card peeking in. Web gets `pagingEnabled` (react-native-web maps it to CSS
 * scroll-snap); native snaps to the card interval. The scroller measures its own width
 * (`onLayout`) so card widths are real numbers; before that, cards render full width.
 */
export function HomeHero({
  inProgress,
  storeFor,
  household,
  onResume,
  onNewList,
  nearby,
}: {
  inProgress: ListRow[];
  storeFor: (locationId: string | null) => StoreInfo;
  household: Household | null;
  onResume: (listId: string) => void;
  onNewList: () => void;
  /** The caller owns the nearby check: `button` sits beside New list, `results` renders below the buttons. */
  nearby: NearbyParts;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [width, setWidth] = useState(0);

  if (inProgress.length === 0) {
    return <StartAShop onNewList={onNewList} nearby={nearby} />;
  }

  const cards = inProgress.map((list) => (
    <ShopCard
      key={list.id}
      list={list}
      store={storeFor(list.locationId)}
      household={household}
      onResume={onResume}
    />
  ));

  if (inProgress.length === 1) {
    return <View>{cards[0]}</View>;
  }

  const gap = tokens.space.sm;
  const cardWidth = width > 0 ? Math.round(width * PEEK_FRACTION) : undefined;
  const isWeb = Platform.OS === 'web';

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled={isWeb}
        snapToInterval={!isWeb && cardWidth ? cardWidth + gap : undefined}
        decelerationRate="fast"
        contentContainerStyle={{ gap }}
      >
        {inProgress.map((list, i) => (
          <View key={list.id} style={cardWidth ? { width: cardWidth } : styles.fullWidth}>
            {cards[i]}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function ShopCard({
  list,
  store,
  household,
  onResume,
}: {
  list: ListRow;
  store: StoreInfo;
  household: Household | null;
  onResume: (listId: string) => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.card}>
      <View style={styles.cardMain}>
        <View style={styles.storeLine}>
          {store ? <StoreBadge chain={store.chain} /> : null}
          <Text style={styles.storeName} numberOfLines={1}>
            {store ? store.name : 'No store'}
          </Text>
        </View>
        <View style={styles.titleLine}>
          <Text style={styles.listName} numberOfLines={2}>
            {list.name}
          </Text>
          <ScopeIcon shared={list.householdId !== null} householdName={household?.name ?? null} />
        </View>
        <PrimaryButton
          label="Resume"
          onPress={() => onResume(list.id)}
          accessibilityLabel={`Resume ${list.name}, ${list.checkedCount} of ${list.itemCount} ticked`}
        />
      </View>
      <ProgressRing checked={list.checkedCount} total={list.itemCount} />
    </View>
  );
}

function StartAShop({ onNewList, nearby }: { onNewList: () => void; nearby: NearbyParts }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.startCard}>
      <Text style={styles.listName}>Start a shop</Text>
      <Text style={styles.quiet}>Make a list, or find a store near you.</Text>
      {/* Deliberate exception to content-sized buttons (#213): an equal-width pair filling the card. */}
      <View style={styles.heroButtons}>
        <View style={styles.heroButtonSlot}>
          <PrimaryButton label="New list" onPress={onNewList} fullWidth />
        </View>
        <View style={styles.heroButtonSlot}>{nearby.button}</View>
      </View>
      {nearby.results}
    </View>
  );
}

function createStyles(tokens: Tokens) {
  const card = {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    ...tokens.elevation.card,
  } as const;

  return StyleSheet.create({
    fullWidth: {
      width: '100%',
    },
    card: {
      ...card,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tokens.space.md,
    },
    cardMain: {
      flex: 1,
      gap: tokens.space.sm,
      alignItems: 'flex-start',
    },
    storeLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
      alignSelf: 'stretch',
    },
    storeName: {
      flexShrink: 1,
      color: tokens.color.textSecondary,
      fontSize: tokens.fontSize.caption,
    },
    titleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
      alignSelf: 'stretch',
    },
    listName: {
      flexShrink: 1,
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.title,
      fontWeight: '700',
    },
    startCard: {
      ...card,
      gap: tokens.space.sm,
    },
    heroButtons: {
      flexDirection: 'row',
      gap: tokens.space.sm,
    },
    heroButtonSlot: {
      flex: 1,
      minWidth: 0,
    },
    quiet: {
      color: tokens.color.textSecondary,
      fontSize: tokens.fontSize.body,
    },
  });
}
