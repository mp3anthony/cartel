import type { SupabaseClient } from '@supabase/supabase-js';

export type Household = {
  id: string;
  name: string;
};

export type HouseholdState =
  | { status: 'none' }
  | { status: 'member'; household: Household; memberCount: number };

export type Invite = {
  code: string;
  expiresAt: string;
};

export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * The database raises bare machine-readable codes; this is where they become
 * something a person can act on. Doing the translation here rather than in each
 * screen keeps the wording consistent and means a new caller cannot accidentally
 * surface `invalid_or_expired_code` to a user.
 *
 * Anything unrecognised falls through with its own text rather than a generic
 * "something went wrong" — an unfamiliar error is exactly when detail is worth most.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Your session expired. Restart the app to continue.',
  already_in_household:
    'You are already in a household. Leave it before joining another.',
  not_in_household: 'You need to be in a household first.',
  invalid_or_expired_code:
    "That code isn't valid. Codes are single-use and expire after 24 hours.",
  could_not_generate_code: 'Could not generate a code just now. Try again.',
};

function humanise(error: { message: string }): string {
  for (const [code, message] of Object.entries(MESSAGES)) {
    if (error.message.includes(code)) {
      return message;
    }
  }

  return error.message;
}

export async function loadHouseholdState(
  client: SupabaseClient,
): Promise<Outcome<HouseholdState>> {
  // RLS scopes this to the caller's own household, so no filter is needed here and
  // adding one would imply the query is trusted to do the scoping. It is not.
  const { data, error } = await client
    .from('household_members')
    .select('household_id, households(id, name)');

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  if (!data || data.length === 0) {
    return { ok: true, value: { status: 'none' } };
  }

  const household = data[0].households as unknown as Household | null;

  if (!household) {
    return {
      ok: false,
      message: 'Your membership points at a household that no longer exists.',
    };
  }

  return {
    ok: true,
    value: { status: 'member', household, memberCount: data.length },
  };
}

export async function createHousehold(
  client: SupabaseClient,
  name: string,
): Promise<Outcome<string>> {
  const { data, error } = await client.rpc('create_household', {
    household_name: name.trim(),
  });

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: data as string };
}

export async function createInvite(
  client: SupabaseClient,
): Promise<Outcome<Invite>> {
  const { data, error } = await client.rpc('create_invite');

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const invite = data as { code: string; expires_at: string };

  return { ok: true, value: { code: invite.code, expiresAt: invite.expires_at } };
}

export async function redeemInvite(
  client: SupabaseClient,
  code: string,
): Promise<Outcome<string>> {
  const { data, error } = await client.rpc('redeem_invite', {
    invite_code: code,
  });

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: data as string };
}
