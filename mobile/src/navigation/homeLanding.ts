/**
 * What to do to land on Home (#103), decided from the current routes. Pure, so
 * `scripts/check-home-confirmation.mjs` can run it without React Navigation.
 *
 * `popTo`: Dashboard is already in the stack, so pop back to it (a plain `navigate` would
 * push a duplicate in React Navigation 7). `reset`: it is absent (e.g. a deep link straight
 * to a list), so the stack becomes Home alone and Back cannot return to the finished shop.
 */
export type HomeLandingPlan =
  | { kind: 'popTo' }
  | { kind: 'reset'; routes: { name: 'Dashboard' }[]; index: 0 };

export function planHomeLanding(routes: readonly { name: string }[]): HomeLandingPlan {
  if (routes.some((route) => route.name === 'Dashboard')) {
    return { kind: 'popTo' };
  }
  return { kind: 'reset', routes: [{ name: 'Dashboard' }], index: 0 };
}
