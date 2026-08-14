import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { Row } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

export type DonutSegment = {
  key: string;
  label: string;
  value: number;
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
 * The arcs themselves are not individually tappable — hit-testing a thin SVG
 * stroke segment is fiddly and RN-SVG gives no built-in help for it. The
 * legend row is the tap target instead; the ring communicates proportion,
 * the legend identifies and navigates. `onSegmentPress` is optional so a
 * caller can render a read-only chart (e.g. a future summary elsewhere)
 * without wiring navigation.
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

  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = SIZE / 2;

  let offset = 0;

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE} style={styles.svg}>
        {/* Rotated so the first arc starts at 12 o'clock instead of 3 o'clock. */}
        <G rotation={-90} originX={center} originY={center}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={tokens.color.surfaceSunken}
            strokeWidth={STROKE}
            fill="none"
          />
          {arcs.map((arc) => {
            const dash = circumference * arc.fraction;
            const dashoffset = -offset * circumference;
            offset += arc.fraction;
            return (
              <Circle
                key={arc.key}
                cx={center}
                cy={center}
                r={radius}
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={dashoffset}
                strokeLinecap="butt"
                fill="none"
              />
            );
          })}
        </G>
      </Svg>

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

type Arc = {
  key: string;
  label: string;
  fraction: number;
  color: string;
  /** Absent for the "Other" bucket — it names no single location to navigate to. */
  onPressKey?: string;
};

function buildArcs(
  segments: DonutSegment[],
  tokens: Tokens,
): { arcs: Arc[]; total: number } {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return { arcs: [], total: 0 };
  }

  const sorted = [...segments].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, MAX_SEGMENTS);
  const rest = sorted.slice(MAX_SEGMENTS);

  const arcs: Arc[] = top.map((segment, i) => ({
    key: segment.key,
    label: segment.label,
    fraction: segment.value / total,
    color: mixWithSurface(tokens.color.accent, tokens.color.surface, i / MAX_SEGMENTS),
    onPressKey: segment.key,
  }));

  if (rest.length > 0) {
    const restTotal = rest.reduce((sum, s) => sum + s.value, 0);
    arcs.push({
      key: '__other__',
      label: 'Other stores',
      fraction: restTotal / total,
      color: tokens.color.border,
    });
  }

  return { arcs, total };
}

/** Blends `from` toward `to` by `ratio` (0 = `from`, 1 = `to`). Both colours
 * must be 6-digit `#rrggbb` hex — the only shape this app's tokens use. */
function mixWithSurface(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * ratio);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(a.r, b.r))}${toHex(mix(a.g, b.g))}${toHex(mix(a.b, b.b))}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      gap: tokens.space.md,
    },
    svg: {
      // The chart is drawn in SVG's own coordinate space, unrelated to RTL —
      // nothing here needs a mirrored transform.
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
