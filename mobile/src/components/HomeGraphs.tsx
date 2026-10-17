import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CountUp } from './CountUp';
import { DonutRing, storeColorMap, type DonutSegment } from './DonutChart';
import { GraphPopup } from './GraphPopup';
import { ShopFrequencyBars, type BarBucket, type BarLabel } from './ShopFrequencyBars';
import { toDateParam, type HistoryParams } from '../lib/historyFilter';
import {
  bucketShops,
  MONTHS_SHOWN,
  stackBucket,
  WEEKS_SHOWN,
  type ShopBucket,
  type ShopInput,
} from '../lib/shopFrequency';
import { MAX_NAMED_STORES, OTHER_KEY } from '../lib/storeColors';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type GraphId = 'where' | 'often';

const CHART_HEIGHT = 88;
const POPUP_BARS_HEIGHT = 120;
const POPUP_RING_SIZE = 160;
const POPUP_RING_STROKE = 22;

/**
 * Home's two graph tiles (#145), side by side: "Where you shop" (shops per Store, a donut)
 * and "How often you shop" (shops per week, stacked bars). Tapping a tile opens its graph in
 * a pop-up card (#215, `GraphPopup`); one is open at a time. The tiles are previews: the
 * Where tile shows only the donut, the How-often tile the 8-week stacked bars.
 *
 * Where pop-up: the ring pinned at the top and one row per Store (colour swatch, full name,
 * shops and share). A row starts or continues a shop at that Store and closes the pop-up
 * first. How-often pop-up: "Last 8 weeks" and "Last 6 months" stacked bars, then a legend.
 *
 * Colour: one map for everything (`storeColorMap`, the donut's rule). The top 5 Stores by
 * lifetime shops keep their chain colour (or an accent tint by rank); every other Store is
 * the neutral "Other stores" colour, one segment per bar and one legend row.
 *
 * Motion: the tiles' charts and numbers animate on mount; a pop-up's chart mounts when it
 * opens, so it plays once per opening. Nothing moves under Reduce Motion (see
 * `useMountProgress`). Windows: weeks start Monday in local time, the last 8 weeks and the
 * last 6 months; older shops are left out of the bars but still counted in the donut.
 * Bucketing is DST-safe (see `bucketShops`).
 *
 * History tap-through (#216): in the How-often pop-up a bar column opens History filtered to
 * that week or month, a Store's slice of it to that Store too (the grey "Other stores" slice to
 * every Store outside the top 5), and a legend row to that Store over all time. The pop-up
 * closes first, and a guard keeps one tap to one navigation. A column is the tap area; slice
 * taps are a pointer shortcut (touch-target exception in docs/conventions.md).
 *
 * Existing data only: shop counts per Store and completion times. Category and spending
 * graphs are out of spec (see CHANGE-LOG.md).
 */
