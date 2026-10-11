import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CountUp } from './CountUp';
import { DonutChart, DonutRing, type DonutSegment } from './DonutChart';
import { ChevronIcon } from './ScopeIcon';
import { ShopFrequencyBars } from './ShopFrequencyBars';
import { bucketShops, MONTHS_SHOWN, WEEKS_SHOWN } from '../lib/shopFrequency';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type GraphId = 'where' | 'often';

const CHART_HEIGHT = 88;
const DETAIL_BARS_HEIGHT = 120;

/**
 * Home's two graph tiles (#145), side by side: "Where you shop" (shops per Store, a donut)
 * and "How often you shop" (shops per week, bars). Tapping a tile opens a full-width detail
 * card directly below the row; tapping the same tile closes it, tapping the other switches.
 * One open at a time. The detail card is a sibling of the tiles, never inside a Pressable,
 * because the donut legend has tappable rows of its own.
 *
 * Motion: the tiles' charts and numbers animate on mount, and the detail chart animates
 * when it is expanded (it mounts then). Once per mount, never on a refetch: new data just
 * shows (see `useMountProgress`).
 *
 * Windows: the tile bars are the current week plus the previous 7, weeks starting Monday in
 * local time; the detail is the current month plus the previous 5. Older shops are left out
 * of the bars but still counted in the donut. Bucketing is DST-safe (see `bucketShops`).
 *
 * Existing data only: shop counts per Store and completion times. Category and spending
 * graphs are out of spec (see CHANGE-LOG.md).
 */
export function HomeGraphs({
  segments,
  completedAt,
  onStorePress,
}: {
  segments: DonutSegment[];
  completedAt: string[];
  onStorePress: (locationId: string) => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [expanded, setExpanded] = useState<GraphId | null>(null);

  const weeks = useMemo(() => bucketShops(completedAt, new Date(), 'week', WEEKS_SHOWN), [completedAt]);
  const months = useMemo(() => bucketShops(completedAt, new Date(), 'month', MONTHS_SHOWN), [completedAt]);

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const top = segments.reduce<DonutSegment | null>(
    (best, s) => (best === null || s.value > best.value ? s : best),
    null,
  );
  const weeksTotal = weeks.reduce((sum, b) => sum + b.count, 0);

  const whereLabel = `Where you shop, ${shops(total)}${top ? `, most at ${top.label}` : ''}`;
  const oftenLabel = `How often you shop, ${shops(weeksTotal)} in the last ${WEEKS_SHOWN} weeks`;

  const toggle = (id: GraphId) => setExpanded((current) => (current === id ? null : id));

  return (
    <View style={styles.wrap}>
      <View style={styles.tiles}>
        <GraphTile
          title="Where you shop"
          open={expanded === 'where'}
          accessibilityLabel={whereLabel}
          onPress={() => toggle('where')}
          chart={<DonutRing segments={segments} size={CHART_HEIGHT} stroke={14} />}
          figure={
            <>
              <CountUp value={total} style={styles.figureNumber} />
              <Text style={styles.figureUnit}>{total === 1 ? 'shop' : 'shops'}</Text>
            </>
          }
        />
        <GraphTile
          title="How often you shop"
          open={expanded === 'often'}
          accessibilityLabel={oftenLabel}
          onPress={() => toggle('often')}
          chart={<ShopFrequencyBars buckets={weeks} height={CHART_HEIGHT} />}
          figure={
            <>
              <CountUp value={weeksTotal} style={styles.figureNumber} />
              <Text style={styles.figureUnit}>
                {`${weeksTotal === 1 ? 'shop' : 'shops'} in ${WEEKS_SHOWN} weeks`}
              </Text>
            </>
          }
        />
      </View>

      {expanded === 'where' ? (
        <View style={styles.detail}>
          <Text accessibilityRole="header" style={styles.detailTitle}>
            Where you shop
          </Text>
          <DonutChart segments={segments} onSegmentPress={onStorePress} />
        </View>
      ) : null}

      {expanded === 'often' ? (
        <View style={styles.detail}>
          <Text accessibilityRole="header" style={styles.detailTitle}>
            How often you shop
          </Text>
          <Text style={styles.detailCaption}>{`Last ${MONTHS_SHOWN} months`}</Text>
          <ShopFrequencyBars
            buckets={months}
            height={DETAIL_BARS_HEIGHT}
            showCounts
            labels={months.map((b) => b.start.toLocaleDateString(undefined, { month: 'short' }))}
          />
        </View>
      ) : null}
    </View>
  );
}

function shops(count: number): string {
  return `${count} ${count === 1 ? 'shop' : 'shops'}`;
}

function GraphTile({
  title,
  open,
  accessibilityLabel,
  onPress,
  chart,
  figure,
}: {
  title: string;
  open: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  chart: ReactNode;
  figure: ReactNode;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // react-native-web does not map `accessibilityState.expanded` to `aria-expanded`
      // (the same workaround History uses), so both are set.
      aria-expanded={open}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        // The border is always 2px (transparent at rest) so opening never shifts the layout.
        { borderColor: open ? tokens.color.accent : 'transparent' },
        pressed ? styles.tilePressed : null,
      ]}
    >
      <View style={styles.titleRow}>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {title}
        </Text>
        <ChevronIcon expanded={open} />
      </View>
      <View style={styles.chartArea}>{chart}</View>
      <View style={styles.figureRow}>{figure}</View>
    </Pressable>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    wrap: {
      gap: tokens.space.sm,
    },
    tiles: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: tokens.space.sm,
    },
    tile: {
      flex: 1,
      flexBasis: 0,
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 2,
      padding: tokens.space.md,
      gap: tokens.space.sm,
      ...tokens.elevation.card,
    },
    tilePressed: {
      opacity: 0.7,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: tokens.space.xs,
    },
    tileTitle: {
      flex: 1,
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
    },
    chartArea: {
      height: CHART_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    figureRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: tokens.space.xs,
      marginTop: 'auto',
    },
    figureNumber: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.title,
      fontWeight: '700',
    },
    figureUnit: {
      color: tokens.color.textSecondary,
      fontSize: tokens.fontSize.caption,
    },
    detail: {
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      padding: tokens.space.md,
      gap: tokens.space.sm,
      ...tokens.elevation.card,
    },
    detailTitle: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.body,
      fontWeight: '700',
    },
    detailCaption: {
      color: tokens.color.textSecondary,
      fontSize: tokens.fontSize.caption,
    },
  });
}
