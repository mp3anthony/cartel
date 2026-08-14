import type { SupabaseClient } from '@supabase/supabase-js';

import { humanise, type Outcome } from './household';
import { normalizeItemName } from './locationItems';

/**
 * One supporting vote for a proposed correction to an item's location. There is
 * no `voter_id` on this type, and none reaches the client at all — this table
 * stores voter identity (migration 20260811000002's header explains why:
 * distinguishing an independent second confirmer requires it) but withholds it
 * from every SELECT grant, mirroring `locations.created_by` rather than
 * `location_items`' complete absence of a creator column. `locationId` is
 * likewise absent, matching `LocationItemRow`'s own precedent: every caller of
 * `loadLocationItemVotes` already scopes the query to one location.
 */
export type LocationItemVoteRow = {
  id: string;
  itemName: string;
  proposedSection: string;
  createdAt: string;
};

/** The database's spelling of the row above, kept separate so snake_case stops here. */
type LocationItemVoteRecord = {
  id: string;
  item_name: string;
  proposed_section: string;
  created_at: string;
};

/**
 * A distinct pending correction for one item: a proposed new section and how
 * many independent votes it currently has (always 1 in practice — the moment a
 * second, independent voter lands, `vote_location_item_correction` applies the
 * correction and deletes the vote rows in the same transaction, so a client can
 * essentially never observe 2). Kept as a real field rather than hard-coded to
 * 1 for correctness under the narrow, documented race
 * `vote_location_item_correction`'s own header accepts.
 */
export type PendingCorrection = {
  proposedSection: string;
  voteCount: number;
};

/**
 * All pending-correction vote rows recorded for one location, in no particular
 * order — same shape and same reasoning as `loadLocationItems`: callers group
 * this per item via `pendingCorrectionsForItemName` rather than reading it in
 * sequence.
 */
