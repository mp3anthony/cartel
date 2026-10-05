// deno-lint-ignore-file no-explicit-any
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * In-app feedback → GitHub issue (#69). The client (`mobile/src/lib/feedback.ts`)
 * calls this via `client.functions.invoke`, which forwards the caller's current
 * session token as the Authorization header automatically — nothing here trusts a
 * client-supplied identity, matching the same "re-derive server-side" discipline
 * this project already applies to `security definer` RPCs (see `03-SPEC.md § 0`).
 *
 * The GitHub PAT (`GITHUB_BUG_REPORT_TOKEN`) is a Supabase Edge Function secret,
 * set via the dashboard or `supabase secrets set` — it is never a build-time
 * `EXPO_PUBLIC_*` variable, so it can never reach the client bundle. `SUPABASE_URL`
 * and `SUPABASE_ANON_KEY` are injected automatically into every Edge Function's
 * environment; they don't need to be set as secrets here.
 *
 * Modelled on `funded`'s shipped `src/app/api/bug-report/route.ts` (see this
 * project's #68/#69 and docs/lessons.md (Supabase) for why that file was read directly rather than
 * re-derived) — same auth-re-derivation shape, same idempotent-label-create
 * reasoning, adapted to Deno/Edge Functions and this issue's own field set.
 */

