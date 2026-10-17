import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Banner,
  Body,
  ErrorNote,
  Field,
  Heading,
  IconButton,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from '../components/ui';
import { submitFeedback } from '../lib/feedback';
import { withStoreLine } from '../lib/itemLocationPicker';
import {
  uploadFeedbackScreenshot,
  validateScreenshot,
  type PickedScreenshot,
} from '../lib/feedbackScreenshots';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Feedback'> & {
  client: SupabaseClient;
};

/**
 * The #69 report form. Reached from the "Report issue" button on `SettingsScreen` and,
 * since #154, from the Item location picker's "Missing one? Tell us" link (title
 * "Item location missing" and the Store attached). `fromScreen` arrives as a route param
 * set by each caller rather than something this screen reads off the navigator itself: by
 * the time this screen is mounted, the navigator's own "current route" is already
 * `Feedback`, not wherever the user tapped from. A new entry point supplies its own screen
 * name the same way; nothing here needs to change.
 *
 * There is one standard report (#109), no Bug/Feature choice: the user says what is
 * going on, and the device and OS are captured automatically (`describeDevice`)
 * rather than asked for.
 *
 * Submitting failure preserves every field (nothing is cleared in the error
 * path) so a retry never means re-typing from scratch, per the issue's own
 * acceptance criterion. Success replaces the form with a `Banner` and a single
 * "Done" button back to Settings — deliberately manual, not an auto-navigate
 * timer: `Banner`'s own doc comment already rules out auto-dismiss for every
 * caller, and inventing a timed navigation here would be the same shape of
 * surprise from the opposite direction.
 */
export function FeedbackScreen({ navigation, route, client }: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [name, setName] = useState('');
  const [title, setTitle] = useState(route.params?.title ?? '');
  // The Store a report is about, when it came from the Item location picker (#154). Shown
  // read-only and sent as the report's first line. The item's name is deliberately not
  // attached: reports are public GitHub issues.
  const storeLine = route.params?.storeName ?? route.params?.locationId ?? null;
  const [whatsHappening, setWhatsHappening] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // #70: the picked-but-not-yet-uploaded screenshot. Upload only happens at
  // submit time (not the moment it's picked) so a user who picks, then
  // abandons the form, never costs a Storage write — matches this app's
  // existing "write happens on submit, not on every intermediate step"
  // convention (e.g. `LocationsScreen`'s composer).
  const [screenshot, setScreenshot] = useState<PickedScreenshot | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);

  const canSubmit = whatsHappening.trim().length > 0;

  /**
   * Opens the device photo library and validates the pick immediately
   * (`validateScreenshot`) — a bad type/size is caught right here, before
   * the user has typed the rest of the form and hit Send, rather than
   * surfacing as a submit-time failure.
   */
  async function pickScreenshot() {
    setScreenshotError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setScreenshotError('Cartel needs photo library access to attach a screenshot.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    const picked: PickedScreenshot = {
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      fileSizeBytes: asset.fileSize,
    };

    const validation = validateScreenshot(picked);
    if (!validation.ok) {
      setScreenshotError(validation.message);
      return;
    }

    setScreenshot(picked);
  }

  function removeScreenshot() {
    setScreenshot(null);
    setScreenshotError(null);
  }

  async function submit() {
    if (!canSubmit || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    // Upload first, if there's anything to upload — a failure here stops
    // before `submitFeedback` is ever called, so a broken/missing upload can
    // never result in an issue filed with a dead image link (#70's own
    // acceptance criterion).
    let screenshotUrl: string | undefined;
    if (screenshot) {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) {
        setBusy(false);
        setError('Your session has expired — please reload and try again.');
        return;
      }

      const uploadOutcome = await uploadFeedbackScreenshot(client, user.id, screenshot);
      if (!uploadOutcome.ok) {
        setBusy(false);
        setError(uploadOutcome.message);
        return;
      }
      screenshotUrl = uploadOutcome.value;
    }

    const outcome = await submitFeedback(client, {
      name,
      title,
      whatsHappening: storeLine ? withStoreLine(storeLine, whatsHappening) : whatsHappening,
      screenshotUrl,
      fromScreen: route.params?.fromScreen ?? 'Settings',
    });

    setBusy(false);

    if (outcome.ok) {
      setSubmitted(true);
    } else {
      setError(outcome.message);
    }
  }

  if (submitted) {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <Banner message="Thanks — this has been sent through." />
        <PrimaryButton label="Done" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      <Heading>Report an issue</Heading>
      <Body>
        This goes straight into the project's issue tracker for a human to
        triage — there's no reply loop, so don't expect a response here.
      </Body>

      {storeLine ? <Body>{`Store: ${storeLine}`}</Body> : null}

      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        editable={!busy}
        placeholder="So we know who to thank"
      />

      <Field
        label="Title"
        value={title}
        onChangeText={setTitle}
        editable={!busy}
        placeholder="Short summary — leave blank and we'll make one"
      />

      <Field
        label="What's going on"
        required
        value={whatsHappening}
        onChangeText={setWhatsHappening}
        editable={!busy}
        placeholder={
          storeLine
            ? 'Which item location is missing, and what is in it?'
            : 'What happened, or what would you like Cartel to do?'
        }
        multiline
        numberOfLines={4}
        style={styles.multiline}
      />

      {screenshot ? (
        <View style={styles.screenshotPreviewRow}>
          <Image source={{ uri: screenshot.uri }} style={styles.screenshotThumbnail} />
          <IconButton
            glyph="×"
            accessibilityLabel="Remove attached screenshot"
            onPress={removeScreenshot}
            disabled={busy}
          />
        </View>
      ) : (
        <SecondaryButton label="Attach a screenshot" onPress={pickScreenshot} disabled={busy} />
      )}

      {screenshotError ? <ErrorNote message={screenshotError} /> : null}

      {error ? <ErrorNote message={error} /> : null}

      <View style={{ gap: 8 }}>
        <PrimaryButton label="Send" onPress={submit} busy={busy} disabled={!canSubmit} fullWidth />
      </View>
    </Screen>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    // `Field`'s base input style only ever needs paddingHorizontal — a
    // single-line TextInput centres its text vertically inside minHeight on
    // its own, so no paddingVertical was ever added there. `textAlignVertical:
    // 'top'` turns that auto-centring off for a multiline field, which means
    // this style has to supply the vertical breathing room a single-line
    // field gets for free — matching paddingHorizontal's own space.md so the
    // text sits the same distance from all four edges, not just the sides.
    multiline: {
      minHeight: 88,
      textAlignVertical: 'top',
      paddingVertical: tokens.space.md,
    },
    screenshotPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
    },
    screenshotThumbnail: {
      width: 64,
      height: 64,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.color.border,
    },
  });
}