export async function loadLocationItemVotes(
  client: SupabaseClient,
  locationId: string,
): Promise<Outcome<LocationItemVoteRow[]>> {
  const { data, error } = await client
    .from('location_item_votes')
    .select('id, item_name, proposed_section, created_at')
    .eq('location_id', locationId);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as LocationItemVoteRecord[];

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      itemName: row.item_name,
      proposedSection: row.proposed_section,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Groups one item's vote rows into its distinct pending corrections, earliest
 * first. A linear scan, not a `Map` held across renders — same reasoning as
 * `sectionForItemName`: callers hold this per-screen, per-render, and a
 * location's pending-vote count is tens of rows at most.
 *
 * `currentSection` filters out any group whose proposed value already equals
 * the item's current section. In ordinary use this never matches anything (a
 * proposal identical to the current value is rejected server-side before it can
 * ever become a row — see `correction_matches_current` in
 * `vote_location_item_correction`'s header). It exists specifically to hide the
 * one documented, accepted race in that same header: an orphaned single vote
 * row that briefly proposes what is, by the time anyone reads it, already the
 * current value. Filtering it here means that harmless race is never visible in
 * the UI at all, not merely harmless in the database.
 */
export function pendingCorrectionsForItemName(
  votes: readonly LocationItemVoteRow[],
  itemName: string,
  currentSection: string,
): PendingCorrection[] {
  const key = normalizeItemName(itemName);
  const groups = new Map<string, { voteCount: number; earliestCreatedAt: string }>();

  for (const vote of votes) {
    if (vote.itemName !== key || vote.proposedSection === currentSection) {
      continue;
    }
    const existing = groups.get(vote.proposedSection);
    if (existing) {
      existing.voteCount += 1;
      if (vote.createdAt < existing.earliestCreatedAt) {
        existing.earliestCreatedAt = vote.createdAt;
      }
    } else {
      groups.set(vote.proposedSection, { voteCount: 1, earliestCreatedAt: vote.createdAt });
    }
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[1].earliestCreatedAt.localeCompare(b[1].earliestCreatedAt))
    .map(([proposedSection, { voteCount }]) => ({ proposedSection, voteCount }));
}

/**
 * Casts one vote for a proposed correction to an item's location — the same
 * call whether this is the first vote for a tuple (a "propose") or a second,
 * independent one (a "confirm"); the server has no separate code path for
 * either (migration 20260811000002's header). Routes through the
 * `security definer` RPC `vote_location_item_correction`, never a direct table
 * write — this table has no INSERT grant for `authenticated` at all, and
 * `location_items.section` has no UPDATE grant either; the function is the only
 * way either row changes.
 *
 * Unlike `tagItemLocation`'s lenient treatment of a losing race, every error
 * here — including a rejected re-vote by the same user (`already_voted`), a
 * proposal identical to the current value (`correction_matches_current`), or a
 * correction proposed against an untagged item (`item_not_tagged`) — is
 * surfaced to the caller via `humanise()`, not swallowed. None of these are
 * benign races the caller's own refresh already resolves; each means nothing
 * happened toward the correction the caller intended.
 */
/** One location's count of distinct pending corrections — the Dashboard's
 * (#23) "Pending corrections" widget. */
export type PendingCorrectionCount = {
  locationId: string;
  count: number;
};

/**
 * Counts distinct pending `(item_name, proposed_section)` corrections across
 * several locations at once — `loadLocationItemVotes` above stays
 * single-location because every existing caller (`ShoppingScreen`) already
 * has exactly one location in view; the Dashboard is the first caller that
 * needs several at once, for whichever locations the current household
 * actually shops at.
 *
 * `location_item_votes` carries no household or user column at all (global,
 * like `location_items` itself — 03-SPEC.md § 0's location-global/
 * household-private separation), so "the current household's" pending
 * corrections has no direct query. The caller is expected to pass the
 * locations that are actually relevant to it (its lists' attached locations,
 * its shop history) — this function just counts within whatever set it's
 * given.
 *
 * Deliberately simpler than `pendingCorrectionsForItemName`: it does not
 * filter out a proposal that already matches an item's *current* section.
 * That filter needs each item's current `location_items.section`, which
 * would mean loading every relevant location's full item set just to
 * produce a dashboard summary count. `pendingCorrectionsForItemName`'s own
 * doc comment already frames that race as rare and self-healing (the next
 * vote or read clears it); a dashboard nudge that's very occasionally off
 * by one during that window is an acceptable trade for not pulling in a
 * second table's worth of data. The authoritative view stays
 * `ShoppingScreen`, unaffected by this simplification.
 */
export async function loadPendingCorrectionCounts(
  client: SupabaseClient,
  locationIds: readonly string[],
): Promise<Outcome<PendingCorrectionCount[]>> {
  if (locationIds.length === 0) {
    return { ok: true, value: [] };
  }

  const { data, error } = await client
    .from('location_item_votes')
    .select('location_id, item_name, proposed_section')
    .in('location_id', locationIds);

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  const rows = (data ?? []) as unknown as {
    location_id: string;
    item_name: string;
    proposed_section: string;
  }[];

  const tuplesByLocation = new Map<string, Set<string>>();
  for (const row of rows) {
    const tuples = tuplesByLocation.get(row.location_id) ?? new Set<string>();
    tuples.add(`${row.item_name} ${row.proposed_section}`);
    tuplesByLocation.set(row.location_id, tuples);
  }

  return {
    ok: true,
    value: Array.from(tuplesByLocation, ([locationId, tuples]) => ({
      locationId,
      count: tuples.size,
    })),
  };
}

export async function voteLocationItemCorrection(
  client: SupabaseClient,
  locationId: string,
  itemName: string,
  proposedSection: string,
): Promise<Outcome<void>> {
  const { error } = await client.rpc('vote_location_item_correction', {
    p_location_id: locationId,
    p_item_name: itemName,
    p_proposed_section: proposedSection,
  });

  if (error) {
    return { ok: false, message: humanise(error) };
  }

  return { ok: true, value: undefined };
}
