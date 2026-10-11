import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

const STROKE = 6;

/**
 * A small progress ring for a shop in progress (#144): `checked` of `total` ticked, the
 * count in the middle. Static on purpose; ring motion belongs to #145. Decorative: the
 * card that holds it speaks the same numbers in its Resume label, so it is hidden from
 * assistive tech, the same three props `StoreBadge` uses.
 */
export function ProgressRing({
  checked,
  total,
  size = 56,
}: {
  checked: number;
  total: number;
  size?: number;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const fraction = total > 0 ? Math.min(1, checked / total) : 0;
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        {/* Rotated so the arc starts at 12 o'clock, like DonutChart. */}
        <G rotation={-90} originX={center} originY={center}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={tokens.color.surfaceSunken}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={tokens.color.accent}
            strokeWidth={STROKE}
            strokeDasharray={`${circumference * fraction} ${circumference}`}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      </Svg>
      <View style={styles.centre}>
        <Text style={styles.count}>{`${checked}/${total}`}</Text>
      </View>
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    centre: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    count: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
  });
}
