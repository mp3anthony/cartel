import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { appVersion } from './buildInfo';
import { humanise, type Outcome } from './household';

export type FeedbackType = 'bug' | 'feature';

export type FeedbackInput = {
  type: FeedbackType;
  name: string;
  title: string;
  whatsHappening: string;
  whatShouldHappen: string;
  deviceOs: string;
  /** The screen the user was on when they opened the feedback form — see
   * `FeedbackScreen`'s own doc comment for why this is a caller-supplied param
   * rather than something read off the navigator at submit time. */
  fromScreen: string;
  /** #70: the public Storage URL of an already-uploaded screenshot, or
   * `undefined` when none was attached. Upload happens before this function
   * is ever called (`FeedbackScreen` awaits `uploadFeedbackScreenshot` first)
   * — if the upload itself fails, `submitFeedback` is never reached and
   * nothing is filed to GitHub, satisfying the issue's "no partial issue
   * with a broken image link" acceptance criterion by construction rather
   * than by any check in this file. */
  screenshotUrl?: string;
};

/**
 * Calls the `report-feedback` Edge Function (#69). `client.functions.invoke`
 * forwards the caller's current session token as the Authorization header
 * automatically — this file never touches it directly, matching how every
 * other write in this app leaves authentication to the client/RLS layer
 * rather than handling tokens itself.
 *
 * Errors are routed through `humanise()` for consistency with every other
 * mutation in this app, even though an Edge Function error is never one of
 * `MESSAGES`' Postgres-shaped codes — it always falls through to the raw
 * message, which for this function is already human-legible text set by the
 * function itself (see `report-feedback/index.ts`).
 *
 * `functions.invoke`'s error object is not the JSON body: a non-2xx response
 * comes back as a `FunctionsHttpError` whose `.message` is a generic
 * "non-2xx status code" string, with the actual `{ error: string }` body only
 * reachable via `error.context`, a `Response`. That body is read explicitly
 * below rather than trusting `error.message`, or every failure would show the
 * user the same unhelpful generic string regardless of what actually failed.
 */
export async function submitFeedback(
  client: SupabaseClient,
  input: FeedbackInput,
): Promise<Outcome<void>> {
  const { data, error } = await client.functions.invoke('report-feedback', {
    body: {
      type: input.type,
      name: input.name.trim() || undefined,
      title: input.title.trim() || undefined,
      whatsHappening: input.whatsHappening.trim(),
      whatShouldHappen: input.whatShouldHappen.trim(),
      deviceOs: input.deviceOs.trim(),
      screenshotUrl: input.screenshotUrl,
      context: {
        appVersion,
        platform: Platform.OS,
        screen: input.fromScreen,
      },
    },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    const bodyMessage = context ? await context.clone().json().then((j) => j?.error, () => null) : null;
    return { ok: false, message: humanise({ message: bodyMessage || error.message }) };
  }

  if (!data?.success) {
    return { ok: false, message: humanise({ message: data?.error || 'Something went wrong submitting this.' }) };
  }

  return { ok: true, value: undefined };
}
