import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * The shared surface every screen sits on. Centralising it is what keeps the ground
 * colour, the gutter and the safe-area handling from drifting screen by screen.
 */
export function Screen({ children }: { children: ReactNode }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <SafeAreaView style={styles.ground}>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  return <Text style={styles.body}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  return <View style={styles.card}>{children}</View>;
}

/**
 * There is one accent in this app, so there is one primary button. A screen with two
 * of them has no primary action, which is a design problem rather than a styling one.
 */
export function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const inactive = busy || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.primaryButtonPressed,
        inactive && styles.buttonInactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tokens.color.accentContrast} />
      ) : (
        <Text style={styles.primaryButtonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.secondaryButtonPressed,
        disabled && styles.buttonInactive,
      ]}
    >
      <Text style={styles.secondaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  ...inputProps
}: { label: string } & TextInputProps) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={tokens.color.textSecondary}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

/**
 * Errors are never colour alone — the design reference forbids it, and a red string
 * with no words is not an explanation anyway.
 */
export function ErrorNote({ message }: { message: string }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View accessibilityRole="alert" style={styles.errorRow}>
      <Text style={styles.errorMark}>!</Text>
      <Text style={styles.errorText}>{message}</Text>
    </View>
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
      maxWidth: 480,
      width: '100%',
      alignSelf: 'center',
    },
    heading: {
      fontSize: tokens.fontSize.display,
      fontWeight: '700',
      color: tokens.color.textPrimary,
    },
    body: {
      fontSize: tokens.fontSize.body,
      lineHeight: tokens.fontSize.body * 1.5,
      color: tokens.color.textSecondary,
    },
    card: {
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      padding: tokens.space.lg,
      gap: tokens.space.sm,
      ...tokens.elevation.card,
    },
    primaryButton: {
      backgroundColor: tokens.color.accent,
      borderRadius: tokens.radius.md,
      minHeight: tokens.minTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.space.lg,
    },
    primaryButtonPressed: {
      backgroundColor: tokens.color.accentPressed,
    },
    primaryButtonLabel: {
      color: tokens.color.accentContrast,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
    },
    secondaryButton: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.color.border,
      backgroundColor: tokens.color.surface,
      minHeight: tokens.minTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.space.lg,
    },
    secondaryButtonPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    secondaryButtonLabel: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
    },
    buttonInactive: {
      opacity: 0.5,
    },
    field: {
      gap: tokens.space.xs,
    },
    fieldLabel: {
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
      fontWeight: '600',
    },
    input: {
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.color.border,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.md,
      fontSize: tokens.fontSize.body,
      color: tokens.color.textPrimary,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tokens.space.sm,
    },
    errorMark: {
      color: tokens.color.negative,
      fontSize: tokens.fontSize.body,
      fontWeight: '700',
    },
    errorText: {
      flex: 1,
      color: tokens.color.negative,
      fontSize: tokens.fontSize.caption,
      lineHeight: tokens.fontSize.caption * 1.5,
    },
  });
}
