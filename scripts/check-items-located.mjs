// Fails if the History row text or the Items located wording drift (#229).
// Usage: node scripts/check-items-located.mjs   (before a PR; not in CI)
//        TZ=Pacific/Auckland node scripts/check-items-located.mjs   (also run with this)
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks mobile/src/lib/shopHistory.ts: the count wording (0, 1, many), a row's title,
// secondary line and spoken label (Store and list name, list name gone, Store missing, neither),
// and the date format under the current time zone.
// Does NOT check: the two queries (previous shop, location_items count), the hook, the
// pop-up or the layout; the window logic is verified against the database by hand.
import { isDeepStrictEqual } from 'node:util';

import { formatCompletedAt, itemsLocatedText, shopRowText } from '../mobile/src/lib/shopHistory.ts';

const failures = [];
const show = (v) => JSON.stringify(v);
function expect(label, got, want) {
  if (!isDeepStrictEqual(got, want)) failures.push(`${label}: got ${show(got)}, want ${show(want)}`);
}

expect('zero', itemsLocatedText(0), 'No items located');
expect('one', itemsLocatedText(1), '1 item located');
expect('two', itemsLocatedText(2), '2 items located');
expect('many', itemsLocatedText(37), '37 items located');

// Midnight UTC: the date is the local calendar day, whatever the zone.
const at = '2026-10-14T00:00:00+00:00';
const date = formatCompletedAt(at);
expect('date has the year', date.includes('2026'), true);

expect('store and list', shopRowText({ storeName: 'PAK\'nSAVE Papanui', listName: 'Weekly', completedAt: at }), {
  title: "PAK'nSAVE Papanui",
  secondary: `${date} · Weekly`,
  accessibilityLabel: `PAK'nSAVE Papanui, ${date} · Weekly, opens details`,
});
expect('list gone', shopRowText({ storeName: 'Countdown', listName: null, completedAt: at }), {
  title: 'Countdown',
  secondary: date,
  accessibilityLabel: `Countdown, ${date}, opens details`,
});
expect('empty list name counts as gone', shopRowText({ storeName: 'Countdown', listName: '', completedAt: at }).secondary, date);
expect('no store: list name is the title', shopRowText({ storeName: null, listName: 'Weekly', completedAt: at }), {
  title: 'Weekly',
  secondary: date,
  accessibilityLabel: `Weekly, ${date}, opens details`,
});
expect('neither', shopRowText({ storeName: null, listName: null, completedAt: at }), {
  title: 'Unknown store',
  secondary: date,
  accessibilityLabel: `Unknown store, ${date}, opens details`,
});

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('check-items-located: ok');
