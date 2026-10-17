// Fails if the History filter's parameter rules drift (#216).
// Usage: node scripts/check-history-filter.mjs   (before a PR; not in CI)
//        TZ=Pacific/Auckland node scripts/check-history-filter.mjs   (also run with this)
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks mobile/src/lib/historyFilter.ts (date params, week and month parsing, bad-part
// dropping, the open end of the current period, Store ids, the stable key and the chip text)
// against bucketShops in shopFrequency.ts.
// Does NOT check: the query in shopSessions.ts, the screen, the chip layout or the taps.
import { isDeepStrictEqual } from 'node:util';

import {
  filterLabel,
  historyFilterKey,
  MAX_FILTER_STORES,
  parseHistoryFilter,
  toDateParam,
} from '../mobile/src/lib/historyFilter.ts';
import { bucketShops } from '../mobile/src/lib/shopFrequency.ts';

const failures = [];
const show = (v) => JSON.stringify(v);
function expect(label, got, want) {
  if (!isDeepStrictEqual(got, want)) failures.push(`${label}: got ${show(got)}, want ${show(want)}`);
}

const now = new Date(2026, 9, 14, 12); // Wed 14 Oct 2026, local
const ymd = (d) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()] : d);
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

// toDateParam is the local calendar date (toISOString would shift the day under NZ).
expect('toDateParam local midnight', toDateParam(new Date(2026, 9, 12, 0)), '2026-10-12');
expect('toDateParam late evening', toDateParam(new Date(2026, 9, 12, 23, 59)), '2026-10-12');
expect('toDateParam pads', toDateParam(new Date(2026, 0, 5)), '2026-01-05');

// Week: must be a Monday.
const week = parseHistoryFilter({ period: 'week', start: '2026-10-05' }, now);
expect('past week from', ymd(week?.range?.from), [2026, 10, 5, 0]);
expect('past week to is next Monday', ymd(week?.range?.to), [2026, 10, 12, 0]);
expect('past week has no stores', week?.storeIds, []);
expect('non-Monday week rejected', parseHistoryFilter({ period: 'week', start: '2026-10-06' }, now), null);
expect('Sunday week rejected', parseHistoryFilter({ period: 'week', start: '2026-10-11' }, now), null);

// Month: must be the 1st.
const month = parseHistoryFilter({ period: 'month', start: '2026-09-01' }, now);
expect('month from', ymd(month?.range?.from), [2026, 9, 1, 0]);
expect('month to is the 1st of next', ymd(month?.range?.to), [2026, 10, 1, 0]);
expect('month not on the 1st rejected', parseHistoryFilter({ period: 'month', start: '2026-09-02' }, now), null);
const december = parseHistoryFilter({ period: 'month', start: '2025-12-01' }, now);
expect('December rolls the year', ymd(december?.range?.to), [2026, 1, 1, 0]);

// Bad dates and shapes never throw and drop the range.
for (const [label, params] of [
  ['impossible date', { period: 'month', start: '2026-02-30' }],
  ['month 13', { period: 'month', start: '2026-13-01' }],
  ['not a date', { period: 'week', start: 'monday' }],
  ['ISO timestamp', { period: 'week', start: '2026-10-05T00:00:00Z' }],
  ['unknown period', { period: 'year', start: '2026-01-01' }],
  ['period without start', { period: 'week' }],
  ['start without period', { start: '2026-10-05' }],
  ['numeric start', { period: 'week', start: 20261005 }],
  ['empty', {}],
]) {
  expect(`bad params: ${label}`, parseHistoryFilter(params, now), null);
}
expect('undefined params', parseHistoryFilter(undefined, now), null);
expect('null params', parseHistoryFilter(null, now), null);
expect('string params', parseHistoryFilter('week', now), null);

// Parts are independent: a bad range keeps good Stores and the other way round.
const storesOnly = parseHistoryFilter({ period: 'week', start: 'nope', stores: A }, now);
expect('bad range keeps stores', [storesOnly?.range, storesOnly?.storeIds], [null, [A]]);
const rangeOnly = parseHistoryFilter({ period: 'week', start: '2026-10-05', stores: 'not-a-uuid' }, now);
expect('bad stores keep range', [rangeOnly?.range?.start, rangeOnly?.storeIds], ['2026-10-05', []]);

