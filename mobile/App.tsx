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
import { envResult, type Env } from './src/lib/env';
import { getSupabaseClient } from './src/lib/supabase';
import { ConfigErrorScreen } from './src/screens/ConfigErrorScreen';
import { HouseholdScreen } from './src/screens/HouseholdScreen';
import { HouseholdSetupScreen } from './src/screens/HouseholdSetupScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import type { Tokens } from './src/theme/tokens';

/**
 * Every route's parameters, in one place. React Navigation cannot check a route
 * parameter it has not been told about, and a deep link is the one caller that can
 * arrive with any shape at all — an untyped param is `undefined` at runtime the
 * first time someone opens a hand-edited URL.
 */
export type RootStackParamList = {
  HouseholdSetup: undefined;
  Household: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * What gives each screen a URL. Without it React Navigation never touches browser
 * history, and the Vercel build — the agreed review surface — answers Back by
 * leaving the app. The web origin is implicit, so only the native scheme (declared
 * in `app.json`) needs listing here.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['cartel://'],
  config: {
    screens: {
      HouseholdSetup: 'household/setup',
      Household: 'household',
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
 * Which screens are registered still depends on the data. Registering both and
 * navigating between them would let a user land on the household screen without a
 * household, and the type would not stop them.
 */
function Bootstrapped({ env }: { env: Env }) {
  const client = useMemo(() => getSupabaseClient(env), [env]);
  const session = useAnonymousSession(client);
  const { view, refresh } = useHousehold(client, session.status === 'ready');
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
      <Stack.Navigator screenOptions={screenOptions}>
        {state.status === 'none' ? (
          <Stack.Screen name="HouseholdSetup" options={{ title: 'Cartel' }}>
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
