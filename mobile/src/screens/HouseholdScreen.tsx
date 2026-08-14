import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  Body,
  Card,
  ErrorNote,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SegmentedControl,
} from '../components/ui';
import { createInvite, type Invite } from '../lib/household';
import { useTheme, useThemeMode } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * The household home. Deliberately thin — this slice proves identity and pairing,
 * and lists arrive in Slice 2.
 *
 * There is no "remove member" or "make admin" control, and that is not an omission:
 * every member is equal rank by spec, so there is no rank for a control to change.
 *
 * The household's name is missing here on purpose: the navigator header carries it,
 * because that header is also what carries back. Naming it twice on one screen was
 * what the header replaced.
 */
export function HouseholdScreen({
  client,
  memberCount,
  onRefresh,
}: {
  client: SupabaseClient;
  memberCount: number;
  onRefresh: () => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { mode, setMode } = useThemeMode();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);

    const outcome = await createInvite(client);

    setBusy(false);

    if (outcome.ok) {
      setInvite(outcome.value);
    } else {
      setError(outcome.message);
    }
  }

  return (
    <Screen edges={NAVIGATOR_EDGES}>
      <Body>
        {memberCount === 1
          ? 'Just you so far.'
          : `${memberCount} members, all with equal access.`}
      </Body>

      {invite ? (
        <Card>
          <Text style={styles.cardLabel}>INVITE CODE</Text>
          <Text accessibilityLabel={`Invite code ${invite.code.split('').join(' ')}`} style={styles.code}>
            {invite.code}
          </Text>
          <Text style={styles.expiry}>
            Works once, expires {formatExpiry(invite.expiresAt)}.
          </Text>
        </Card>
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      <View style={{ gap: 8 }}>
        <PrimaryButton
          label={invite ? 'Generate another code' : 'Invite someone'}
          onPress={generate}
          busy={busy}
        />
        <SecondaryButton label="Refresh" onPress={onRefresh} disabled={busy} />
      </View>

      <SegmentedControl
        label="Appearance"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'system', label: 'System' },
        ]}
      />
    </Screen>
  );
}

/**
 * Deliberately relative and coarse. An exact timestamp invites the reader to do
 * arithmetic; "in about 24 hours" is the only thing they actually need to know.
 */
function formatExpiry(expiresAt: string): string {
  const hours = Math.round(
    (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60),
  );

  if (hours <= 0) {
    return 'shortly';
  }

  return hours === 1 ? 'in about an hour' : `in about ${hours} hours`;
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    cardLabel: {
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      letterSpacing: 1,
      color: tokens.color.textSecondary,
    },
    code: {
      fontSize: tokens.fontSize.display,
      fontWeight: '700',
      letterSpacing: 4,
      color: tokens.color.accent,
    },
    expiry: {
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
    },
  });
}
