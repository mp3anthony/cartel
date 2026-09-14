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
  Select,
} from '../components/ui';
import { submitFeedback, type FeedbackType } from '../lib/feedback';
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
 * The #69 report form. Reached from one place today — a row on `HouseholdScreen`
 * — which is why `fromScreen` arrives as a route param set by that single caller
 * rather than something this screen reads off the navigator itself: by the time
 * this screen is mounted, the navigator's own "current route" is already
 * `Feedback`, not wherever the user tapped from. If a second entry point is ever
 * added, it supplies its own screen name the same way; nothing here needs to
 * change.
 *
 * `type` uses `Select`, a real dropdown (`ui.tsx`) rather than
 * `SegmentedControl` — the user asked for this to read as a dropdown
 * specifically, not the inline segmented-track look `SegmentedControl` gives
 * Light/Dark/System and the chain picker. It always holds a value, so
 * "required" is satisfied by construction rather than needing a third,
 * unset state to guard against.
 *
 * Submitting failure preserves every field (nothing is cleared in the error
 * path) so a retry never means re-typing from scratch, per the issue's own
 * acceptance criterion. Success replaces the form with a `Banner` and a single
 * "Done" button back to Household — deliberately manual, not an auto-navigate
 * timer: `Banner`'s own doc comment already rules out auto-dismiss for every
 * caller, and inventing a timed navigation here would be the same shape of
 * surprise from the opposite direction.
 */
export function FeedbackScreen({ navigation, route, client }: Props) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [type, setType] = useState<FeedbackType>('bug');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [whatsHappening, setWhatsHappening] = useState('');
  const [whatShouldHappen, setWhatShouldHappen] = useState('');
  const [deviceOs, setDeviceOs] = useState('');
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

  const canSubmit =
    whatsHappening.trim().length > 0 &&
    whatShouldHappen.trim().length > 0 &&
    deviceOs.trim().length > 0;

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
      type,
      name,
      title,
      whatsHappening,
      whatShouldHappen,
      deviceOs,
      screenshotUrl,
      fromScreen: route.params?.fromScreen ?? 'Household',
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
      <Heading>Report a bug or idea</Heading>
      <Body>
        This goes straight into the project's issue tracker for a human to
        triage — there's no reply loop, so don't expect a response here.
      </Body>

      <Select
        label="Type"
        value={type}
        onChange={setType}
        options={[
          { value: 'bug', label: 'Bug' },
          { value: 'feature', label: 'Feature idea' },
        ]}
      />

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
        label="What's happening"
        required
        value={whatsHappening}
        onChangeText={setWhatsHappening}
        editable={!busy}
        placeholder="What did you see or want?"
        multiline
        numberOfLines={4}
        style={styles.multiline}
      />

      <Field
        label="What should happen instead"
        required
        value={whatShouldHappen}
        onChangeText={setWhatShouldHappen}
        editable={!busy}
        placeholder="What did you expect?"
        multiline
        numberOfLines={4}
        style={styles.multiline}
      />

      <Field
        label="Device / OS"
        required
        value={deviceOs}
        onChangeText={setDeviceOs}
        editable={!busy}
        placeholder="e.g. iPhone 15, iOS 18"
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
        <PrimaryButton label="Send" onPress={submit} busy={busy} disabled={!canSubmit} />
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
