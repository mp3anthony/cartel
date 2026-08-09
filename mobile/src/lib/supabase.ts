import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { type Env } from './env';

/**
 * The app's Supabase client.
 *
 * Built from an already-validated Env rather than reaching for the environment
 * itself, so this module cannot be the thing that fails on a misconfigured build —
 * by the time it is called, the credentials are known good.
 *
 * Session persistence and auto-refresh are off because Slice 0 has no auth at all.
 * Anonymous sign-in arrives in Slice 1, and that is the point at which a storage
 * adapter needs wiring in; leaving persistence on without one would warn on native
 * and silently keep nothing.
 */
let client: SupabaseClient | undefined;

export function getSupabaseClient(env: Env): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}
