import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { type Env } from './env';
import { logDiagnostic } from './logging';

/**
 * The app's Supabase client.
 *
 * Built from an already-validated Env rather than reaching for the environment
 * itself, so this module cannot be the thing that fails on a misconfigured build.
 *
 * Session persistence is on, and it is load-bearing rather than a nicety: identity
 * here is anonymous, so the stored session IS the user. Lose it and you are a
 * different person with no household, which would make Slice 1's whole feature
 * evaporate on the second launch. AsyncStorage backs onto localStorage on web, so
 * the same guarantee holds for the deployed build.
 *
 * detectSessionInUrl stays off: it is for OAuth redirect callbacks, which this app
 * has none of, and leaving it on makes the web build parse every URL it loads.
 */
let client: SupabaseClient | undefined;

export function getSupabaseClient(env: Env): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });

    // #42's "catch it in the act" monitoring — logs every auth state transition
    // (including token-refresh failures) so a future occurrence of the reported JWT
    // error has a trail to grep for, without adding a telemetry dependency.
    client.auth.onAuthStateChange((event, session) => {
      logDiagnostic('auth-state', event, {
        hasSession: session !== null,
        userId: session?.user.id ?? null,
      });
    });
  }

  return client;
}
