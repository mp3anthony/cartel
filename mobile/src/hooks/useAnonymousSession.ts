import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; userId: string }
  | { status: 'error'; message: string };

/**
 * Establishes the anonymous session the whole app runs on.
 *
 * There is no login screen by design — the CRD's first flow is building a list, and
 * a signup wall in front of that is the thing this app is meant not to do. So the
 * session is created silently on first launch and restored from storage thereafter.
 *
 * Restoring matters more than creating: a restored session is what makes the user
 * the same person as last time, and therefore still in their household.
 */
export function useAnonymousSession(client: SupabaseClient): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function establish() {
      const { data, error } = await client.auth.getSession();

      if (error) {
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
        setState({ status: 'error', message: 'No session was returned.' });
        return;
      }

      setState({ status: 'ready', userId: signIn.data.session.user.id });
    }

    establish();

    return () => {
      active = false;
    };
  }, [client]);

  return state;
}
