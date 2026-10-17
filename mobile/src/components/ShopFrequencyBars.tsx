import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMountProgress } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

const STUB = 2;

export type BarBucket = {
  start: Date;
  count: number;
  /** Rank order, rank 0 first; drawn bottom to top. */
  segments: { key: string; color: string; count: number }[];
};

export type BarLabel = string | { line1: string; line2?: string };

/**
 * Stacked shop-count bars (#145, stacked by Store in #215), oldest on the left. Plain Views,
 * no SVG: a bar is a rectangle. Each bar is a column of Store-coloured segments, the
 * most-shopped Store at the bottom, a 1px surface gap between them. Bars grow from the
 * baseline on mount (once per mount, see `useMountProgress`). A bucket with no shops is a 2pt
 * stub in the border colour so the axis still reads.
 *
 * Accessibility: without `describe` (the Home tile) the whole chart is decorative and hidden
 * from assistive tech, as the tile speaks the numbers. With `describe` (the pop-up) each
 * column is its own accessible element labelled with that text and its internals hidden.
 * With `onColumnPress` (#216) a column that has shops is a button ("..., shows these shops in
 * History"); an empty column stays plain. `onSegmentPress` makes each Store segment a
 * pointer-only shortcut to that Store's shops: it is hidden from assistive tech (the Store
 * route there is the legend), and the whole column stays the tap area. Neither does
 * anything without `describe`, so the Home tile stays decorative. Columns touch (the gap is
 * padding inside each) so no tap lands between two.
 */
export function ShopFrequencyBars({
  buckets,
  height,
  labels,
  showCounts = false,
  describe,
  onColumnPress,
  onSegmentPress,
}: {
  buckets: BarBucket[];
  height: number;
  labels?: BarLabel[];
  showCounts?: boolean;
  describe?: (bucket: BarBucket) => string;
  onColumnPress?: (bucket: BarBucket) => void;
  onSegmentPress?: (bucket: BarBucket, segmentKey: string) => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const progress = useMountProgress();
  const max = Math.max(1, ...buckets.map((b) => b.count));

  const hasSecondLine = !!labels?.some((l) => typeof l !== 'string' && l.line2 !== undefined);

  const hidden = {
    accessible: false,
    importantForAccessibility: 'no-hide-descendants' as const,
    accessibilityElementsHidden: true,
  };

  return (
    <View {...(describe ? {} : hidden)} style={describe && onColumnPress ? styles.rowTouching : styles.row}>
      {buckets.map((bucket, i) => {
        const label = labels?.[i];
        const column = (
          <>
            {showCounts ? <Text style={styles.count}>{bucket.count}</Text> : null}
            <View style={{ height, justifyContent: 'flex-end' }}>
              {bucket.count > 0 ? (
                <View
                  style={[
                    styles.bar,
                    { height: height * (bucket.count / max) * progress },
                  ]}
                >
                  {bucket.segments.map((segment, rank) => {
                    const segmentStyle = {
                      flex: segment.count,
                      backgroundColor: segment.color,
                      // A 1px surface gap between segments, on the lower edge of all but the
                      // bottom one (column-reverse puts rank 0 at the bottom).
                      marginTop: rank < bucket.segments.length - 1 ? 1 : 0,
                    };
                    return describe && onColumnPress && onSegmentPress ? (
                      <Pressable
                        key={segment.key}
                        accessible={false}
                        onPress={() => onSegmentPress(bucket, segment.key)}
                        style={({ pressed }) => [segmentStyle, pressed && styles.segmentPressed]}
                      />
                    ) : (
                      <View key={segment.key} style={segmentStyle} />
                    );
                  })}
                </View>
              ) : (
                <View style={styles.stub} />
              )}
            </View>
            {label === undefined ? null : (
              <View>
                <Text style={styles.label}>{typeof label === 'string' ? label : label.line1}</Text>
                {/* When any column has two lines, every column reserves the second one (a
                    non-breaking space) so all bars share one baseline. */}
                {hasSecondLine ? (
                  <Text style={styles.label}>
                    {typeof label !== 'string' && label.line2 !== undefined ? label.line2 : ' '}
                  </Text>
                ) : null}
              </View>
            )}
          </>
        );

        const hiddenInner = (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={styles.columnInner}
          >
            {column}
          </View>
        );

        if (describe && onColumnPress && bucket.count > 0) {
          return (
            <Pressable
              key={bucket.start.getTime()}
              accessibilityRole="button"
              accessibilityLabel={`${describe(bucket)}, shows these shops in History`}
              onPress={() => onColumnPress(bucket)}
              style={({ pressed }) => [
                styles.column,
                styles.columnTouching,
                pressed && styles.columnPressed,
              ]}
            >
              {hiddenInner}
            </Pressable>
          );
        }

        return describe ? (
          <View
            key={bucket.start.getTime()}
            accessible
            accessibilityLabel={describe(bucket)}
            style={[styles.column, onColumnPress ? styles.columnTouching : null]}
          >
            {hiddenInner}
          </View>
        ) : (
          <View key={bucket.start.getTime()} style={styles.column}>
            {column}
          </View>
        );
      })}
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    row: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: tokens.space.xs,
    },
    // Pop-up rows with pressable columns: no gap between columns (the gap is each column's
    // own padding), so every point of the row belongs to some column.
    rowTouching: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 0,
    },
    column: {
      flex: 1,
      alignItems: 'stretch',
      gap: tokens.space.xs,
    },
    columnTouching: {
      paddingHorizontal: tokens.space.xs / 2,
      borderRadius: tokens.radius.sm,
    },
    columnPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    segmentPressed: {
      opacity: 0.7,
    },
    columnInner: {
      alignItems: 'stretch',
      gap: tokens.space.xs,
    },
    bar: {
      // Segments stack bottom-up (rank 0 at the bottom); the surface shows through the 1px
      // margins as the gap. Rounded top corners clip the top segment.
      flexDirection: 'column-reverse',
      overflow: 'hidden',
      backgroundColor: tokens.color.surface,
      borderTopLeftRadius: tokens.radius.sm,
      borderTopRightRadius: tokens.radius.sm,
    },
    stub: {
      height: STUB,
      backgroundColor: tokens.color.border,
    },
    count: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    label: {
      color: tokens.color.textSecondary,
      fontSize: tokens.fontSize.caption,
      textAlign: 'center',
    },
  });
}
