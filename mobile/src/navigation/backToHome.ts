import {
  CommonActions,
  StackActions,
  type NavigationAction,
  type NavigationState,
} from '@react-navigation/native';

import { planHomeLanding } from './homeLanding';

/**
 * Leave a finished shop and land on Home (#103), modelled on `backToLists` (#167).
 * `popTo('Dashboard')` when Home is lower in the stack; otherwise a reset to Home alone.
 * The reset spreads the current state to keep the navigator key, so web linking keeps the
 * Safari history in step (docs/lessons.md). Reads the state at call time: callers run
 * after awaits.
 */
export function backToHome(navigation: {
  getState(): NavigationState;
  dispatch(action: NavigationAction): void;
}) {
  const state = navigation.getState();
  const plan = planHomeLanding(state.routes);
  if (plan.kind === 'popTo') {
    navigation.dispatch(StackActions.popTo('Dashboard'));
    return;
  }
  navigation.dispatch(
    CommonActions.reset({ ...state, routes: plan.routes, index: plan.index } as NavigationState),
  );
}
