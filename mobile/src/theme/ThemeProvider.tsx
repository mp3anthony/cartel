import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { darkTokens, lightTokens, type Tokens } from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

type ThemeModeValue = {
  mode: ThemeMode;
  resolvedScheme: ResolvedScheme;
  setMode: (mode: ThemeMode) => void;
};

/** Namespaced so it can't collide with a library-owned key — the only other
 * AsyncStorage entry in this app is Supabase's own default-named session key
 * (`sb-<ref>-auth-token`), and nothing here is meant to look like it owns
 * that pattern; this key is just prefixed with the app name instead. */
const THEME_MODE_STORAGE_KEY = 'cartel.themeMode';

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

const ThemeContext = createContext<Tokens | undefined>(undefined);
const ThemeModeContext = createContext<ThemeModeValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const osScheme = useColorScheme(); // 'light' | 'dark' | null, live on every platform incl. web
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Persisted preference loads asynchronously; 'system' is the state until it
  // resolves. This means a user who has explicitly overridden to Light or
  // Dark, and whose choice disagrees with their OS scheme, may see one frame
  // of the system-resolved theme before the persisted override applies. This
  // is accepted, not eliminated: the alternative is blocking first paint on
  // an AsyncStorage read, which is worse for the common case (nobody has
  // overridden yet, so 'system' is already correct) to fix a corner case
  // that is at most a single frame on web (AsyncStorage backs onto
  // localStorage) and a few ms on native.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_MODE_STORAGE_KEY).then((stored) => {
      if (!cancelled && isThemeMode(stored)) {
        setModeState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    // Best-effort: an unpersisted choice still applies for this session; it
    // just won't survive a restart. Not surfaced to the user, same "don't
    // block the UI on storage" call src/lib/supabase.ts already makes.
    AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, next).catch(() => {});
  }, []);

  const resolvedScheme: ResolvedScheme =
    mode === 'system' ? (osScheme === 'dark' ? 'dark' : 'light') : mode;
  const tokens = resolvedScheme === 'dark' ? darkTokens : lightTokens;

  const modeValue = useMemo<ThemeModeValue>(
    () => ({ mode, resolvedScheme, setMode }),
    [mode, resolvedScheme, setMode],
  );

  return (
    <ThemeContext.Provider value={tokens}>
      <ThemeModeContext.Provider value={modeValue}>
        {children}
      </ThemeModeContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): Tokens {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme was called outside of a <ThemeProvider>.');
  }
  return value;
}

/** For the mode-setting UI only (HouseholdScreen's toggle, App.tsx's status
 * bar) — everything that just wants colors/spacing keeps using useTheme(). */
export function useThemeMode(): ThemeModeValue {
  const value = useContext(ThemeModeContext);
  if (!value) {
    throw new Error('useThemeMode was called outside of a <ThemeProvider>.');
  }
  return value;
}
