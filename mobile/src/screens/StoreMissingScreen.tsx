import { useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Banner,
  Body,
  ErrorNote,
  Field,
  Heading,
  NAVIGATOR_EDGES,
  PrimaryButton,
  Screen,
  Select,
} from '../components/ui';
import { submitStoreMissing } from '../lib/feedback';
import type { RootStackParamList } from '../navigation/types';
import { CHAIN_OPTIONS, type Chain } from '../theme/chainColors';

type Props = NativeStackScreenProps<RootStackParamList, 'StoreMissing'> & {
  client: SupabaseClient;
};

type ChainChoice = Chain | 'unsure';

const CHAIN_CHOICES: { value: ChainChoice; label: string }[] = [
  ...CHAIN_OPTIONS,
  { value: 'unsure', label: 'Not sure' },
];

/**
 * The "Store missing?" report (#107, ADR 0007). Stores cannot be added from the app;
 * this files a report for Ant to add one to the catalog. Modelled on
 * `FeedbackScreen`: a failed send keeps every field so a retry never means
 * re-typing, and success swaps the form for a Banner and a manual "Done".
 * Never sends or includes coordinates.
 */
export function StoreMissingScreen({ navigation, client }: Props) {
  const [storeName, setStoreName] = useState('');
  const [chain, setChain] = useState<ChainChoice>('unsure');
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // Synchronous re-entry guard; `busy` state is batched and cannot stop a double tap.
  const busyRef = useRef(false);

  const canSubmit = storeName.trim().length > 0;

  async function submit() {
    if (!canSubmit || busy || busyRef.current) {
      return;
    }

    busyRef.current = true;

    try {
      setBusy(true);
      setError(null);

      const outcome = await submitStoreMissing(client, {
        storeName,
        chain,
        area,
      });

      if (outcome.ok) {
        setSubmitted(true);
      } else {
        setError(outcome.message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <Screen edges={NAVIGATOR_EDGES}>
        <Banner message="Thanks — we'll take a look and add it." />
        <PrimaryButton label="Done" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen edges={NAVIGATOR_EDGES} align="top" scroll>
      <Heading>Store missing?</Heading>
      <Body>
        Tell us which store isn't listed and we'll add it to Cartel. Stores can't be added from
        the app, so it may take a little while to show up.
      </Body>

      <Field
        label="Store name"
        required
        value={storeName}
        onChangeText={setStoreName}
        editable={!busy}
        placeholder="e.g. New World Halswell"
        maxLength={80}
      />

      <Select label="Chain" value={chain} onChange={setChain} options={CHAIN_CHOICES} />

      <Field
        label="Suburb or street"
        value={area}
        onChangeText={setArea}
        editable={!busy}
        maxLength={80}
      />

      {error ? <ErrorNote message={error} /> : null}

      <PrimaryButton label="Send" onPress={submit} busy={busy} disabled={!canSubmit} />
    </Screen>
  );
}
