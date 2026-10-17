// Fails if Home's graph data shaping drifts (#215).
// Usage: node scripts/check-shop-frequency.mjs   (before a PR; not in CI)
//        TZ=Pacific/Auckland node scripts/check-shop-frequency.mjs   (also run with this)
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks mobile/src/lib/shopFrequency.ts (week and month buckets, per-Store counts, stacked
// segments) and mobile/src/lib/storeColors.ts (the shared Store colour rule).
// Does NOT check: the components that draw them, or the labels and screen-reader text.
import { isDeepStrictEqual } from 'node:util';

import { bucketShops, stackBucket } from '../mobile/src/lib/shopFrequency.ts';
import { assignStoreColors, mixWithSurface, OTHER_KEY } from '../mobile/src/lib/storeColors.ts';

const failures = [];
const show = (v) => JSON.stringify(v);
function expect(label, got, want) {
  if (!isDeepStrictEqual(got, want)) failures.push(`${label}: got ${show(got)}, want ${show(want)}`);
}

const shop = (locationId, iso) => ({ locationId, completedAt: iso });
const localISO = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const ymd = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours()];

// Weeks: Monday start. Wed 2026-10-14 12:00 local is in the week of Mon 2026-10-12.
const now = new Date(2026, 9, 14, 12);
const weeks = bucketShops([], now, 'week', 8);
expect('week count', weeks.length, 8);
expect('current week starts Monday 00:00', ymd(weeks[7].start), [2026, 10, 12, 0]);
expect('first week starts 7 weeks earlier', ymd(weeks[0].start), [2026, 8, 24, 0]);
expect('weeks all start on a Monday at 00:00', weeks.every((b) => b.start.getDay() === 1 && b.start.getHours() === 0), true);
expect('empty buckets', weeks.every((b) => b.count === 0 && isDeepStrictEqual(b.byLocation, {})), true);

// Sunday now still belongs to the week that started the previous Monday.
expect('Sunday is in the Monday-start week', ymd(bucketShops([], new Date(2026, 9, 18, 9), 'week', 1)[0].start), [2026, 10, 12, 0]);

// Shop placement, drops and counts.
const placed = bucketShops(
  [
    shop('a', localISO(2026, 10, 12, 0)), // exactly at the current week's start
    shop('a', localISO(2026, 10, 11, 23)), // Sunday night: previous week
    shop('b', localISO(2026, 10, 13)),
    shop('b', localISO(2026, 10, 13)),
    shop('c', localISO(2026, 8, 20)), // before the first bucket: dropped
    shop('a', localISO(2026, 10, 20)), // future (clock skew): current bucket
    shop('a', 'not a date'), // unparseable: skipped
  ],
  now,
  'week',
  8,
);
expect('current week count', placed[7].count, 4);
expect('current week byLocation', placed[7].byLocation, { a: 2, b: 2 });
expect('previous week', [placed[6].count, placed[6].byLocation], [1, { a: 1 }]);
expect('older shop dropped', placed.reduce((s, b) => s + b.count, 0), 5);
expect('unparseable skipped, c absent', placed.some((b) => 'c' in b.byLocation), false);
expect(
  'byLocation sums equal count',
  placed.every((b) => Object.values(b.byLocation).reduce((s, n) => s + n, 0) === b.count),
  true,
);

// DST week in Pacific/Auckland (clocks went forward Sun 2026-09-27; the Monday after is
// still local midnight, not 01:00 or 23:00). Meaningful only with TZ=Pacific/Auckland, but
// the invariant (every bucket starts Monday 00:00 local) holds in any zone.
const dstNow = new Date(2026, 9, 7, 12);
const dst = bucketShops([], dstNow, 'week', 8);
expect('DST: every week starts Monday 00:00 local', dst.every((b) => b.start.getDay() === 1 && b.start.getHours() === 0 && b.start.getMinutes() === 0), true);
expect('DST: week after the change', ymd(dst[7].start), [2026, 10, 5, 0]);
expect('DST: week of the change', ymd(dst[6].start), [2026, 9, 28, 0]);
expect('DST: week before the change', ymd(dst[5].start), [2026, 9, 21, 0]);
const dstShops = bucketShops(
  [shop('a', localISO(2026, 9, 28, 0)), shop('a', localISO(2026, 9, 27, 23))],
  dstNow,
  'week',
  8,
);
expect('DST: Monday 00:00 lands in its own week, Sunday 23:00 in the last', [dstShops[6].count, dstShops[5].count], [1, 1]);

