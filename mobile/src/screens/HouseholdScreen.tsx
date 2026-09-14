import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NavigationProp } from '@react-navigation/native';

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
import { appVersion, buildChannel, buildChannelLabel } from '../lib/buildInfo';
import { createInvite, type Invite } from '../lib/household';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, useThemeMode } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * The household home. Deliberately thin — this slice proves identity and pairing,
 * and lists arrive in Slice 2.
 *
 * There is no "remove member" or "make admin" control, and that is not an omission:
 * every member is equal rank by spec, so there is no rank for a control to change.
 *
 * The household's name is missing here on purpose: it's still this screen's tab
 * title (`Stack.Screen`'s own `title` in App.tsx), just no longer drawn in the
 * header itself — the header shows the `HeaderLogo` wordmark instead of screen
 * names, and its back chevron is suppressed in favor of the hamburger `NavMenu`
 * (#41). Naming the household again here would only repeat what the tab title
 * already carries, not fill a gap.
 */
export function HouseholdScreen({
  client,
  memberCount,
  onRefresh,
  navigation,
}: {
  client: SupabaseClient;
  memberCount: number;
  onRefresh: () => void;
  navigation: NavigationProp<RootStackParamList>;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const insets = useSafeAreaInsets();
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
    <View style={styles.householdRoot}>
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

        {/* Just the last element in a normal flow — this screen doesn't scroll/
            top-align like ListsScreen did, so there's no flexGrow bottom-pin trick to
            replicate here. Scoped to this screen only — see buildInfo.ts for why. */}
        <Text style={styles.footer}>
          {`v${appVersion} · ${buildChannelLabel[buildChannel]}`}
        </Text>
      </Screen>

      {/* #69's entry point, replacing the earlier plain-Row decision — the user
          asked for a floating pill, bug outline + "Report", bottom of the
          screen, matching Claude desktop's own bug-report affordance.
          Deliberately local to this screen (confirmed with the user, not
          global like NavMenu) — a plain sibling of `Screen` inside this
          screen's own root `View` rather than a `Modal`, since it only ever
          needs to float over this one screen's content, not escape the
          native-stack header layer the way NavMenu's popover has to. Insets
          its own bottom offset with `useSafeAreaInsets` directly (matching
          NavMenu's own top-inset handling) since it sits outside `Screen`'s
          SafeAreaView here. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report a bug or idea"
        onPress={() => navigation.navigate('Feedback', { fromScreen: 'Household' })}
        style={({ pressed }) => [
          styles.reportFab,
          { bottom: insets.bottom + tokens.space.lg },
          pressed && styles.reportFabPressed,
        ]}
      >
        <BugIcon color={tokens.color.textPrimary} />
        <Text style={styles.reportFabLabel}>Report</Text>
      </Pressable>
    </View>
  );
}

/** A plain outline glyph, single-use — see the floating button's own doc
 * comment for why this isn't a shared `ui.tsx` primitive. Stroke-only
 * (`fill="none"`), never filled, matching the "outline" the user asked for. */
function BugIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 4 L7 2 M15 4 L17 2" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx="12" cy="6" r="2.2" stroke={color} strokeWidth={1.6} />
      <Rect x="7" y="9" width="10" height="11" rx="5" stroke={color} strokeWidth={1.6} />
      <Path d="M12 9 V20" stroke={color} strokeWidth={1.6} />
      <Path
        d="M7 12 H3 M17 12 H21 M7 16 H3 M17 16 H21 M8 19 L5 21 M16 19 L19 21"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
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
    householdRoot: {
      flex: 1,
    },
    reportFab: {
      position: 'absolute',
      right: tokens.space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.xs,
      backgroundColor: tokens.color.surface,
      borderWidth: 1,
      borderColor: tokens.color.border,
      borderRadius: tokens.radius.pill,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.md,
      ...tokens.elevation.card,
    },
    reportFabPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    reportFabLabel: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
    },
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
    footer: {
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
      textAlign: 'center',
    },
  });
}
