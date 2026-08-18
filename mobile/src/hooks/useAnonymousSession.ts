import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { logDiagnostic } from '../lib/logging';

type InternalState =
  | { status: 'loading' }
  | { status: 'ready'; userId: string }
  | { status: 'error'; message: string };

export type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; userId: string }
  | { status: 'error'; message: string; retry: () => void };

/**
 * Establishes the anonymous session the whole app runs on.
 *
 * There is no login screen by design — the CRD's first flow is building a list, and
 * a signup wall in front of that is the thing this app is meant not to do. So the
 * session is created silently on first launch and restored from storage thereafter.
 *
 * Restoring matters more than creating: a restored session is what makes the user
 * the same person as last time, and therefore still in their household.
 *
 * `retry` (#42) re-runs the same establish effect via an internal token rather than
 * reloading the page — a manual click, no backoff, no retry limit. It exists because
 * the 'error' branch used to dead-end: nothing in the app could ever leave it short
 * of an external reload.
 */
export function useAnonymousSession(client: SupabaseClient): SessionState {
  const [state, setState] = useState<InternalState>({ status: 'loading' });
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' }); // resets the UI out of 'error' while retrying

    async function establish() {
      const { data, error } = await client.auth.getSession();

      if (error) {
        logDiagnostic('session', error, { stage: 'getSession' });
        if (active) {
          setState({ status: 'error', message: error.message });
        }
        return;
      }

      if (data.session) {
        if (active) {
          setState({ status: 'ready', userId: data.session.user.id });
        }
        return;
      }

      const signIn = await client.auth.signInAnonymously();

      if (!active) {
        return;
      }

      if (signIn.error) {
        logDiagnostic('session', signIn.error, { stage: 'signInAnonymously' });
        setState({
          status: 'error',
          // Anonymous sign-in is a project-level toggle, and this is the error you
          // get when it is off. Naming it saves a long hunt through client code for
          // a problem that is not in the client at all.
          message: `${signIn.error.message} — check that anonymous sign-ins are enabled for this Supabase project.`,
        });
        return;
      }

      if (!signIn.data.session) {
        logDiagnostic('session', 'No session was returned.', { stage: 'signInAnonymously' });
        setState({ status: 'error', message: 'No session was returned.' });
        return;
      }

      setState({ status: 'ready', userId: signIn.data.session.user.id });
    }

    establish();

    return () => {
      active = false;
    };
  }, [client, retryToken]);

  return state.status === 'error' ? { ...state, retry } : state;
}
