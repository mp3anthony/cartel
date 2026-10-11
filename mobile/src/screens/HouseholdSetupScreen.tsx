import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Body,
  ErrorNote,
  Field,
  Heading,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Screen,
} from '../components/ui';
import { createHousehold, redeemInvite } from '../lib/household';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'HouseholdSetup'> & {
  client: SupabaseClient;
  onJoined: () => void;
};

/**
 * Create or join form, reached from the Settings page (#109) when the user is in no
 * household; `route.params.mode` picks which (default create). There is no menu or Back
 * button here: Settings offers the two choices and the header's back circle returns.
 *
 * Note what this screen does not do: it does not block. A household is optional —
 * lists work without one from Slice 2 onward — so this is an offer, not a gate. The
 * CRD's first flow is building a list, and putting a mandatory setup step in front
 * of that is exactly the wall this app is meant to avoid.
 */
export function HouseholdSetupScreen({ client, onJoined, route }: Props) {
  const mode = route.params?.mode === 'join' ? 'join' : 'create';
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitCreate() {
    setBusy(true);
    setError(null);

    const outcome = await createHousehold(client, name);

    setBusy(false);

    if (outcome.ok) {
      onJoined();
    } else {
      setError(outcome.message);
    }
  }

  async function submitJoin() {
    setBusy(true);
    setError(null);

    const outcome = await redeemInvite(client, code);

    setBusy(false);

    if (outcome.ok) {
      onJoined();
    } else {
      setError(outcome.message);
    }
  }

  if (mode === 'create') {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <Heading>Name your household</Heading>
        <Body>Everyone who joins sees this name. You can be the only member.</Body>
        <Field
          label="Household name"
          value={name}
          onChangeText={setName}
          placeholder="Ferguson house"
          autoCapitalize="words"
          maxLength={60}
          editable={!busy}
        />
        {error ? <ErrorNote message={error} /> : null}
        <PrimaryButton
          label="Create household"
          onPress={submitCreate}
          busy={busy}
          disabled={name.trim().length === 0}
          fullWidth
        />
      </Screen>
    );
  }

  return (
    <Screen edges={NAVIGATOR_EDGES}>
      <Heading>Enter the code</Heading>
      <Body>
        Ask whoever set up the household for their invite code. Codes work once and
        expire after 24 hours.
      </Body>
      <Field
        label="Invite code"
        value={code}
        // Uppercased on the way in so the field matches what the other person is
        // reading aloud. The database normalises too — this is for the eye.
        onChangeText={(next) => setCode(next.toUpperCase())}
        placeholder="MWJHHK"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        editable={!busy}
      />
      {error ? <ErrorNote message={error} /> : null}
      <PrimaryButton
        label="Join household"
        onPress={submitJoin}
        busy={busy}
        disabled={code.trim().length < 6}
        fullWidth
      />
    </Screen>
  );
}
