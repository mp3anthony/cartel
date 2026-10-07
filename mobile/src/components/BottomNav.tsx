import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackActions, type NavigationProp } from '@react-navigation/native';

import { SettingsIcon } from './HeaderIcons';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import { pressScale, slideTransform, useReduceMotion } from '../theme/motion';
import type { Tokens } from '../theme/tokens';

type Navigation = NavigationProp<RootStackParamList>;
type Destination = 'Dashboard' | 'Lists' | 'Locations' | 'History' | 'Settings';

/** Pill order; the ring's slot index is the position here. Settings is the icon-only gear. */
const ITEMS: { label: string; destination: Destination; icon?: boolean }[] = [
  { label: 'Home', destination: 'Dashboard' },
  { label: 'Lists', destination: 'Lists' },
  { label: 'Stores', destination: 'Locations' },
  { label: 'History', destination: 'History' },
  { label: 'Settings', destination: 'Settings', icon: true },
];

/**
 * Which pill item a route belongs to (#158), or null when it belongs to none (Feedback:
 * the pill shows but nothing is ringed). `Shopping` is handled by the caller: it gets no
 * pill at all.
 */
export function navSection(routeName: keyof RootStackParamList): Destination | null {
  switch (routeName) {
    case 'Dashboard':
      return 'Dashboard';
    case 'Lists':
    case 'ListDetail':
      return 'Lists';
    case 'Locations':
    case 'LocationCatalog':
    case 'StoreMissing':
      return 'Locations';
    case 'History':
      return 'History';
    case 'Household':
    case 'HouseholdSetup':
      return 'Settings';
    default:
      return null;
  }
}

/**
 * The floating bottom pill (#158): Home, Lists, Stores, History and the Settings gear
 * (icon-only, the fifth link), in equal-width slots. The current section is ringed,
 * Settings included while Household or HouseholdSetup is open. Rendered once through the
 * navigator `layout` in `App.tsx`, in flow under the screens, so nothing is ever hidden
 * behind it. Hidden entirely on Shopping Mode; faded out (kept in layout, so nothing
 * jumps) while the keyboard is up.
 */
export function BottomNav({
  state,
  navigation,
}: {
  state: { routes: { name: string }[]; index: number; routeNames: string[] };
  navigation: { dispatch: (action: ReturnType<typeof StackActions.popTo>) => void };
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const keyboardVisible = useKeyboardVisible();
  const [rowWidth, setRowWidth] = useState(0);

  const routeName = state.routes[state.index]?.name as keyof RootStackParamList | undefined;
  if (!routeName || routeName === 'Shopping') {
    return null;
  }

  const hasHousehold = state.routeNames.includes('Household');
  const section = navSection(routeName);
  const currentIndex = ITEMS.findIndex((link) => link.destination === section);
  const linkWidth = rowWidth / ITEMS.length;

  function onLayout(event: LayoutChangeEvent) {
    setRowWidth(event.nativeEvent.layout.width);
  }

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: insets.bottom > 0 ? insets.bottom : tokens.space.md },
        keyboardVisible && styles.hidden,
      ]}
      pointerEvents={keyboardVisible ? 'none' : 'box-none'}
      aria-hidden={keyboardVisible}
    >
      <View style={styles.pill} role="navigation" aria-label="Main">
        <View style={styles.row} onLayout={onLayout}>
          {rowWidth > 0 && currentIndex >= 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.ring,
                { width: linkWidth, transform: [{ translateX: currentIndex * linkWidth }] },
                slideTransform(reduceMotion),
              ]}
            />
          ) : null}
          {ITEMS.map((link) => {
            const current = link.destination === section;
            return (
              <Pressable
                key={link.destination}
                accessibilityRole="link"
                accessibilityLabel={link.label}
                aria-current={current ? 'page' : undefined}
                onPress={() =>
                  navigation.dispatch(
                    StackActions.popTo(
                      link.destination === 'Settings'
                        ? hasHousehold
                          ? 'Household'
                          : 'HouseholdSetup'
                        : link.destination,
                    ),
                  )
                }
                style={({ pressed }) => [styles.link, pressScale(pressed, reduceMotion)]}
              >
                {link.icon ? (
                  <SettingsIcon
                    color={current ? tokens.color.textPrimary : tokens.color.textSecondary}
                  />
                ) : (
                  <Text
                    numberOfLines={1}
                    style={[styles.label, current ? styles.labelCurrent : styles.labelOther]}
                  >
                    {link.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    wrapper: {
      alignItems: 'center',
      paddingHorizontal: tokens.space.md,
      paddingTop: tokens.space.sm,
      backgroundColor: tokens.color.ground,
    },
    hidden: {
      opacity: 0,
    },
    pill: {
      width: '100%',
      maxWidth: 480,
      backgroundColor: tokens.color.surface,
      borderWidth: 1,
      borderColor: tokens.color.border,
      borderRadius: tokens.radius.pill,
      padding: tokens.space.xs,
      ...tokens.elevation.card,
    },
    row: {
      flex: 1,
      flexDirection: 'row',
    },
    ring: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      borderWidth: 2,
      borderColor: tokens.color.accent,
      borderRadius: tokens.radius.pill,
    },
    link: {
      flex: 1,
      minHeight: tokens.minTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.space.xs,
    },
    label: {
      fontSize: tokens.fontSize.body,
    },
    labelCurrent: {
      color: tokens.color.textPrimary,
      fontWeight: '600',
    },
    labelOther: {
      color: tokens.color.textSecondary,
    },
  });
}
