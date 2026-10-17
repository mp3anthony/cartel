import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
 * column is its own accessible element labelled with that text and its internals hidden, so
 * a column can later become a button (#216).
 */
export function ShopFrequencyBars({
  buckets,
  height,
  labels,
  showCounts = false,
  describe,
}: {
  buckets: BarBucket[];
  height: number;
  labels?: BarLabel[];
  showCounts?: boolean;
  describe?: (bucket: BarBucket) => string;
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
    <View {...(describe ? {} : hidden)} style={styles.row}>
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
                  {bucket.segments.map((segment, rank) => (
                    <View
                      key={segment.key}
                      style={{
                        flex: segment.count,
                        backgroundColor: segment.color,
                        // A 1px surface gap between segments, on the lower edge of all but the
                        // bottom one (column-reverse puts rank 0 at the bottom).
                        marginTop: rank < bucket.segments.length - 1 ? 1 : 0,
                      }}
                    />
                  ))}
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

        return describe ? (
          <View
            key={bucket.start.getTime()}
            accessible
            accessibilityLabel={describe(bucket)}
            style={styles.column}
          >
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              style={styles.columnInner}
            >
              {column}
            </View>
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
    column: {
      flex: 1,
      alignItems: 'stretch',
      gap: tokens.space.xs,
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