export function HomeGraphs({
  segments,
  shops: shopList,
  onStorePress,
  onShowHistory,
}: {
  segments: DonutSegment[];
  shops: ShopInput[];
  onStorePress: (locationId: string) => void;
  onShowHistory: (params: HistoryParams) => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [open, setOpen] = useState<GraphId | null>(null);

  const colors = useMemo(() => storeColorMap(segments, tokens), [segments, tokens]);
  const nameById = useMemo(() => new Map(segments.map((s) => [s.key, s.label])), [segments]);
  const rankById = useMemo(() => new Map(colors.ranked.map((r) => [r.key, r])), [colors]);

  const colorFor = useMemo(
    () => (locationId: string) => {
      const entry = rankById.get(locationId);
      return entry?.named
        ? { key: locationId, color: entry.color, rank: entry.rank }
        : { key: OTHER_KEY, color: colors.otherColor, rank: MAX_NAMED_STORES };
    },
    [rankById, colors.otherColor],
  );

  const weeks = useMemo(() => bucketShops(shopList, new Date(), 'week', WEEKS_SHOWN), [shopList]);
  const months = useMemo(() => bucketShops(shopList, new Date(), 'month', MONTHS_SHOWN), [shopList]);
  const weekBars = useMemo<BarBucket[]>(
    () => weeks.map((b) => ({ start: b.start, count: b.count, segments: stackBucket(b, colorFor) })),
    [weeks, colorFor],
  );
  const monthBars = useMemo<BarBucket[]>(
    () => months.map((b) => ({ start: b.start, count: b.count, segments: stackBucket(b, colorFor) })),
    [months, colorFor],
  );

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const top = segments.reduce<DonutSegment | null>(
    (best, s) => (best === null || s.value > best.value ? s : best),
    null,
  );
  const weeksTotal = weeks.reduce((sum, b) => sum + b.count, 0);

  const whereLabel = `Where you shop, ${shopsText(total)}${top ? `, most at ${top.label}` : ''}, opens details`;
  const oftenLabel = `How often you shop, ${shopsText(weeksTotal)} in the last ${WEEKS_SHOWN} weeks, opens details`;

  // Where rows: every Store with a shop, in colour-map order (most shops first).
  const whereRows = colors.ranked.flatMap((entry) => {
    const segment = segments.find((s) => s.key === entry.key);
    return segment && segment.value > 0 ? [{ segment, color: entry.color }] : [];
  });

  // Day-of-month of each Monday, with the short month on the first column and wherever the
  // month changes.
  const weekLabels = useMemo<BarLabel[]>(
    () =>
      weeks.map((b, i) => {
        const day = String(b.start.getDate());
        const changed = i === 0 || weeks[i - 1].start.getMonth() !== b.start.getMonth();
        return changed
          ? { line1: day, line2: b.start.toLocaleDateString(undefined, { month: 'short' }) }
          : day;
      }),
    [weeks],
  );
  const monthLabels = useMemo<BarLabel[]>(
    () => months.map((b) => b.start.toLocaleDateString(undefined, { month: 'short' })),
    [months],
  );

  // Screen-reader text for one bar: its period, then the shops per Store.
  const describeFor = (buckets: ShopBucket[], head: (bucket: ShopBucket) => string) => {
    return (bar: BarBucket) => {
      const bucket = buckets.find((b) => b.start.getTime() === bar.start.getTime());
      if (!bucket) {
        return '';
      }
      if (bucket.count === 0) {
        return `${head(bucket)}: no shops`;
      }
      const parts = Object.entries(bucket.byLocation)
        .sort(
          ([a, ac], [b, bc]) =>
            bc - ac || (nameById.get(a) ?? '').localeCompare(nameById.get(b) ?? ''),
        )
        .map(([id, count]) => `${count} at ${nameById.get(id) ?? 'a store'}`);
      return `${head(bucket)}: ${shopsText(bucket.count)}, ${parts.join(', ')}`;
    };
  };

  // Legend: Stores with a shop in the 6-month window, rank order, plus "Other stores" if a
  // tail Store appears.
  const legendIds = new Set<string>();
  for (const b of months) {
    for (const id of Object.keys(b.byLocation)) {
      legendIds.add(id);
    }
  }
  const legendRows = colors.ranked.filter((r) => r.named && legendIds.has(r.key));
  const legendHasOther = [...legendIds].some((id) => !rankById.get(id)?.named);

  // One tap, one navigation: set before closing the pop-up, cleared when a pop-up opens again.
  const navigatingRef = useRef(false);
  useEffect(() => {
    if (open !== null) {
      navigatingRef.current = false;
    }
  }, [open]);

  const showHistory = (params: HistoryParams) => {
    if (navigatingRef.current) {
      return;
    }
    navigatingRef.current = true;
    setOpen(null);
    onShowHistory(params);
  };

  // Every Store that is not one of the top 5, for the "Other stores" slice and legend row.
  const tailIds = (ids: Iterable<string>) => [...new Set(ids)].filter((id) => !rankById.get(id)?.named);
  const storesParam = (ids: string[]) => (ids.length > 0 ? { stores: ids.join(',') } : {});

  const columnPressFor = (unit: 'week' | 'month', buckets: ShopBucket[]) => ({
    onColumnPress: (bar: BarBucket) => showHistory({ period: unit, start: toDateParam(bar.start) }),
    onSegmentPress: (bar: BarBucket, segmentKey: string) => {
      const bucket = buckets.find((b) => b.start.getTime() === bar.start.getTime());
      const ids = segmentKey === OTHER_KEY ? tailIds(Object.keys(bucket?.byLocation ?? {})) : [segmentKey];
      showHistory({ period: unit, start: toDateParam(bar.start), ...storesParam(ids) });
    },
  });

  const select = (locationId: string) => {
    setOpen(null);
    onStorePress(locationId);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.tiles}>
        <GraphTile
          title="Where you shop"
          accessibilityLabel={whereLabel}
          onPress={() => setOpen('where')}
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
          accessibilityLabel={oftenLabel}
          onPress={() => setOpen('often')}
          chart={<ShopFrequencyBars buckets={weekBars} height={CHART_HEIGHT} />}
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

      <GraphPopup
        visible={open === 'where'}
        title="Where you shop"
        onClose={() => setOpen(null)}
        pinned={
          <View style={styles.popupRing}>
            <DonutRing segments={segments} size={POPUP_RING_SIZE} stroke={POPUP_RING_STROKE} />
          </View>
        }
      >
        {whereRows.map(({ segment, color }) => {
          const percent = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          const count = shopsText(segment.value);
          return (
            <Pressable
              key={segment.key}
              accessibilityRole="button"
              accessibilityLabel={`${segment.label}, ${count}, ${percent}%, start or continue a shop`}
              onPress={() => select(segment.key)}
              style={({ pressed }) => [styles.storeRow, pressed ? styles.storeRowPressed : null]}
            >
              <View style={[styles.swatch, { backgroundColor: color }]} />
              <Text style={styles.storeName}>{segment.label}</Text>
              <Text style={styles.storeCaption}>{`${count} · ${percent}%`}</Text>
            </Pressable>
          );
        })}
      </GraphPopup>

      <GraphPopup visible={open === 'often'} title="How often you shop" onClose={() => setOpen(null)}>
        <Text style={styles.caption}>{`Last ${WEEKS_SHOWN} weeks`}</Text>
        <ShopFrequencyBars
          buckets={weekBars}
          height={POPUP_BARS_HEIGHT}
          showCounts
          labels={weekLabels}
          describe={describeFor(weeks, describeWeek)}
          {...columnPressFor('week', weeks)}
        />
        <Text style={styles.caption}>{`Last ${MONTHS_SHOWN} months`}</Text>
        <ShopFrequencyBars
          buckets={monthBars}
          height={POPUP_BARS_HEIGHT}
          showCounts
          labels={monthLabels}
          describe={describeFor(months, describeMonth)}
          {...columnPressFor('month', months)}
        />
        <View style={styles.legend}>
          {legendRows.map((entry) => {
            const name = nameById.get(entry.key) ?? 'a store';
            return (
              <LegendRow
                key={entry.key}
                name={name}
                color={entry.color}
                onPress={() => showHistory({ stores: entry.key })}
              />
            );
          })}
          {legendHasOther ? (
            <LegendRow
              name="Other stores"
              color={colors.otherColor}
              onPress={() => showHistory(storesParam(tailIds(shopList.map((shop) => shop.locationId))))}
            />
          ) : null}
        </View>
      </GraphPopup>
    </View>
  );
}