// Store ids: UUIDs only, deduped, case folded, junk dropped.
expect('store dedupe and junk', parseHistoryFilter({ stores: `${A},zzz,${B},${A.toUpperCase()},` }, now)?.storeIds, [A, B]);
expect('empty stores string', parseHistoryFilter({ stores: '' }, now), null);
const many = Array.from({ length: MAX_FILTER_STORES + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
expect('too many stores dropped', parseHistoryFilter({ stores: many.join(',') }, now), null);
expect('exactly the max kept', parseHistoryFilter({ stores: many.slice(0, MAX_FILTER_STORES).join(',') }, now)?.storeIds.length, MAX_FILTER_STORES);

// The period that holds now has no end; a past or future one does.
expect('current week has no end', parseHistoryFilter({ period: 'week', start: '2026-10-12' }, now)?.range?.to, null);
expect('current month has no end', parseHistoryFilter({ period: 'month', start: '2026-10-01' }, now)?.range?.to, null);
expect('future week keeps its end', ymd(parseHistoryFilter({ period: 'week', start: '2026-10-19' }, now)?.range?.to), [2026, 10, 26, 0]);
expect(
  'a week is over at midnight Monday',
  parseHistoryFilter({ period: 'week', start: '2026-10-12' }, new Date(2026, 9, 19, 0, 0))?.range?.to !== null,
  true,
);

// DST (NZ moved clocks forward Sun 27 Sep 2026): the week of Mon 21 Sep still ends at local
// midnight Monday 28 Sep, not an hour off.
const dst = parseHistoryFilter({ period: 'week', start: '2026-09-21' }, now);
expect('DST week to', ymd(dst?.range?.to), [2026, 9, 28, 0]);
expect('DST week to is a Monday', dst?.range?.to?.getDay(), 1);

// The range agrees with bucketShops, including a future shop (clock skew).
const shop = (locationId, d) => ({ locationId, completedAt: d.toISOString() });
const shops = [
  shop('a', new Date(2026, 9, 12, 0, 0)), // current week start
  shop('a', new Date(2026, 9, 14, 11)),
  shop('b', new Date(2026, 9, 18, 23, 59)),
  shop('a', new Date(2026, 9, 21, 9)), // future: counts in the current bucket
  shop('b', new Date(2026, 9, 11, 23, 59)), // last week
  shop('a', new Date(2026, 9, 5, 0, 0)), // last week start
  shop('b', new Date(2026, 8, 28, 0, 0)), // week of 28 Sep
  shop('a', new Date(2026, 8, 27, 12)), // Sunday of the DST week
];
const inRange = (filter) =>
  shops.filter((s) => {
    const t = new Date(s.completedAt).getTime();
    const { from, to } = filter.range;
    return t >= from.getTime() && (to === null || t < to.getTime());
  }).length;
for (const bucket of bucketShops(shops, now, 'week', 8)) {
  const filter = parseHistoryFilter({ period: 'week', start: toDateParam(bucket.start) }, now);
  expect(`week ${toDateParam(bucket.start)} matches bucketShops`, filter ? inRange(filter) : null, bucket.count);
}
for (const bucket of bucketShops(shops, now, 'month', 6)) {
  const filter = parseHistoryFilter({ period: 'month', start: toDateParam(bucket.start) }, now);
  expect(`month ${toDateParam(bucket.start)} matches bucketShops`, filter ? inRange(filter) : null, bucket.count);
}

// Key: stable for equal filters whatever the id order, different for different ones.
const k1 = historyFilterKey(parseHistoryFilter({ period: 'week', start: '2026-10-05', stores: `${A},${B}` }, now));
const k2 = historyFilterKey(parseHistoryFilter({ period: 'week', start: '2026-10-05', stores: `${B},${A},${A}` }, now));
expect('key ignores id order and dupes', k1, k2);
expect('key differs by week', k1 === historyFilterKey(parseHistoryFilter({ period: 'week', start: '2026-09-28', stores: `${A},${B}` }, now)), false);
expect('key differs by stores', k1 === historyFilterKey(parseHistoryFilter({ period: 'week', start: '2026-10-05', stores: A }, now)), false);
expect('key of no filter', historyFilterKey(null), '');
expect('key is a string', typeof k1, 'string');

// Chip text (en-NZ).
const names = { [A]: "PAK'nSAVE Papanui", [B]: 'Countdown' };
const nameFor = (id) => names[id] ?? 'a store';
const label = (params) => filterLabel(parseHistoryFilter(params, now), nameFor, 'en-NZ');
expect('week label', label({ period: 'week', start: '2026-10-05' }).text, 'Week of 5 Oct');
expect('month label', label({ period: 'month', start: '2026-10-01' }).text, 'October 2026');
expect('week and store label', label({ period: 'week', start: '2026-10-05', stores: A }).text, "Week of 5 Oct · PAK'nSAVE Papanui");
expect('store-only label', label({ stores: B }).text, 'Countdown');
expect('several stores label', label({ period: 'month', start: '2026-09-01', stores: `${A},${B}` }).text, 'September 2026 · Other stores');
expect('unknown store label', label({ stores: '33333333-3333-4333-8333-333333333333' }).text, 'a store');
expect('accessibility label', label({ stores: B }).accessibilityLabel, 'Showing shops for Countdown. Clear filter');

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} check(s) failed`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK: History filter params, ranges and labels match the rules.');
