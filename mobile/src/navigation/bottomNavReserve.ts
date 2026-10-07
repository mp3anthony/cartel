import { createContext, useContext } from 'react';

/**
 * True while the bottom pill nav (#158) is mounted under the current screen. The pill sits
 * in layout flow below the screen and already clears the home-bar inset, so `Screen`
 * drops its own bottom inset when this is true, and bottom-fixed elements (the Household
 * report FAB) skip theirs. The navigator `layout` in `App.tsx` provides it; it is false on
 * Shopping Mode, which has no pill, and outside the navigator.
 */
export const BottomNavReserveContext = createContext(false);

export function useBottomNavReserved(): boolean {
  return useContext(BottomNavReserveContext);
}
