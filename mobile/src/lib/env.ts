/**
 * Environment credentials, validated once at module load.
 *
 * Validation returns a result rather than throwing. Throwing was the first instinct
 * — it certainly stops the app — but an exception raised during module import kills
 * the render before anything can catch it, and on web that surfaces as a blank white
 * page with the reason buried in the console. A blank page is the definition of
 * failing silently. Handing back a result lets the app render the actual problem,
 * which is loud on every platform.
 *
 * There are deliberately no fallback values. A default would turn a configuration
 * mistake into a runtime mystery.
 */

/**
 * Expo inlines EXPO_PUBLIC_* variables into the bundle at build time by textually
 * replacing `process.env.SOME_NAME`. That substitution only matches literal member
 * access, so these two reads cannot be collapsed into a loop over a list of names —
 * `process.env[name]` compiles to undefined in a release bundle.
 */
const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawPublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export type Env = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type EnvResult =
  | { ok: true; env: Env }
  | { ok: false; problem: string; remedy: string };

const REMEDY =
  'Copy mobile/.env.example to mobile/.env and fill it in from the Supabase ' +
  'dashboard, then restart with `npx expo start --clear`. Env values are baked in ' +
  'at build time, so a running server will not pick up the change.';

function validate(): EnvResult {
  const url = rawUrl?.trim();
  const key = rawPublishableKey?.trim();

  if (!url) {
    return fail('EXPO_PUBLIC_SUPABASE_URL is missing or empty.');
  }

  if (!key) {
    return fail('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing or empty.');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail(`EXPO_PUBLIC_SUPABASE_URL is not a valid URL (got "${url}").`);
  }

  if (parsed.protocol !== 'https:') {
    return fail(
      `EXPO_PUBLIC_SUPABASE_URL must be https (got "${parsed.protocol}//").`,
    );
  }

  return {
    ok: true,
    env: {
      // Trailing slashes would produce "//auth/v1/..." once paths are appended.
      supabaseUrl: url.replace(/\/+$/, ''),
      supabasePublishableKey: key,
    },
  };
}

function fail(problem: string): EnvResult {
  // Rendered on screen by the app, and logged here so it is also loud in the
  // terminal and in Vercel's build/runtime logs.
  console.error(`[cartel] Configuration problem: ${problem}`);
  return { ok: false, problem, remedy: REMEDY };
}

export const envResult = validate();
