import { Image, StyleSheet } from 'react-native';

import { useThemeMode } from '../theme/ThemeProvider';

const LOGO_LIGHT = require('../../assets/splash-icon.png');
const LOGO_DARK = require('../../assets/splash-icon-dark.png');

// Both files share one source size (1284x375) — the "Cartel" wordmark
// lockup #25 built for the splash screen, in the app's burnt-orange (light)
// and gold (dark) accents. Reused here rather than a third asset pair.
const SOURCE_ASPECT_RATIO = 1284 / 375;
const HEIGHT = 32;

/**
 * The header's title area everywhere in the app (wired once, in App.tsx's
 * shared `headerOptions`, not per-screen) — replaces the plain text screen
 * name with the wordmark, swapped light/orange vs dark/gold by the *in-app*
 * resolved theme (`useThemeMode()`), not the raw OS scheme, so an explicit
 * Light/Dark override is honoured here too, not just System.
 *
 * Each screen's own name (a list's title, "Locations", etc.) still sets the
 * browser tab title via that screen's `options.title` — `ListDetailScreen`
 * and `ShoppingScreen` both call `navigation.setOptions({ title: ... })`,
 * never `headerTitle`, so neither clobbers this. `headerTitle` only replaces
 * what's drawn *in* the header; it doesn't touch `document.title` or the
 * linking config.
 */
export function HeaderLogo() {
  const { resolvedScheme } = useThemeMode();

  return (
    <Image
      accessibilityRole="image"
      accessibilityLabel="Cartel"
      source={resolvedScheme === 'dark' ? LOGO_DARK : LOGO_LIGHT}
      style={styles.logo}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    height: HEIGHT,
    width: HEIGHT * SOURCE_ASPECT_RATIO,
  },
});
