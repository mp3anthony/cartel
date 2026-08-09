import { type Env } from './env';

export type ConnectivityResult =
  | { status: 'ok'; detail: string }
  | { status: 'failed'; detail: string };

const TIMEOUT_MS = 8000;

/**
 * Proves the app can actually reach its Supabase project.
 *
 * This deliberately does not go through the supabase-js client. Every method that
 * client offers needs something Slice 0 does not have — `from()` needs a table, the
 * auth methods need a session — so any client call would fail for reasons unrelated
 * to connectivity and prove nothing.
 *
 * The auth health endpoint needs neither, and it is still a real authenticated round
 * trip: the API gateway validates the key before answering, so a wrong or absent key
 * comes back 401 while a correctly configured, reachable project answers 200. That
 * distinction is the whole point — the slice requires connectivity to be
 * demonstrated, not inferred from config values being present.
 *
 * The PostgREST root (`/rest/v1/`) was the obvious first choice and does not work:
 * it answers 401 for *every* key while the project has no exposed schema, which
 * makes a healthy project indistinguishable from bad credentials. Revisit once
 * Slice 2 introduces tables, at which point a real query becomes the stronger check.
 */
export async function checkSupabaseConnectivity(
  env: Env,
): Promise<ConnectivityResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const host = hostOf(env.supabaseUrl);

  try {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: env.supabasePublishableKey },
      signal: controller.signal,
    });

    if (response.ok) {
      return { status: 'ok', detail: `Reached ${host}` };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: 'failed',
        detail:
          `${host} rejected the key (HTTP ${response.status}). Check ` +
          'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
      };
    }

    return { status: 'failed', detail: `${host} answered HTTP ${response.status}.` };
  } catch (error) {
    // An aborted request and a dead network are different problems for whoever is
    // reading the screen, so they get different messages rather than one generic
    // failure. A free-tier project paused for inactivity shows up here as a timeout.
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 'failed',
        detail: `No answer from ${host} within ${TIMEOUT_MS / 1000}s.`,
      };
    }

    return {
      status: 'failed',
      detail:
        error instanceof Error
          ? `Could not reach ${host}: ${error.message}`
          : `Could not reach ${host}.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
