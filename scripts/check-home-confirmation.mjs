// Fails if Home's one-time confirmation store or the Home landing plan drift (#103).
// Usage: node scripts/check-home-confirmation.mjs   (before a PR; not in CI)
//        TZ=Pacific/Auckland node scripts/check-home-confirmation.mjs   (also run with this)
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks mobile/src/lib/homeConfirmation.ts (set/peek/clear, replacement ids, TTL, the three
// banner strings) and planHomeLanding in mobile/src/navigation/homeLanding.ts.
// Does NOT check: backToHome's dispatch, the screens' focus/blur wiring, the Banner or any
// real navigation (Safari Back, reload).
import { isDeepStrictEqual } from 'node:util';

import {
  clearHomeConfirmation,
  HOME_CONFIRMATION_TTL_MS,
  LIST_RESET,
  peekHomeConfirmation,
  SHOP_RECORDED_CONTINUE,
  SHOP_RECORDED_DONE,
  setHomeConfirmation,
} from '../mobile/src/lib/homeConfirmation.ts';
import { planHomeLanding } from '../mobile/src/navigation/homeLanding.ts';

const failures = [];
const show = (v) => JSON.stringify(v);
function expect(label, got, want) {
  if (!isDeepStrictEqual(got, want)) failures.push(`${label}: got ${show(got)}, want ${show(want)}`);
}

const T0 = 1_000_000;

// Store.
expect('empty peek', peekHomeConfirmation(T0), null);
const first = setHomeConfirmation('one', T0);
expect('set returns the entry', first.message, 'one');
expect('peek returns it', peekHomeConfirmation(T0 + 1)?.message, 'one');
expect('peek twice does not consume', peekHomeConfirmation(T0 + 2)?.id, first.id);
const second = setHomeConfirmation('two', T0 + 10);
expect('second set replaces', peekHomeConfirmation(T0 + 11)?.message, 'two');
expect('second set has a higher id', second.id > first.id, true);
clearHomeConfirmation();
expect('clear empties', peekHomeConfirmation(T0 + 12), null);

setHomeConfirmation('ttl', T0);
expect('valid at the TTL edge', peekHomeConfirmation(T0 + HOME_CONFIRMATION_TTL_MS)?.message, 'ttl');
expect('expired after the TTL', peekHomeConfirmation(T0 + HOME_CONFIRMATION_TTL_MS + 1), null);
expect('expiry drops the entry', peekHomeConfirmation(T0 + 1), null);
clearHomeConfirmation();

// Strings.
const strings = [SHOP_RECORDED_DONE, SHOP_RECORDED_CONTINUE, LIST_RESET];
expect('strings non-empty', strings.every((s) => typeof s === 'string' && s.length > 0), true);
expect('strings distinct', new Set(strings).size, 3);

// Landing plan.
const names = (...n) => n.map((name) => ({ name }));
const POP = { kind: 'popTo' };
const RESET = { kind: 'reset', routes: [{ name: 'Dashboard' }], index: 0 };
expect('pop: Dashboard, ListDetail, Shopping', planHomeLanding(names('Dashboard', 'ListDetail', 'Shopping')), POP);
expect('pop: ...Shopping, Locations', planHomeLanding(names('Dashboard', 'ListDetail', 'Shopping', 'Locations')), POP);
expect('pop: Dashboard, Shopping', planHomeLanding(names('Dashboard', 'Shopping')), POP);
expect('pop: Dashboard, History, Dashboard, Shopping', planHomeLanding(names('Dashboard', 'History', 'Dashboard', 'Shopping')), POP);
expect('reset: Shopping alone', planHomeLanding(names('Shopping')), RESET);
expect('reset: ListDetail, Shopping', planHomeLanding(names('ListDetail', 'Shopping')), RESET);

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} check(s) failed`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK: Home confirmation store and landing plan match the rules.');
