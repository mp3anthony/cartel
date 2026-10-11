import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useMountProgress } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

const STROKE = 6;

/**
 * A small progress ring for a shop in progress (#144): `checked` of `total` ticked, the
 * count in the middle. On mount the arc fills and the count rises over the shared on-mount
 * motion (#145, once per mount, nothing under Reduce Motion). Decorative: the
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
  const progress = useMountProgress();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const fraction = total > 0 ? Math.min(1, checked / total) : 0;
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const dash = circumference * fraction * progress;

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
          {dash > 0 ? (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={tokens.color.accent}
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              fill="none"
            />
          ) : null}
        </G>
      </Svg>
      <View style={styles.centre}>
        <Text style={styles.count}>{`${Math.round(checked * progress)}/${total}`}</Text>
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
