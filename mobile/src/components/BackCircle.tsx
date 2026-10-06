import type { NavigationProp, RouteProp } from '@react-navigation/native';

import { BackIcon } from './HeaderIcons';
import { HeaderCircleButton } from './ui';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NavigationProp<RootStackParamList>;

/** One `RouteProp` per route, so `route.name` narrows `route.params`. */
type AnyRoute = {
  [Name in keyof RootStackParamList]: RouteProp<RootStackParamList, Name>;
}[keyof RootStackParamList];

/**
 * Whether a route is a drill-down: a screen reached from another one, which therefore
 * gets the back circle (#157). The top-level destinations (the four bottom-nav
 * destinations) never do. The Stores picker is top-level when opened from the nav and a
 * drill-down when opened to attach a store to a list, which is what `attachToListId`
 * tells apart.
 */
export function isDrillDown(route: AnyRoute): boolean {
  switch (route.name) {
    case 'ListDetail':
    case 'Shopping':
    case 'LocationCatalog':
    case 'Feedback':
    case 'StoreMissing':
      return true;
    case 'Locations':
      return Boolean(route.params?.attachToListId);
    default:
      return false;
  }
}

/**
 * The circular back control in the header (#157), wired once through `headerLeft` in
 * App.tsx's `screenOptions`.
 *
 * On-screen Back must do what Safari's Back and the edge swipe do, so it is a plain
 * `goBack()`. The Dashboard fallback is only for an empty stack; the linking config's
 * `initialRouteName` normally puts Dashboard underneath a deep-linked screen, so it
 * should not be reached in practice. Not the elements `HeaderBackButton`: that draws its
 * own chevron and label, not the circle.
 */
export function BackCircle({ navigation }: { navigation: Navigation }) {
  return (
    <HeaderCircleButton
      icon={(color) => <BackIcon color={color} />}
      accessibilityLabel="Back"
      onPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Dashboard');
        }
      }}
    />
  );
}
