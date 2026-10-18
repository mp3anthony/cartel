/**
 * What the stack becomes after leaving the household from Settings (#90). Pure, so
 * `scripts/check-leave-household.mjs` can run it without React Navigation.
 *
 * Home is rebuilt fresh (no key) rather than kept: the leaver gets no Realtime for the
 * household's shops after leaving, so a kept Home would still show them. Settings keeps its
 * own route object, key included, so it does not remount or blur and its banner survives.
 * Null when Settings is not the focused screen: nothing to do.
 */
export function planAfterLeave<R extends { name: string; key?: string }>(state: {
  routes: readonly R[];
  index: number;
}): { routes: [{ name: 'Dashboard' }, R]; index: 1 } | null {
  const current = state.routes[state.index];
  if (!current || current.name !== 'Settings') {
    return null;
  }
  return { routes: [{ name: 'Dashboard' }, current], index: 1 };
}
