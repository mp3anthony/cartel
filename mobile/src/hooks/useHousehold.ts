import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadHouseholdState, type HouseholdState } from '../lib/household';
import { logDiagnostic } from '../lib/logging';

export type HouseholdView =
  | { status: 'loading' }
  | { status: 'loaded'; state: HouseholdState }
  | { status: 'error'; message: string };

export function useHousehold(client: SupabaseClient, enabled: boolean) {
  const [view, setView] = useState<HouseholdView>({ status: 'loading' });

  const refresh = useCallback(async () => {
    const outcome = await loadHouseholdState(client);

    if (!outcome.ok) {
      logDiagnostic('household', outcome.message);
    }

    setView(
      outcome.ok
        ? { status: 'loaded', state: outcome.value }
        : { status: 'error', message: outcome.message },
    );
  }, [client]);

  useEffect(() => {
    // Waits for the session, because every query here is scoped by auth.uid() and
    // running them signed-out returns an empty household rather than an error —
    // indistinguishable from genuinely having none.
    if (enabled) {
      refresh();
    }
  }, [enabled, refresh]);

  return { view, refresh };
}
