import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * Shown instead of the app when credentials are missing or malformed.
 *
 * This is what "fails loudly, not silently" means in practice: the build does not
 * limp on into a screen that cannot reach the backend, and it does not die into a
 * blank page either. It states the problem and the fix, on the device, in words.
 */
export function ConfigErrorScreen({
  problem,
  remedy,
}: {
  problem: string;
  remedy: string;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <SafeAreaView style={styles.ground}>
      <View style={styles.content}>
        <Text style={styles.heading}>Cartel can’t start</Text>
        <Text style={styles.problem}>{problem}</Text>
        <View style={styles.card}>
          <Text style={styles.remedy}>{remedy}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    ground: {
      flex: 1,
      backgroundColor: tokens.color.ground,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: tokens.space.lg,
      gap: tokens.space.md,
    },
    heading: {
      fontSize: tokens.fontSize.display,
      fontWeight: '700',
      color: tokens.color.negative,
    },
    problem: {
      fontSize: tokens.fontSize.title,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    card: {
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      padding: tokens.space.lg,
      ...tokens.elevation.card,
    },
    remedy: {
      fontSize: tokens.fontSize.body,
      lineHeight: tokens.fontSize.body * 1.5,
      color: tokens.color.textSecondary,
    },
  });
}
