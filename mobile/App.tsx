import { useCallback, useMemo } from 'react';
import { ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  type LinkingOptions,
  type NavigationProp,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Body, ErrorNote, Heading, Screen } from './src/components/ui';
import { HeaderLogo } from './src/components/HeaderLogo';
import { NavMenu } from './src/components/NavMenu';
import { useAnonymousSession } from './src/hooks/useAnonymousSession';
import { useHousehold } from './src/hooks/useHousehold';
import { useLists } from './src/hooks/useLists';
import { envResult, type Env } from './src/lib/env';
import { getSupabaseClient } from './src/lib/supabase';
import type { RootStackParamList } from './src/navigation/types';
import { ConfigErrorScreen } from './src/screens/ConfigErrorScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HouseholdScreen } from './src/screens/HouseholdScreen';
import { HouseholdSetupScreen } from './src/screens/HouseholdSetupScreen';
import { ListDetailScreen } from './src/screens/ListDetailScreen';
import { ListsScreen } from './src/screens/ListsScreen';
import { LocationsScreen } from './src/screens/LocationsScreen';
import { ShoppingScreen } from './src/screens/ShoppingScreen';
import { ThemeProvider, useTheme, useThemeMode } from './src/theme/ThemeProvider';
import type { Tokens } from './src/theme/tokens';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * What gives each screen a URL. Without it React Navigation never touches browser
 * history, and the Vercel build — the agreed review surface — answers Back by
 * leaving the app. The web origin is implicit, so only the native scheme (declared
 * in `app.json`) needs listing here.
 *
 * `Dashboard` takes the empty path as of #22 — it replaced `Lists` as the home
 * screen for every user, with or without a household. `Lists` keeps a real path of
 * its own (`/lists`) rather than losing one now that it isn't home: it's still a
 * screen someone can be deep-linked to or hit Back into.
 *
 * `initialRouteName` is what puts `Dashboard` underneath a deep-linked screen rather
 * than replacing it. Without it, opening `/list/<id>` cold builds a stack one screen
 * deep: the header draws no back button and browser Back leaves the app — the exact
 * failure the navigator was adopted to fix, reintroduced through the door deep links
 * use. The navigator's own `initialRouteName` does not cover this; a state
 * rehydrated from a URL is used as given.
 *
 * `Locations` carries no path template for `attachToListId` — that param is only
 * ever set via in-app `navigation.navigate(...)` from ListDetailScreen, never a URL,
 * so there is nothing for the linking config to parse out of a path.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['cartel://'],
  config: {
    initialRouteName: 'Dashboard',
    screens: {
      Dashboard: '',
      Lists: 'lists',
      ListDetail: 'list/:listId',
      HouseholdSetup: 'household/setup',
      Household: 'household',
      Locations: 'locations',
      Shopping: 'shop/:listId',
      History: 'history',
    },
  },
};

