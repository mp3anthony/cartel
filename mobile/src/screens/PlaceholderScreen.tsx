import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  checkSupabaseConnectivity,
  type ConnectivityResult,
} from '../lib/connectivity';
import type { Env } from '../lib/env';
import { getSupabaseClient } from '../lib/supabase';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * The single screen of Slice 0. It exists to prove two things visibly: that the
 * theme layer feeds a real screen, and that the app genuinely reached Supabase.
 *
 * The connectivity result is rendered rather than logged so that "it connects" is
 * something you can see on a device, which is what the slice's acceptance test asks
 * for. Navigation, auth and data all belong to later slices.
 */
export function PlaceholderScreen({ env }: { env: Env }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [result, setResult] = useState<ConnectivityResult | null>(null);

  // Constructing the client is itself part of what this slice has to prove, and it
  // is not free of failure modes — createClient rejects a malformed URL. Slice 1 is
  // its first real consumer; here it only has to come into existence.
  const client = getSupabaseClient(env);

  useEffect(() => {
    let active = true;

    checkSupabaseConnectivity(env).then((outcome) => {
      if (active) {
        setResult(outcome);
      }
    });

    // The check outlives the screen if it unmounts mid-flight; this drops the
    // result rather than setting state on a gone component.
    return () => {
      active = false;
    };
  }, [env]);

  return (
    <SafeAreaView style={styles.ground}>
      <View style={styles.content}>
        <Text style={styles.wordmark}>Cartel</Text>
        <Text style={styles.subtitle}>
          Slice 0 — scaffolding. Nothing here is the real app yet.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Supabase</Text>
          <ConnectivityLine result={result} styles={styles} tokens={tokens} />
          <Text style={styles.statusDetail}>
            {client ? 'Client configured' : 'Client unavailable'} · theme tokens in
            use
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ConnectivityLine({
  result,
  styles,
  tokens,
}: {
  result: ConnectivityResult | null;
  styles: ReturnType<typeof createStyles>;
  tokens: Tokens;
}) {
  if (!result) {
    return (
      <View style={styles.statusRow}>
        <ActivityIndicator color={tokens.color.accent} />
        <Text style={styles.statusText}>Checking connection…</Text>
      </View>
    );
  }

  const connected = result.status === 'ok';

  return (
    <View style={styles.statusRow}>
      {/*
        The mark and the word both carry the state. Design reference is explicit
        that meaning is never encoded in colour alone.
      */}
      <Text
        style={[
          styles.statusMark,
          { color: connected ? tokens.color.positive : tokens.color.negative },
        ]}
      >
        {connected ? '✓' : '✕'}
      </Text>
      <View style={styles.statusBody}>
        <Text
          style={[
            styles.statusText,
            { color: connected ? tokens.color.positive : tokens.color.negative },
          ]}
        >
          {connected ? 'Connected' : 'Not connected'}
        </Text>
        <Text style={styles.statusDetail}>{result.detail}</Text>
      </View>
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    ground: {
      flex: 1,
      backgroundColor: tokens.color.ground,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: tokens.space.lg,
      gap: tokens.space.md,
    },
    wordmark: {
      fontSize: tokens.fontSize.display,
      fontWeight: '700',
      color: tokens.color.textPrimary,
    },
    subtitle: {
      fontSize: tokens.fontSize.body,
      color: tokens.color.textSecondary,
      marginBottom: tokens.space.md,
    },
    card: {
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      padding: tokens.space.lg,
      gap: tokens.space.md,
      ...tokens.elevation.card,
    },
    cardHeading: {
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: tokens.color.textSecondary,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tokens.space.sm,
      minHeight: tokens.minTouchTarget,
    },
    statusMark: {
      fontSize: tokens.fontSize.title,
      fontWeight: '700',
      lineHeight: tokens.fontSize.title + tokens.space.xs,
    },
    statusBody: {
      flex: 1,
      gap: tokens.space.xs,
    },
    statusText: {
      fontSize: tokens.fontSize.title,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    statusDetail: {
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
    },
  });
}
