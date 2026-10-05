import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { chainColor } from '../theme/chainColors';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * A small chain-colour swatch beside a Store's name (#107). Decorative only: the
 * name text next to it carries the meaning, so it is hidden from accessibility.
 * A null or unknown chain falls back to the neutral border colour.
 */
export function StoreBadge({ chain }: { chain: string | null | undefined }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.swatch,
        { backgroundColor: chainColor(chain) ?? tokens.color.border },
        // PAK'nSAVE's yellow has near-zero contrast against light-theme
        // surface/ground — the only swatch that needs an outline to stay
        // visible against a light background. Don't drop this "for
        // consistency"; every other brand colour has enough contrast on
        // its own.
        chain === 'paknsave' && styles.outlined,
      ]}
    />
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    swatch: {
      width: 14,
      height: 14,
      borderRadius: tokens.radius.sm,
    },
    outlined: {
      borderWidth: 1,
      borderColor: tokens.color.textPrimary,
    },
  });
}
