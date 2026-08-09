import { useMemo } from 'react';
import { ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { Body, ErrorNote, Heading, Screen } from './src/components/ui';
import { useAnonymousSession } from './src/hooks/useAnonymousSession';
import { useHousehold } from './src/hooks/useHousehold';
import { envResult, type Env } from './src/lib/env';
import { getSupabaseClient } from './src/lib/supabase';
import { ConfigErrorScreen } from './src/screens/ConfigErrorScreen';
import { HouseholdScreen } from './src/screens/HouseholdScreen';
import { HouseholdSetupScreen } from './src/screens/HouseholdSetupScreen';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { useTheme } from './src/theme/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider>
      {envResult.ok ? (
        <Bootstrapped env={envResult.env} />
      ) : (
        <ConfigErrorScreen
          problem={envResult.problem}
          remedy={envResult.remedy}
        />
      )}
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}

/**
 * Chooses the screen from state rather than routing to it. Slice 1 has four screens
 * and no navigation library by decision, so "which screen" is a question about the
 * data, not about history: you are booting, or signed out, or in a household, or
 * not. None of those are places you navigate back to.
 *
 * This stops paying for itself once screens outnumber states, which is Slice 2.
 */
function Bootstrapped({ env }: { env: Env }) {
  const client = useMemo(() => getSupabaseClient(env), [env]);
  const session = useAnonymousSession(client);
  const { view, refresh } = useHousehold(client, session.status === 'ready');

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

  if (view.state.status === 'none') {
    return <HouseholdSetupScreen client={client} onJoined={refresh} />;
  }

  return (
    <HouseholdScreen
      client={client}
      household={view.state.household}
      memberCount={view.state.memberCount}
      onRefresh={refresh}
    />
  );
}

function Loading() {
  const tokens = useTheme();

  return (
    <Screen>
      <ActivityIndicator color={tokens.color.accent} size="large" />
    </Screen>
  );
}