// Months across a year boundary.
const months = bucketShops(
  [shop('a', localISO(2026, 1, 1, 0)), shop('b', localISO(2025, 12, 31, 23)), shop('b', localISO(2025, 8, 31)), shop('c', localISO(2025, 7, 15))],
  new Date(2026, 1, 10, 12),
  'month',
  6,
);
expect('month starts', months.map((b) => ymd(b.start).slice(0, 3)), [
  [2025, 9, 1],
  [2025, 10, 1],
  [2025, 11, 1],
  [2025, 12, 1],
  [2026, 1, 1],
  [2026, 2, 1],
]);
expect('December and January counts', [months[3].count, months[4].count, months[3].byLocation, months[4].byLocation], [1, 1, { b: 1 }, { a: 1 }]);
expect('shops before the window are dropped', months.reduce((s, b) => s + b.count, 0), 2);

// stackBucket: rank order, tail merged, empty, sums.
const palette = { accent: '#C2410C', surface: '#FFFFFF', border: '#DDDDDD' };
const fixture = [
  { key: 's1', value: 10, chainHex: '#E11A2C' },
  { key: 's2', value: 8, chainHex: null },
  { key: 's3', value: 6, chainHex: '#007837' },
  { key: 's4', value: 5, chainHex: null },
  { key: 's5', value: 4, chainHex: '#FFD600' },
  { key: 's6', value: 3, chainHex: '#007837' },
  { key: 's7', value: 2, chainHex: null },
];
const { ranked, otherColor } = assignStoreColors(fixture, palette);
const byKey = new Map(ranked.map((r) => [r.key, r]));
const colorFor = (id) => {
  const entry = byKey.get(id);
  return entry?.named ? { key: id, color: entry.color, rank: entry.rank } : { key: OTHER_KEY, color: otherColor, rank: 5 };
};
const bucket = (byLocation) => ({
  start: new Date(2026, 9, 12),
  count: Object.values(byLocation).reduce((s, n) => s + n, 0),
  byLocation,
});
const stacked = stackBucket(bucket({ s7: 1, s3: 2, s1: 3, s6: 1 }), colorFor);
expect('stack order by rank', stacked.map((s) => s.key), ['s1', 's3', OTHER_KEY]);
expect('tail merged into one segment', stacked.find((s) => s.key === OTHER_KEY)?.count, 2);
expect('tail uses the neutral colour', stacked.find((s) => s.key === OTHER_KEY)?.color, palette.border);
expect('segment counts sum to bucket count', stacked.reduce((s, x) => s + x.count, 0), 7);
expect('empty bucket has no segments', stackBucket(bucket({}), colorFor), []);
expect('only a tail store is one other segment', stackBucket(bucket({ s6: 2, s7: 1 }), colorFor).map((s) => [s.key, s.count]), [[OTHER_KEY, 3]]);
expect('bar rank order is by shops, not by id', stackBucket(bucket({ s5: 1, s1: 1 }), colorFor).map((s) => s.key), ['s1', 's5']);

// assignStoreColors.
expect('ranked order', ranked.map((r) => r.key), ['s1', 's2', 's3', 's4', 's5', 's6', 's7']);
expect('chain hex wins', [byKey.get('s1').color, byKey.get('s3').color, byKey.get('s5').color], ['#E11A2C', '#007837', '#FFD600']);
// The tint ramp is the original buildArcs rule: ratio = rank / 5 toward the surface.
expect('no-chain rank 1 tint', byKey.get('s2').color, mixWithSurface(palette.accent, palette.surface, 1 / 5));
expect('no-chain rank 3 tint', byKey.get('s4').color, mixWithSurface(palette.accent, palette.surface, 3 / 5));
expect('tint literals (old buildArcs output)', [byKey.get('s2').color, byKey.get('s4').color], ['#ce673d', '#e7b39e']);
expect('rank 6+ gets the other colour even with a chain', [byKey.get('s6').color, byKey.get('s7').color], [palette.border, palette.border]);
expect('named flags', ranked.map((r) => r.named), [true, true, true, true, true, false, false]);
expect('otherColor is the border', otherColor, palette.border);
expect(
  'equal counts keep a stable order (by key)',
  assignStoreColors(
    [
      { key: 'b', value: 3, chainHex: null },
      { key: 'a', value: 3, chainHex: null },
      { key: 'c', value: 3, chainHex: null },
    ],
    palette,
  ).ranked.map((r) => r.key),
  ['a', 'b', 'c'],
);
expect('maxNamed is respected', assignStoreColors(fixture, palette, 2).ranked.map((r) => r.named), [true, true, false, false, false, false, false]);
expect('empty input', assignStoreColors([], palette).ranked, []);
expect('mixWithSurface 0 and 1', [mixWithSurface('#112233', '#FFFFFF', 0), mixWithSurface('#112233', '#FFFFFF', 1)], ['#112233', '#ffffff']);

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} check(s) failed`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK: shop buckets, stacked segments and Store colours match the rules.');
