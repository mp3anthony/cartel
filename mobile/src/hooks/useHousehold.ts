import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { loadHouseholdState, type HouseholdState, type Outcome } from '../lib/household';
import { logDiagnostic } from '../lib/logging';

export type HouseholdView =
  | { status: 'loading' }
  | { status: 'loaded'; state: HouseholdState }
  | { status: 'error'; message: string };

export function useHousehold(client: SupabaseClient, enabled: boolean) {
  const [view, setView] = useState<HouseholdView>({ status: 'loading' });
  // Shared by `refresh` and `reload`: only the response to the latest request applies, so
  // a slow earlier load can never overwrite a newer one.
  const requestRef = useRef(0);

  // The strict load, for boot and after joining: a failure puts the whole app on the
  // error screen, because there is no household view to fall back on yet.
  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    const outcome = await loadHouseholdState(client);

    if (!outcome.ok) {
      logDiagnostic('household', outcome.message);
    }

    if (request !== requestRef.current) {
      return;
    }

    setView(
      outcome.ok
        ? { status: 'loaded', state: outcome.value }
        : { status: 'error', message: outcome.message },
    );
  }, [client]);

  // The quiet load, for Settings (#109): runs every time the page opens and on the refresh
  // button. A failure keeps the last loaded view (never 'error' or 'loading', which would
  // replace the whole app with a spinner or an error screen) and hands the message back
  // for the caller to show in place.
  const reload = useCallback(async (): Promise<Outcome<void>> => {
    const request = ++requestRef.current;
    const outcome = await loadHouseholdState(client);

    if (!outcome.ok) {
      logDiagnostic('household', outcome.message);
      return { ok: false, message: outcome.message };
    }

    if (request === requestRef.current) {
      setView({ status: 'loaded', state: outcome.value });
    }

    return { ok: true, value: undefined };
  }, [client]);

  useEffect(() => {
    // Waits for the session, because every query here is scoped by auth.uid() and
    // running them signed-out returns an empty household rather than an error —
    // indistinguishable from genuinely having none.
    if (enabled) {
      refresh();
    }
  }, [enabled, refresh]);

  return { view, refresh, reload };
}
