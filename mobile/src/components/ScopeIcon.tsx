import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * A list's scope as a glyph instead of a "Shared" / "Personal" word (#89): a house
 * outline for a list shared with the household, a person outline for a personal one,
 * in a small `surfaceSunken` circle. It replaces `Badge` on the list surfaces; `Badge`
 * itself stays for the Locations screen.
 *
 * Drawn with `react-native-svg` paths (the same dependency `DonutChart` uses), not an
 * icon font: no new dependency and nothing to load, so the glyph is there on first
 * paint in both themes. Stroke colour is `textSecondary`, which is measured against
 * both palettes' surfaces, and the glyph is never the only carrier of meaning: the
 * wrapper View is the one accessible element and speaks the scope, and the `Svg` is
 * hidden from assistive tech so VoiceOver does not announce it twice.
 *
 * Not pressable: it is a status marker, not a control.
 */
export function ScopeIcon({
  shared,
  householdName,
}: {
  shared: boolean;
  householdName: string | null;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const label = shared ? `Shared with ${householdName ?? 'your household'}` : 'Personal';

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.circle}>
      <Svg
        width={GLYPH_SIZE}
        height={GLYPH_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {shared ? (
          <>
            <Path
              d="M3 11.5L12 4l9 7.5"
              stroke={tokens.color.textSecondary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d="M5.5 10v10h13V10"
              stroke={tokens.color.textSecondary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        ) : (
          <>
            <Circle
              cx={12}
              cy={8}
              r={4}
              stroke={tokens.color.textSecondary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <Path
              d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"
              stroke={tokens.color.textSecondary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        )}
      </Svg>
    </View>
  );
}

/**
 * The expand / collapse chevron for History cards: a down chevron (`M6 9l6 6 6-6`)
 * rotated 180 degrees when expanded. Decorative; the control that holds it carries the
 * `expanded` state, so the `Svg` is hidden from assistive tech.
 */
export function ChevronIcon({ expanded }: { expanded: boolean }) {
  const tokens = useTheme();

  return (
    <View style={expanded ? CHEVRON_EXPANDED : undefined}>
      <Svg
        width={GLYPH_SIZE}
        height={GLYPH_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Path
          d="M6 9l6 6 6-6"
          stroke={tokens.color.textSecondary}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

const GLYPH_SIZE = 16;
const CIRCLE_SIZE = 28;

const CHEVRON_EXPANDED = { transform: [{ rotate: '180deg' }] };

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    circle: {
      width: CIRCLE_SIZE,
      height: CIRCLE_SIZE,
      borderRadius: CIRCLE_SIZE / 2,
      backgroundColor: tokens.color.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
