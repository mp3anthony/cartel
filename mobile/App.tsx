import { useMemo } from 'react';
import { ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Body, ErrorNote, Heading, Screen } from './src/components/ui';
import { useAnonymousSession } from './src/hooks/useAnonymousSession';
import { useHousehold } from './src/hooks/useHousehold';
import { useLists } from './src/hooks/useLists';
import { envResult, type Env } from './src/lib/env';
import { getSupabaseClient } from './src/lib/supabase';
import type { RootStackParamList } from './src/navigation/types';
import { ConfigErrorScreen } from './src/screens/ConfigErrorScreen';
import { HouseholdScreen } from './src/screens/HouseholdScreen';
import { HouseholdSetupScreen } from './src/screens/HouseholdSetupScreen';
import { ListDetailScreen } from './src/screens/ListDetailScreen';
import { ListsScreen } from './src/screens/ListsScreen';
import { LocationsScreen } from './src/screens/LocationsScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import type { Tokens } from './src/theme/tokens';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * What gives each screen a URL. Without it React Navigation never touches browser
 * history, and the Vercel build — the agreed review surface — answers Back by
 * leaving the app. The web origin is implicit, so only the native scheme (declared
 * in `app.json`) needs listing here.
 *
 * `Lists` takes the empty path because it is the home screen for every user, with or
 * without a household.
 *
 * `initialRouteName` is what puts `Lists` underneath a deep-linked screen rather than
 * replacing it. Without it, opening `/list/<id>` cold builds a stack one screen deep:
 * the header draws no back button and browser Back leaves the app — the exact failure
 * the navigator was adopted to fix, reintroduced through the door deep links use. The
 * navigator's own `initialRouteName` does not cover this; a state rehydrated from a
 * URL is used as given.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['cartel://'],
  config: {
    initialRouteName: 'Lists',
    screens: {
      Lists: '',
      ListDetail: 'list/:listId',
      HouseholdSetup: 'household/setup',
      Household: 'household',
      Locations: 'locations',
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
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </ThemeProvider>
  );
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
 * `Lists` is home for every user. Slice 1 made the household screens the whole app
 * for anyone without a household, and Slice 2 cannot keep that: a user who has never
 * created or joined one still builds lists, so the household became a place you go
 * rather than the door you come in through.
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
  const screenOptions = useMemo(() => headerOptions(tokens), [tokens]);

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
      <Stack.Navigator initialRouteName="Lists" screenOptions={screenOptions}>
        <Stack.Screen name="Lists" options={{ title: 'Cartel' }}>
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
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Locations" options={{ title: 'Locations' }}>
          {(props) => <LocationsScreen {...props} client={client} />}
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
 */
function headerOptions(tokens: Tokens) {
  return {
    headerStyle: { backgroundColor: tokens.color.ground },
    headerTintColor: tokens.color.textPrimary,
    headerTitleStyle: { fontWeight: '600' as const },
    headerShadowVisible: false,
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
