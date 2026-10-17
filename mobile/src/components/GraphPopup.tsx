import { useMemo, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseIcon } from './HeaderIcons';
import { HeaderCircleButton } from './ui';
import { useReduceMotion } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { scrimColor, type Tokens } from '../theme/tokens';

/**
 * The pop-up card for Home's graph tiles (#215), also used by History's shop details (#229).
 * Lives beside them rather than in `ui.tsx`, so that file is not widened. A React Native `Modal`: on web, react-native-web gives it
 * `role="dialog"`, `aria-modal`, a focus trap, focus restore and Escape-to-close, so none of
 * that is hand-rolled here.
 *
 * Layout: a centred card (title, close circle, a `pinned` slot that never scrolls, then a
 * scrolling body, then an optional `footer` that never scrolls) over a scrim. `pinned` and
 * `footer` fill the card's width; a caller that wants its content centred (Home's donut)
 * centres it itself. The card comes first in the DOM so the close circle is the
 * first focusable element; the scrim is a sibling after it, hidden from assistive tech.
 * Dismiss: close circle, tap the scrim, Escape / system Back. The browser Back button does
 * not close it (no history entry is pushed).
 */
export function GraphPopup({
  visible,
  title,
  onClose,
  pinned,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Fixed above the scrolling body (the donut ring, a shop's subtitle). */
  pinned?: ReactNode;
  /** Fixed below the scrolling body (a shop's actions). Keep it short: it never scrolls. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent
      visible={visible}
      onRequestClose={onClose}
      animationType={reduceMotion ? 'none' : 'fade'}
      aria-label={title}
    >
      <View
        style={[
          styles.screen,
          {
            paddingTop: tokens.space.lg + insets.top,
            paddingBottom: tokens.space.lg + insets.bottom,
          },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <HeaderCircleButton
              icon={(color) => <CloseIcon color={color} />}
              accessibilityLabel="Close"
              onPress={onClose}
            />
          </View>
          {pinned ? <View>{pinned}</View> : null}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>

        {/* After the card in the DOM so focus starts on the close circle; painted under it
            by the card's zIndex. */}
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          aria-hidden
          focusable={false}
          onPress={onClose}
          style={styles.scrim}
        />
      </View>
    </Modal>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: tokens.space.lg,
    },
    card: {
      zIndex: 1,
      width: '100%',
      maxWidth: 480,
      maxHeight: '85%',
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      padding: tokens.space.md,
      gap: tokens.space.sm,
      ...tokens.elevation.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.space.sm,
    },
    title: {
      flex: 1,
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.body,
      fontWeight: '700',
    },
    footer: {
      gap: tokens.space.sm,
    },
    body: {
      flexGrow: 0,
      flexShrink: 1,
      // Keeps a scroll at the end of the body from chaining to the page behind.
      ...(Platform.OS === 'web' ? ({ overscrollBehavior: 'contain' } as object) : {}),
    },
    bodyContent: {
      gap: tokens.space.sm,
    },
    scrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: scrimColor,
    },
  });
}