const GITHUB_REPO_OWNER = 'mp3anthony';
const GITHUB_REPO_NAME = 'cartel';
const FROM_APP_LABEL = 'from-app';
const FROM_APP_LABEL_COLOR = 'C9A227'; // this app's own accent (tokens.ts), not funded's
const TITLE_FALLBACK_LENGTH = 60;
// #107: "Store missing?" reports from the Stores picker. No coordinates are ever
// accepted, read or written on this path.
const STORE_MISSING_LABEL = 'store-missing';
const STORE_MISSING_LABEL_COLOR = '1D76DB';
const STORE_FIELD_MAX_LENGTH = 80;
const STORE_CHAINS: Record<string, string> = {
  new_world: 'New World',
  paknsave: "PAK'nSAVE",
  four_square: 'Four Square',
  woolworths: 'Woolworths',
  freshchoice: 'FreshChoice',
  unsure: 'Not sure',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

type FeedbackType = 'bug' | 'feature';

type SubmitPayload = {
  type: FeedbackType | 'store_missing';
  /** #107, store_missing only. */
  storeName?: string;
  chain?: string;
  area?: string;
  name?: string;
  title?: string;
  whatsHappening: string;
  whatShouldHappen: string;
  deviceOs: string;
  /** #70: a public Storage URL for an optionally-attached screenshot. Never
   * validated server-side beyond "is it a string" — the client already
   * validated file type/size before upload (`feedbackScreenshots.ts`), and
   * this function has no way to re-check an arbitrary URL's actual content
   * anyway. Worst case a bad value is a broken image link in the filed
   * issue, not a security problem: this is embedded as plain markdown, never
   * interpolated into anything executable. */
  screenshotUrl?: string;
  context: {
    appVersion: string;
    platform: string;
    screen: string;
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Partial<SubmitPayload> | null;

    const isStoreMissing = body?.type === 'store_missing';
    const type = body?.type === 'bug' || body?.type === 'feature' ? body.type : null;
    const storeName = typeof body?.storeName === 'string' ? sanitizeInline(body.storeName) : '';
    const chainKey =
      typeof body?.chain === 'string' && Object.hasOwn(STORE_CHAINS, body.chain) ? body.chain : null;
    const area = typeof body?.area === 'string' ? sanitizeInline(body.area) : '';
    const whatsHappening = typeof body?.whatsHappening === 'string' ? body.whatsHappening.trim() : '';
    const whatShouldHappen = typeof body?.whatShouldHappen === 'string' ? body.whatShouldHappen.trim() : '';
    const deviceOs = typeof body?.deviceOs === 'string' ? body.deviceOs.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const userTitle = typeof body?.title === 'string' ? body.title.trim() : '';
    const screenshotUrl = typeof body?.screenshotUrl === 'string' ? body.screenshotUrl.trim() : '';
    const context = {
      appVersion: contextField(body?.context?.appVersion),
      platform: contextField(body?.context?.platform),
      screen: contextField(body?.context?.screen),
    };

    if (isStoreMissing) {
      if (!storeName || storeName.length > STORE_FIELD_MAX_LENGTH) {
        return json({ error: `Store name is required (up to ${STORE_FIELD_MAX_LENGTH} characters).` }, 400);
      }
      if (area.length > STORE_FIELD_MAX_LENGTH) {
        return json({ error: `Suburb or street must be ${STORE_FIELD_MAX_LENGTH} characters or fewer.` }, 400);
      }
    } else if (!type || !whatsHappening || !whatShouldHappen || !deviceOs) {
      return json({ error: 'Type, "what\'s happening", "what should happen", and device/OS are all required.' }, 400);
    }

    // ── Auth: re-derive the caller from their session token, never trust it as given ──
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('report-feedback: SUPABASE_URL/SUPABASE_ANON_KEY missing from function env');
      return json({ error: 'Feedback reporting is misconfigured on the server.' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const githubToken = Deno.env.get('GITHUB_BUG_REPORT_TOKEN');
    if (!githubToken) {
      console.error('report-feedback: GITHUB_BUG_REPORT_TOKEN is not configured');
      return json({ error: 'Feedback reporting is not configured on the server. Please try again later.' }, 500);
    }

    const githubHeaders = {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };

    // ── Ensure each label exists before referencing it. GitHub's "create an issue"
    // endpoint does not auto-create a missing label — a reference to one that
    // doesn't exist fails the whole request. A 422 "already_exists" is the
    // expected, safe-to-ignore outcome from every call after the first. `bug` and
    // `enhancement` are GitHub's own repo defaults and are never created here. ──
    async function ensureLabel(labelName: string, color: string, description: string) {
      try {
        const labelResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/labels`,
          {
            method: 'POST',
            headers: githubHeaders,
            body: JSON.stringify({ name: labelName, color, description }),
          },
        );
        if (!labelResponse.ok && labelResponse.status !== 422) {
          console.error(`report-feedback: failed to ensure ${labelName} label exists`, labelResponse.status, await labelResponse.text());
        }
      } catch (labelErr) {
        console.error(`report-feedback: error ensuring ${labelName} label exists`, labelErr);
      }
    }

    await ensureLabel(FROM_APP_LABEL, FROM_APP_LABEL_COLOR, 'Filed from the in-app feedback form');
    if (isStoreMissing) {
      await ensureLabel(STORE_MISSING_LABEL, STORE_MISSING_LABEL_COLOR, 'A Store missing from the catalog, reported in-app');
    }

    const footer = `Filed from the app by user ID \`${user.id}\`. App v${context.appVersion}, ${context.platform}, on ${context.screen}.`;

    let issueTitle: string;
    let issueLabels: string[];
    let bodyLines: string[];

    if (isStoreMissing) {
      issueTitle = `Store missing: ${storeName}`;
      issueLabels = [FROM_APP_LABEL, STORE_MISSING_LABEL];
      bodyLines = [
        `**Store:** ${storeName}`,
        `**Chain:** ${chainKey ? STORE_CHAINS[chainKey] : 'Not given'}`,
        `**Suburb or street:** ${area || 'Not given'}`,
        '',
        '---',
        footer,
      ];
    } else {
      issueTitle = userTitle || truncate(whatsHappening, TITLE_FALLBACK_LENGTH);
      issueLabels = [FROM_APP_LABEL, type === 'bug' ? 'bug' : 'enhancement'];
      bodyLines = [
        `**Type:** ${type === 'bug' ? 'Bug' : 'Feature'}`,
        name ? `**From:** ${name}` : null,
        '',
        "**What's happening**",
        whatsHappening,
        '',
        '**What should happen**',
        whatShouldHappen,
        '',
        '**Device / OS**',
        deviceOs,
        '',
        screenshotUrl ? `![Screenshot](${screenshotUrl})` : null,
        screenshotUrl ? '' : null,
        '---',
        footer,
      ].filter((line): line is string => line !== null);
    }

    const issueResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`,
      {
        method: 'POST',
        headers: githubHeaders,
        body: JSON.stringify({
          title: issueTitle,
          body: bodyLines.join('\n'),
          labels: issueLabels,
        }),
      },
    );

    if (!issueResponse.ok) {
      const errText = await issueResponse.text().catch(() => '');
      console.error('report-feedback: GitHub issue creation failed', issueResponse.status, errText);
      return json({ error: `Failed to file this with GitHub (status ${issueResponse.status}).` }, 502);
    }

    return json({ success: true });
  } catch (error) {
    console.error('report-feedback: unhandled error', error);
    return json({ error: 'Internal server error' }, 500);
  }
});

/**
 * Neutralises user text bound for a GitHub issue title or single-line body field:
 * collapses all whitespace (so no new lines can be injected), strips characters that
 * form markup or links, and breaks `@mention` and `#123` autolinks with a zero-width
 * space. Length caps must be applied to the result, not the raw input.
 */
function sanitizeInline(text: string): string {
  return text
    .replace(/[<>[\]()`]/g, '')
    .replace(/[@#]/g, (char) => `${char}​`)
    .replace(/\s+/g, ' ')
    .trim();
}

const CONTEXT_FIELD_MAX_LENGTH = 100;

/** Footer context strings: single line, capped, so nothing can follow the '---'. */
function contextField(value: unknown): string {
  if (typeof value !== 'string') {
    return 'unknown';
  }
  const collapsed = value.replace(/\s+/g, ' ').trim().slice(0, CONTEXT_FIELD_MAX_LENGTH);
  return collapsed || 'unknown';
}

/**
 * A ~60-char truncation, not a hard byte slice — cuts at the last whitespace
 * before the limit so the fallback title never ends mid-word, then appends an
 * ellipsis only when it actually shortened anything.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
