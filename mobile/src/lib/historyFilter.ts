/**
 * The History filter (#216): what the route params of `History` mean. Pure, with no imports
 * beyond types, so `scripts/check-history-filter.mjs` can run it directly in Node.
 *
 * Params travel in the URL and so can be hand-written. Each part is validated on its own and
 * a bad part is dropped, never thrown on: a broken link shows the unfiltered History.
 *
 * Dates are local calendar dates (YYYY-MM-DD) built from getFullYear/getMonth/getDate, never
 * `toISOString`, which would shift the day in a zone ahead of UTC (NZ).
 */

export type HistoryPeriod = 'week' | 'month';

export type HistoryParams = {
  period?: HistoryPeriod;
  /** Local YYYY-MM-DD: a Monday for a week, the 1st for a month. */
  start?: string;
  /** Comma-separated Store (location) ids. */
  stores?: string;
};

export type HistoryFilter = {
  /** The period, or null when only Stores filter. `to` is null when it holds `now` (no end). */
  range: { period: HistoryPeriod; start: string; from: Date; to: Date | null } | null;
  storeIds: string[];
};

export const MAX_FILTER_STORES = 50;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pad = (n: number) => String(n).padStart(2, '0');

/** A local calendar date as YYYY-MM-DD. */
export function toDateParam(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocalDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function parseRange(params: HistoryParams, now: Date): HistoryFilter['range'] {
  if (params.period !== 'week' && params.period !== 'month') {
    return null;
  }
  const from = parseLocalDate(params.start);
  if (!from) {
    return null;
  }
  let to: Date;
  if (params.period === 'week') {
    if (from.getDay() !== 1) {
      return null;
    }
    // Calendar arithmetic, not +7*24h: a week is not always 168 hours across DST.
    to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
  } else {
    if (from.getDate() !== 1) {
      return null;
    }
    to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  }
  // The period that holds now has no end, as in `bucketShops` (a shop stamped after now,
  // from clock skew, counts in the current bucket).
  const holdsNow = from.getTime() <= now.getTime() && now.getTime() < to.getTime();
  return {
    period: params.period,
    start: params.start as string,
    from,
    to: holdsNow ? null : to,
  };
}

function parseStores(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }
  const ids = new Set<string>();
  for (const part of value.split(',')) {
    const id = part.trim().toLowerCase();
    if (UUID_PATTERN.test(id)) {
      ids.add(id);
    }
  }
  // Too many to be a real tail: drop the Store part rather than silently truncate it.
  return ids.size > MAX_FILTER_STORES ? [] : [...ids];
}

/** Null when nothing valid is left (History is then unfiltered). Never throws. */
export function parseHistoryFilter(
  params: HistoryParams | null | undefined,
  now: Date,
): HistoryFilter | null {
  if (params === null || typeof params !== 'object') {
    return null;
  }
  const range = parseRange(params, now);
  const storeIds = parseStores(params.stores);
  return range === null && storeIds.length === 0 ? null : { range, storeIds };
}

/** A stable string for effect dependencies: equal filters give equal keys. */
export function historyFilterKey(filter: HistoryFilter | null): string {
  if (filter === null) {
    return '';
  }
  const range = filter.range ? `${filter.range.period}:${filter.range.start}` : '';
  return `${range}|${[...filter.storeIds].sort().join(',')}`;
}

/**
 * The chip's text (without "Clear") and the screen-reader label. Several Stores can only come
 * from the "Other stores" slice or legend row, so they read as "Other stores".
 */
export function filterLabel(
  filter: HistoryFilter,
  nameFor: (locationId: string) => string,
  locale?: string,
): { text: string; accessibilityLabel: string } {
  const parts: string[] = [];
  if (filter.range) {
    parts.push(
      filter.range.period === 'week'
        ? `Week of ${filter.range.from.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
        : filter.range.from.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
    );
  }
  if (filter.storeIds.length === 1) {
    parts.push(nameFor(filter.storeIds[0]));
  } else if (filter.storeIds.length > 1) {
    parts.push('Other stores');
  }
  const text = parts.join(' · ');
  return { text, accessibilityLabel: `Showing shops for ${text}. Clear filter` };
}
