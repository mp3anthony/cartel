import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ShopBucket } from '../lib/shopFrequency';
import { useMountProgress } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

const STUB = 2;

/**
 * Shop-count bars (#145), oldest on the left. Plain Views, no SVG: a bar is a rectangle.
 * Bars grow from the baseline on mount (once per mount, see `useMountProgress`). A bucket
 * with no shops is a 2pt stub in the border colour so the axis still reads. Decorative:
 * the tile or card holding it speaks the numbers, so it is hidden from assistive tech, the
 * same three props `ProgressRing` uses.
 */
export function ShopFrequencyBars({
  buckets,
  height,
  labels,
  showCounts = false,
}: {
  buckets: ShopBucket[];
  height: number;
  labels?: string[];
  showCounts?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const progress = useMountProgress();
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={styles.row}
    >
      {buckets.map((bucket, i) => (
        <View key={bucket.start.getTime()} style={styles.column}>
          {showCounts ? <Text style={styles.count}>{bucket.count}</Text> : null}
          <View style={{ height, justifyContent: 'flex-end' }}>
            <View
              style={
                bucket.count > 0
                  ? [styles.bar, { height: height * (bucket.count / max) * progress }]
                  : styles.stub
              }
            />
          </View>
          {labels ? <Text style={styles.label}>{labels[i]}</Text> : null}
        </View>
      ))}
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
    bar: {
      backgroundColor: tokens.color.accent,
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
