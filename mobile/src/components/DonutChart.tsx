import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { Row } from './ui';
import { useMountProgress } from '../theme/motion';
import { chainColor, type Chain } from '../theme/chainColors';
import { assignStoreColors } from '../lib/storeColors';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  chain: Chain | null;
};

/**
 * The Dashboard's (#22) store-frequency chart — a ring divided into arcs by
 * share of `value`, plus a legend of tappable rows below it.
 *
 * Colour is the one real constraint here. `tokens.ts` locks the app to a
 * single accent on purpose ("anything that wants to stand out competes for
 * the same slot rather than adding a colour") — a conventional multi-hue pie
 * chart would break that outright. So every segment is the same accent hue
 * at a different strength: `mixWithSurface()` blends `tokens.color.accent`
 * toward `tokens.color.surface` in fixed steps rather than introducing new
 * named colours, which keeps this a chart about *one* accent's saturation,
 * not a second palette living only inside this component. Segments beyond
 * the top `MAX_SEGMENTS` collapse into a neutral "Other" wedge in
 * `tokens.color.border` — both so the ring stays legible for a household
 * with a long tail of one-off stores, and so the tint ramp never has to
 * invent a 9th or 10th step.
 *
 * #51 adds one deliberate, documented exception to the single-hue rule
 * above: a segment whose location has a real, recognised chain (see
 * `chainColors.ts`) renders in that chain's actual brand colour instead of a
 * tint-mixed accent step. This makes the ring distinguish stores by identity,
 * not just by rank — the tint ramp alone can't tell New World from
 * PAK'nSAVE at a glance. A segment with no recognised chain (`null`, when the
 * store is not loaded) still falls through to the original tint-mixed look, unchanged.
 *
 * The arcs themselves are not individually tappable — hit-testing a thin SVG
 * stroke segment is fiddly and RN-SVG gives no built-in help for it. The
 * legend row is the tap target instead; the ring communicates proportion,
 * the legend identifies and navigates. `onSegmentPress` is optional so a
 * caller can render a read-only chart (e.g. a future summary elsewhere)
 * without wiring navigation.
 *
 * Colour assignment lives in `lib/storeColors.ts` (#215) so the Home pop-ups share it.
 *
 * #145 split the ring out as `DonutRing` so the Home tile can show it small without the
 * legend, and gave it the on-mount sweep.
 */
const MAX_SEGMENTS = 5;
const SIZE = 160;
const STROKE = 22;

export function DonutChart({
  segments,
  onSegmentPress,
}: {
  segments: DonutSegment[];
  onSegmentPress?: (key: string) => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const { arcs, total } = useMemo(() => buildArcs(segments, tokens), [segments, tokens]);

  if (total === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <DonutRing segments={segments} size={SIZE} stroke={STROKE} />

      <View style={styles.legend}>
        {arcs.map((arc) => (
          <Row
            key={arc.key}
            label={`${arc.label} · ${Math.round(arc.fraction * 100)}%`}
            leading={<View style={[styles.swatch, { backgroundColor: arc.color }]} />}
            onPress={onSegmentPress && arc.onPressKey ? () => onSegmentPress(arc.onPressKey!) : undefined}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Just the ring, no legend (#145: the Home tile uses it small, `DonutChart` uses it at 160).
 * Same arcs and colours as the full chart. The arcs sweep round from 12 o'clock on mount, once
 * per mount (`useMountProgress`). Decorative: whoever renders it speaks the numbers, so it is
 * hidden from assistive tech, the same three props `ProgressRing` uses.
 */
export function DonutRing({
  segments,
  size,
  stroke,
}: {
  segments: DonutSegment[];
  size: number;
  stroke: number;
}) {
  const tokens = useTheme();
  const progress = useMountProgress();
  const { arcs, total } = useMemo(() => buildArcs(segments, tokens), [segments, tokens]);

  if (total === 0) {
    return null;
  }

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let start = 0;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        {/* Rotated so the first arc starts at 12 o'clock instead of 3 o'clock. */}
        <G rotation={-90} originX={center} originY={center}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={tokens.color.surfaceSunken}
            strokeWidth={stroke}
            fill="none"
          />
          {arcs.map((arc) => {
            const arcStart = start;
            start += arc.fraction;
            const shown = Math.min(Math.max(progress - arcStart, 0), arc.fraction);
            const dash = circumference * shown;
            if (dash <= 0) {
              return null;
            }
            return (
              <Circle
                key={arc.key}
                cx={center}
                cy={center}
                r={radius}
                stroke={arc.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-arcStart * circumference}
                strokeLinecap="butt"
                fill="none"
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

type Arc = {
  key: string;
  label: string;
  fraction: number;
  color: string;
  /** Absent for the "Other" bucket — it names no single location to navigate to. */
  onPressKey?: string;
};

/**
 * The one colour map for a set of Store segments (#215): the donut ring, the pop-up rows, the
 * stacked bars and the legend all read this, so a Store is the same colour everywhere.
 * `ranked` is sorted most shops first; `otherColor` is the shared tail colour.
 */
export function storeColorMap(segments: DonutSegment[], tokens: Tokens) {
  return assignStoreColors(
    segments.map((s) => ({ key: s.key, value: s.value, chainHex: chainColor(s.chain) })),
    tokens.color,
    MAX_SEGMENTS,
  );
}

function buildArcs(
  segments: DonutSegment[],
  tokens: Tokens,
): { arcs: Arc[]; total: number } {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return { arcs: [], total: 0 };
  }

  const { ranked, otherColor } = storeColorMap(segments, tokens);
  const byKey = new Map(segments.map((s) => [s.key, s]));

  const arcs: Arc[] = [];
  let restTotal = 0;
  for (const entry of ranked) {
    const segment = byKey.get(entry.key)!;
    if (entry.named) {
      arcs.push({
        key: segment.key,
        label: segment.label,
        fraction: segment.value / total,
        color: entry.color,
        onPressKey: segment.key,
      });
    } else {
      restTotal += segment.value;
    }
  }

  if (restTotal > 0 || ranked.some((r) => !r.named)) {
    arcs.push({
      key: '__other__',
      label: 'Other stores',
      fraction: restTotal / total,
      color: otherColor,
    });
  }

  return { arcs, total };
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      gap: tokens.space.md,
    },
    legend: {
      width: '100%',
      gap: tokens.space.xs,
    },
    swatch: {
      width: 14,
      height: 14,
      borderRadius: tokens.radius.sm,
    },
  });
}
