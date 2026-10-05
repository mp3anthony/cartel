import { logDiagnostic } from './logging';

/**
 * PostgREST's "JWT issued at future" (#117): the token's `iat` is later than PostgREST's
 * cached clock, an intermittent upstream bug that clears within moments. It is a server
 * answer to a perfectly good session, so the fix is to ask again, never to re-sign-in or
 * clear the session (ADR 0003). Matched on the exact code only: PGRST301 (a genuinely bad
 * token) must not retry.
 */
export const JWT_ISSUED_AT_FUTURE = 'PGRST303';

// Three retries, four attempts in all.
const RETRY_DELAYS_MS = [300, 800, 1500] as const;

/**
 * Runs a read, retrying only on PGRST303. `run` must build a fresh query on every call
 * (a PostgREST builder is single-use). After the last attempt the last result comes back
 * unchanged, so the caller's own error handling still decides what the user sees. Never
 * throws and never touches auth.
 */
export async function retryOnJwtIssuedAtFuture<
  R extends { error: { code?: string; message: string } | null },
>(label: string, run: () => PromiseLike<R>): Promise<R> {
  let result = await run();

  for (let attempt = 0; ; attempt++) {
    if (result.error?.code !== JWT_ISSUED_AT_FUTURE) {
      return result;
    }

    const willRetry = attempt < RETRY_DELAYS_MS.length;
    logDiagnostic('postgrest-retry', result.error.message, {
      label,
      attempt: attempt + 1,
      code: result.error.code,
      willRetry,
    });

    if (!willRetry) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    result = await run();
  }
}
