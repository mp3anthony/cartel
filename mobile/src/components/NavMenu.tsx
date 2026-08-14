import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NavigationProp } from '@react-navigation/native';

import { IconButton, Row } from './ui';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Navigation = NavigationProp<RootStackParamList>;

/**
 * The global nav menu (#24) — a hamburger icon rendered in every screen's
 * header (wired once, in App.tsx's `screenOptions`, not per-screen) that
 * opens a popover of every top-level destination. Replaces `ListsScreen`'s
 * old 3-button header row outright; that row is deleted, not left alongside
 * this.
 *
 * A `Modal` rather than an absolutely-positioned `View` layered inside the
 * screen: the header is a native-stack header, a separate layer from the
 * screen content it sits above, so a popover positioned relative to the
 * screen's own tree can't reliably draw over it. `Modal` renders as its own
 * top-level layer on every platform this app ships to, including
 * react-native-web, which is the same reason `Confirm` (`ui.tsx`) uses an
 * in-place card instead of `Alert.alert` — that one is a *missing* API on
 * web, this is a *working* one being used for what it's for.
 *
 * The popover's position is an estimate, not a measurement: right-aligned,
 * offset down by the safe-area top inset plus a fixed header-height
 * constant, rather than `measureInWindow`-ing the hamburger button itself.
 * Native-stack's real header height varies a few points by platform and
 * whether the title truncates, and this menu has no acceptance-test
 * requirement for pixel-perfect anchoring — "opens a popover anchored under
 * the icon" is satisfied by a popover that visibly hangs from the header's
 * icon corner, not by exact alignment.
 */
const HEADER_HEIGHT_ESTIMATE = 56;

export function NavMenu({
  navigation,
  hasHousehold,
}: {
  navigation: Navigation;
  hasHousehold: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  function go(destination: () => void) {
    setOpen(false);
    destination();
  }

  const items: { label: string; onPress: () => void }[] = [
    { label: 'Home', onPress: () => go(() => navigation.navigate('Dashboard')) },
    { label: 'Lists', onPress: () => go(() => navigation.navigate('Lists')) },
    { label: 'Locations', onPress: () => go(() => navigation.navigate('Locations')) },
    { label: 'History', onPress: () => go(() => navigation.navigate('History')) },
    {
      label: hasHousehold ? 'Household' : 'Join or create a household',
      onPress: () =>
        go(() => navigation.navigate(hasHousehold ? 'Household' : 'HouseholdSetup')),
    },
  ];

  return (
    <>
      <IconButton
        glyph="☰"
        accessibilityLabel="Menu"
        onPress={() => setOpen(true)}
      />

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* The tap target that satisfies "dismisses ... on tapping outside it" —
            it covers the whole screen behind the popover card. */}
        <Pressable style={styles.scrim} accessibilityLabel="Close menu" onPress={() => setOpen(false)}>
          <View
            style={[styles.popover, { top: insets.top + HEADER_HEIGHT_ESTIMATE }]}
            // Swallows the tap so it doesn't fall through to the scrim behind it.
            onStartShouldSetResponder={() => true}
          >
            {items.map((item) => (
              <Row key={item.label} label={item.label} onPress={item.onPress} />
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(43, 35, 32, 0.32)',
    },
    popover: {
      position: 'absolute',
      right: tokens.space.md,
      minWidth: 220,
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      padding: tokens.space.sm,
      gap: tokens.space.xs,
      ...tokens.elevation.card,
    },
  });
}
