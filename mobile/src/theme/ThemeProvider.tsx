import { createContext, useContext, type ReactNode } from 'react';

import { tokens, type Tokens } from './tokens';

/**
 * Undefined rather than `tokens` as the default, so that a component rendered
 * outside the provider fails instead of silently working. If the fallback were the
 * real tokens, a missing provider would go unnoticed until the day the theme needs
 * to vary — which is exactly when it would be hardest to trace.
 */
const ThemeContext = createContext<Tokens | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Tokens {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme was called outside of a <ThemeProvider>.');
  }

  return value;
}