function shopsText(count: number): string {
  return `${count} ${count === 1 ? 'shop' : 'shops'}`;
}

function describeWeek(bucket: ShopBucket): string {
  return `Week of ${bucket.start.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`;
}

function describeMonth(bucket: ShopBucket): string {
  return bucket.start.toLocaleDateString(undefined, { month: 'long' });
}

/** A legend entry, tappable (#216): that Store's shops over all time. 44pt tall. */
function LegendRow({
  name,
  color,
  onPress,
}: {
  name: string;
  color: string;
  onPress: () => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, shows these shops in History`}
      onPress={onPress}
      style={({ pressed }) => [styles.legendRow, pressed ? styles.storeRowPressed : null]}
    >
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.legendName}>{name}</Text>
    </Pressable>
  );
}

function GraphTile({
  title,
  accessibilityLabel,
  onPress,
  chart,
  figure,
}: {
  title: string;
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
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed ? styles.tilePressed : null]}
    >
      <View style={styles.titleRow}>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <View style={styles.chartArea}>{chart}</View>
      <View style={styles.figureRow}>{figure}</View>
    </Pressable>
  );
}

function createStyles(tokens: Tokens) {
  const TITLE_LINE_HEIGHT = Math.round(tokens.fontSize.caption * 1.3);
  return StyleSheet.create({
    // The pop-up's pinned slot fills the card (#229), so the ring centres itself.
    popupRing: {
      alignItems: 'center',
    },
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
      // Kept (transparent) so the tile's size is unchanged from when it had an open border.
      borderWidth: 2,
      borderColor: 'transparent',
      padding: tokens.space.md,
      gap: tokens.space.sm,
      ...tokens.elevation.card,
    },
    tilePressed: {
      opacity: 0.7,
    },
    titleRow: {
      // Two title lines tall, so a one-line title does not lift its chart above its neighbour's.
      minHeight: TITLE_LINE_HEIGHT * 2,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tokens.space.xs,
    },
    tileTitle: {
      flex: 1,
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      lineHeight: TITLE_LINE_HEIGHT,
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
    caption: {
      color: tokens.color.textSecondary,
      fontSize: tokens.fontSize.caption,
    },
    storeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.sm,
      paddingVertical: tokens.space.xs,
      borderRadius: tokens.radius.md,
    },
    storeRowPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    swatch: {
      width: 14,
      height: 14,
      borderRadius: tokens.radius.sm,
    },
    storeName: {
      flex: 1,
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.body,
    },
    storeCaption: {
      color: tokens.color.textSecondary,
      fontSize: tokens.fontSize.caption,
      fontVariant: ['tabular-nums'],
    },
    legend: {
      gap: tokens.space.xs,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.sm,
      borderRadius: tokens.radius.md,
    },
    legendName: {
      flex: 1,
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.caption,
    },
  });
}