export default function App() {
  return (
    <ThemeProvider>
      {/* Insets read as zero without this provider, so the whole tree sits inside
          it — including the branches that never reach the navigator. */}
      <SafeAreaProvider>
        {envResult.ok ? (
          <Bootstrapped env={envResult.env} />
        ) : (
          <ConfigErrorScreen
            problem={envResult.problem}
            remedy={envResult.remedy}
          />
        )}
        <ThemedStatusBar />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

/** style is named for the icon color, inverted from the background: a dark
 * ground needs light icons ('light'), a light ground needs dark icons
 * ('dark') — opposite of resolvedScheme's own name. */
function ThemedStatusBar() {
  const { resolvedScheme } = useThemeMode();
  return <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />;
}

/**
 * The boot states stay branches and only the destinations become routes.
 *
 * Booting, failing to get a session and failing to load the household are not places
 * — you cannot navigate back to them and they have no URL worth writing down — so
 * putting them in the navigator would buy history entries nobody wants. Everything
 * past them is a place, which is why the household branch registers screens instead
 * of returning them: from Slice 2 on, back and the browser URL have to mean
 * something, and that is the whole reason the navigator was adopted.
 *
 * `Dashboard` is home for every user, with or without a household — `Lists` held
 * this role from Slice 2 through Slice 9, but #22 gave it its own standalone screen
 * and moved the entry point to a real Dashboard. Slice 1 made the household screens
 * the whole app for anyone without a household, and Slice 2 could not keep that: a
 * user who has never created or joined one still builds lists, so the household
 * became a place you go rather than the door you come in through — that is still
 * true here, just one hop further from the door than it used to be.
 *
 * Which of the two household screens is registered still depends on the data. It is
 * one or the other, never both — registering both and navigating between them would
 * let a user land on the household screen without a household, and the type would
 * not stop them.
 *
 * The list index is loaded here rather than inside the screen that shows it, because
 * the detail screen reads its own list's name and scope out of the same array. One
 * copy means promoting a list on the detail screen changes the badge on the index
 * too, without either screen knowing the other exists.
 */
function Bootstrapped({ env }: { env: Env }) {
  const client = useMemo(() => getSupabaseClient(env), [env]);
  const session = useAnonymousSession(client);
  const ready = session.status === 'ready';
  const { view, refresh } = useHousehold(client, ready);
  const lists = useLists(client, ready);
  const tokens = useTheme();

  // Computed safely ahead of the early returns below (view.state only exists once
  // view.status === 'loaded') so NavMenu — wired globally here, not per-screen —
  // always knows whether "Household" or "Join or create a household" is correct,
  // on every screen, including the ones rendered before a household ever loads.
  const hasHousehold = view.status === 'loaded' && view.state.status === 'member';

  // A function, not a plain object, as of #24: the hamburger menu it installs via
  // headerRight needs each screen's own `navigation` to call .navigate() on, which
  // only this function form of screenOptions is handed.
  const screenOptions = useCallback(
    ({ navigation }: { navigation: NavigationProp<RootStackParamList> }) => ({
      ...headerOptions(tokens),
      headerRight: () => <NavMenu navigation={navigation} hasHousehold={hasHousehold} />,
    }),
    [tokens, hasHousehold],
  );

  if (session.status === 'error') {
    return (
      <Screen>
        <Heading>Cartel can’t start</Heading>
        <Body>The app could not establish a session.</Body>
        <ErrorNote message={session.message} />
      </Screen>
    );
  }

  if (session.status === 'loading' || view.status === 'loading') {
    return <Loading />;
  }

  if (view.status === 'error') {
    return (
      <Screen>
        <Heading>Something went wrong</Heading>
        <ErrorNote message={view.message} />
      </Screen>
    );
  }

  const state = view.state;

  return (
    <NavigationContainer linking={linking} fallback={<Loading />}>
      <Stack.Navigator initialRouteName="Dashboard" screenOptions={screenOptions}>
        <Stack.Screen name="Dashboard" options={{ title: 'Cartel' }}>
          {(props) => (
            <DashboardScreen
              {...props}
              client={client}
              listsView={lists.view}
              onListsChanged={lists.refresh}
              household={state.status === 'member' ? state.household : null}
              memberCount={state.status === 'member' ? state.memberCount : 0}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Lists" options={{ title: 'Lists' }}>
          {(props) => (
            <ListsScreen
              {...props}
              client={client}
              view={lists.view}
              refresh={lists.refresh}
              household={state.status === 'member' ? state.household : null}
            />
          )}
        </Stack.Screen>

        {/* The title is a placeholder: the screen replaces it with the list's name
            once the index resolves, which on a cold deep link is a moment later. */}
        <Stack.Screen name="ListDetail" options={{ title: 'List' }}>
          {(props) => (
            <ListDetailScreen
              {...props}
              client={client}
              lists={lists.view}
              onListsChanged={lists.refresh}
              inHousehold={state.status === 'member'}
              household={state.status === 'member' ? state.household : null}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Locations" options={{ title: 'Locations' }}>
          {(props) => (
            <LocationsScreen
              {...props}
              client={client}
              onListsChanged={lists.refresh}
            />
          )}
        </Stack.Screen>

        {/* Title is a placeholder for the same reason ListDetail's is: the screen
            replaces it with the list's name once the index resolves. */}
        <Stack.Screen name="Shopping" options={{ title: 'Shopping' }}>
          {(props) => (
            <ShoppingScreen {...props} client={client} lists={lists.view} />
          )}
        </Stack.Screen>

        <Stack.Screen name="History" options={{ title: 'History' }}>
          {(props) => (
            <HistoryScreen
              {...props}
              client={client}
              onListsChanged={lists.refresh}
              household={state.status === 'member' ? state.household : null}
            />
          )}
        </Stack.Screen>

        {state.status === 'none' ? (
          <Stack.Screen name="HouseholdSetup" options={{ title: 'Household' }}>
            {() => <HouseholdSetupScreen client={client} onJoined={refresh} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Household" options={{ title: state.household.name }}>
            {() => (
              <HouseholdScreen
                client={client}
                memberCount={state.memberCount}
                onRefresh={refresh}
              />
            )}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/**
 * The header is the one surface the navigator draws itself, so it is also the one
 * place tokens have to be handed over rather than read.
 *
 * `headerTitle` renders the wordmark (`HeaderLogo`) in place of each screen's plain
 * text name — every `Stack.Screen`'s own `title` string still stands, just no longer
 * drawn here: it's what sets the browser tab title, and what `ListDetailScreen`/
 * `ShoppingScreen` overwrite via `navigation.setOptions({ title: ... })` once their
 * list loads. `headerTitleStyle` is gone because it only ever styled the default
 * text-based title, which nothing here still renders.
 *
 * `headerBackVisible: false` hides the native-stack back chevron — redundant next to
 * the wordmark once the hamburger `NavMenu` covers the same "go somewhere else" job,
 * and confusing sitting right beside a logo that isn't itself a button. It does not
 * disable back navigation — the OS/browser back gesture and button still work
 * exactly as before. It also does nothing at all on this project's actual review
 * surface: `headerBackVisible` is only read by native-stack's *native* header path
 * (`react-native-screens`, unavailable on web), not by the JS `Header` component
 * `@react-navigation/elements` falls back to on web, which instead defaults
 * `headerLeft` to a `HeaderBackButton` whenever `navigation.canGoBack()` is true,
 * ignoring `headerBackVisible` entirely. `headerLeft: () => null` is the option the
 * web fallback actually checks, so both are set — one per platform's real code path,
 * neither one alone covers both.
 */
function headerOptions(tokens: Tokens) {
  return {
    headerStyle: { backgroundColor: tokens.color.ground },
    headerTintColor: tokens.color.textPrimary,
    headerTitle: () => <HeaderLogo />,
    headerShadowVisible: false,
    headerBackVisible: false,
    headerLeft: () => null,
    contentStyle: { backgroundColor: tokens.color.ground },
  };
}

function Loading() {
  const tokens = useTheme();

  return (
    <Screen>
      <ActivityIndicator color={tokens.color.accent} size="large" />
    </Screen>
  );
}
