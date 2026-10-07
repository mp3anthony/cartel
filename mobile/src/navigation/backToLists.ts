import {
  CommonActions,
  StackActions,
  type NavigationAction,
  type NavigationState,
} from '@react-navigation/native';

/**
 * Leave a list's screens and land on Lists (#167). Plain `navigate('Lists')` pushes a
 * duplicate Lists screen in React Navigation 7, so Back could return to a stale or
 * deleted list. `popTo('Lists')` fixes that when Lists is lower in the stack, but when it
 * is absent (e.g. Shopping opened from Home) it only replaces the current route and
 * leaves screens for this list underneath; so then everything from this list's first
 * screen (ListDetail, Shopping, or Locations attached to it) is dropped and Lists goes
 * on top. The reset spreads the current state to keep the navigator key, so web linking
 * keeps the Safari history in step. Reads the state at call time: callers run after awaits.
 */
export function backToLists(
  navigation: { getState(): NavigationState; dispatch(action: NavigationAction): void },
  listId: string,
) {
  const state = navigation.getState();
  if (state.routes.some((route) => route.name === 'Lists')) {
    navigation.dispatch(StackActions.popTo('Lists'));
    return;
  }

  const firstOfList = state.routes.findIndex((route) => {
    const params = route.params as { listId?: unknown; attachToListId?: unknown } | undefined;
    return params?.listId === listId || params?.attachToListId === listId;
  });
  const cut = firstOfList >= 0 ? firstOfList : state.index;
  const routes = [...state.routes.slice(0, cut), { name: 'Lists' }];
  navigation.dispatch(
    CommonActions.reset({ ...state, routes, index: routes.length - 1 } as NavigationState),
  );
}
