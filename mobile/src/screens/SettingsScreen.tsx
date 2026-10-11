import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useFocusEffect, type NavigationProp } from '@react-navigation/native';

import {
  Body,
  ButtonRow,
  Card,
  ErrorNote,
  IconButton,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SegmentedControl,
} from '../components/ui';
import { appVersion, buildChannel, buildChannelLabel } from '../lib/buildInfo';
import { createInvite, type HouseholdState, type Invite, type Outcome } from '../lib/household';
import type { RootStackParamList } from '../navigation/types';
import { pressFill, pressScaleFill, useReduceMotion } from '../theme/motion';
import { useTheme, useThemeMode } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * Settings (#109), the page the bottom pill's gear opens. It replaced the Household
 * screen and is registered whether or not the user is in a household, so everyone gets
 * Appearance and the report entry point, and the Household section shows whichever
 * state applies. Creating or joining a household happens on `HouseholdSetup`, which
 * this page links to; it stays an offer, never a gate.
 *
 * There is no "remove member" or "make admin" control, and that is not an omission:
 * every member is equal rank by spec, so there is no rank for a control to change. The
 * household name is read-only text for the same reason a rename is out of scope.
 *
 * The household is reloaded every time the page gains focus (`useFocusEffect`), so the
 * member count is never stale after someone joins; the round refresh button does the
 * same by hand. A failed reload keeps what is on screen and shows the error in place
 * (`useHousehold.reload`).
 *
 * "Report issue" (top right) is local to this page, replacing the floating pill
 * #69 first put here. The version and copyright footer is pinned to the bottom of the
 * page, or sits under the content when it is long enough to scroll; the strings come
 * from `buildInfo.ts`, never hardcoded.
 */
export function SettingsScreen({
  client,
  household,
  onReload,
  navigation,
}: {
  client: SupabaseClient;
  household: HouseholdState;
  onReload: () => Promise<Outcome<void>>;
  navigation: NavigationProp<RootStackParamList>;
}) {
  const tokens = useTheme();
  const reduceMotion = useReduceMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { mode, setMode } = useThemeMode();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const reloadingRef = useRef(false);

  const runReload = useCallback(async () => {
    if (reloadingRef.current) {
      return;
    }
    reloadingRef.current = true;
    setReloading(true);
    setReloadError(null);

    try {
      const outcome = await onReload();
      if (!outcome.ok) {
        setReloadError(outcome.message);
      }
    } finally {
      reloadingRef.current = false;
      setReloading(false);
    }
  }, [onReload]);

  useFocusEffect(
    useCallback(() => {
      void runReload();
    }, [runReload]),
  );

  async function generate() {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const outcome = await createInvite(client);

      if (outcome.ok) {
        setInvite(outcome.value);
      } else {
        setError(outcome.message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report issue"
        onPress={() => navigation.navigate('Feedback', { fromScreen: 'Settings' })}
        style={({ pressed }) => [
          styles.reportButton,
          pressed && styles.reportButtonPressed,
          pressScaleFill(pressed, reduceMotion),
        ]}
      >
        {({ pressed }) => (
          <>
            <BugIcon color={pressed ? tokens.color.accentContrast : tokens.color.textSecondary} />
            <Text
              style={[
                styles.reportLabel,
                pressed && styles.reportLabelPressed,
                pressFill(pressed, reduceMotion),
              ]}
            >
              Report issue
            </Text>
          </>
        )}
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>HOUSEHOLD</Text>

        {household.status === 'member' ? (
          <>
            <Text style={styles.householdName}>{household.household.name}</Text>

            <View style={styles.memberRow}>
              <Text style={styles.memberCount}>
                {household.memberCount === 1
                  ? 'Just you so far.'
                  : `${household.memberCount} members, all with equal access.`}
              </Text>
              <IconButton
                icon={(color) => <RefreshIcon color={color} />}
                accessibilityLabel="Refresh household"
                onPress={() => void runReload()}
                disabled={reloading}
              />
            </View>

            {reloadError ? <ErrorNote message={reloadError} /> : null}

            {invite ? (
              <Card>
                <Text style={styles.sectionLabel}>INVITE CODE</Text>
                <Text
                  accessibilityLabel={`Invite code ${invite.code.split('').join(' ')}`}
                  style={styles.code}
                >
                  {invite.code}
                </Text>
                <Text style={styles.expiry}>
                  Works once, expires {formatExpiry(invite.expiresAt)}.
                </Text>
              </Card>
            ) : null}

            {error ? <ErrorNote message={error} /> : null}

            <PrimaryButton
              label={invite ? 'Generate another code' : 'Invite someone'}
              onPress={generate}
              busy={busy}
            />
          </>
        ) : (
          <>
            <Body>It’s just you for now. Your own lists work without a household.</Body>

            {reloadError ? <ErrorNote message={reloadError} /> : null}

            <ButtonRow>
              <PrimaryButton
                label="Create a household"
                onPress={() => navigation.navigate('HouseholdSetup', { mode: 'create' })}
              />
              <SecondaryButton
                label="Join household"
                onPress={() => navigation.navigate('HouseholdSetup', { mode: 'join' })}
              />
            </ButtonRow>
          </>
        )}
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

      {/* `marginTop: 'auto'` inside the scroll content (which grows to the screen's
          height) pins this to the bottom on a short page and lets it follow the content
          on a long one. Non-interactive on purpose. */}
      <View style={styles.footer}>
        <Text style={styles.footerLine}>
          {`Cartel. v${appVersion} · ${buildChannelLabel[buildChannel]}`}
        </Text>
        <Text style={styles.footerLine}>
          {`© ${new Date().getFullYear()} HazardousSchematics.com`}
        </Text>
      </View>
    </Screen>
  );
}

/** A plain outline glyph, single-use here (not a shared `ui.tsx` primitive, since
 * nothing else needs it). Stroke-only, never filled. */
function BugIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
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

/** The refresh glyph for the household's round button: an open circular arrow, drawn
 * at the weight of `HeaderIcons`. The button holds the accessible name. */
function RefreshIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
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

// Local to this footer; `tokens.ts` has no monospace family and the palette file is not
// touched for one screen.
const footerFontFamily = Platform.select({
  web: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  ios: 'Menlo',
  default: 'monospace',
});

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    // Compact ghost pill, top right. In flow, no elevation. The Pressable itself is the
    // 44pt hit area; the negative margin keeps it from adding height to the page.
    reportButton: {
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.xs,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.md,
      marginVertical: -tokens.space.xs,
      borderWidth: 1,
      borderColor: tokens.color.border,
      borderRadius: tokens.radius.pill,
      backgroundColor: 'transparent',
    },
    reportButtonPressed: {
      backgroundColor: tokens.color.accent,
      borderColor: tokens.color.accent,
    },
    reportLabel: {
      color: tokens.color.textSecondary,
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
    },
    reportLabelPressed: {
      color: tokens.color.accentContrast,
    },
    section: {
      gap: tokens.space.sm,
    },
    sectionLabel: {
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      letterSpacing: 1,
      color: tokens.color.textSecondary,
    },
    householdName: {
      fontSize: tokens.fontSize.title,
      fontWeight: '700',
      color: tokens.color.textPrimary,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.space.sm,
    },
    memberCount: {
      flexShrink: 1,
      fontSize: tokens.fontSize.body,
      color: tokens.color.textPrimary,
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
      marginTop: 'auto',
      paddingTop: tokens.space.md,
      alignItems: 'center',
      gap: tokens.space.xs,
    },
    footerLine: {
      fontFamily: footerFontFamily,
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
      textAlign: 'center',
    },
  });
}
