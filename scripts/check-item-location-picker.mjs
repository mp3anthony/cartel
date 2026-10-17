// Fails if the Item location picker's rules drift (#154).
// Usage: node scripts/check-item-location-picker.mjs   (before a PR; not in CI)
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks mobile/src/lib/itemLocationPicker.ts: chip list and current-chip marking,
// the Store's used aisle numbers, the aisle number control, the no-op check and the
// report body. Does NOT check: the component or the screen wiring.
import { isDeepStrictEqual } from 'node:util';

import {
  isSameAsCurrent,
  nudgeAisle,
  parseAisleDraft,
  pickerChips,
  usedAisleNumbers,
  withStoreLine,
} from '../mobile/src/lib/itemLocationPicker.ts';
import { LAYOUT_ORDER_SEQUENCE, MAX_AISLE, parseLayoutLabel } from '../mobile/src/lib/layoutOrder.ts';
import { foldItemName } from '../mobile/src/lib/itemName.ts';

const failures = [];
const show = (v) => JSON.stringify(v);
function expect(label, got, want) {
  if (!isDeepStrictEqual(got, want)) failures.push(`${label}: got ${show(got)}, want ${show(want)}`);
}

const parse = (label) => parseLayoutLabel(label, foldItemName);
const chipName = (c) => (c.kind === 'aisles' ? 'Aisles' : c.label);
const currentOf = (current) => pickerChips(current, parse, LAYOUT_ORDER_SEQUENCE).filter((c) => c.isCurrent).map(chipName);

// pickerChips: sequence order, Aisles between Chilled and Frozen.
const none = pickerChips(null, parse, LAYOUT_ORDER_SEQUENCE);
expect('chip order', none.map(chipName), [
  'Fruit & Veg', 'Butchery', 'Seafood', 'Deli', 'Bakery', 'Dairy', 'Chilled', 'Aisles',
  'Frozen', 'Health & Beauty', 'Pharmacy', 'Beer & Wine',
]);
expect('12 chips', none.length, 12);
expect('null marks nothing', currentOf(null), []);
expect('Dairy marks only Dairy', currentOf('Dairy'), ['Dairy']);
expect('Aisle 22 marks Aisles', currentOf('Aisle 22'), ['Aisles']);
expect('legacy Cleaning marks nothing', currentOf('Cleaning'), []);
expect('empty marks nothing', currentOf(''), []);
expect('loose dairy', currentOf('dairy'), ['Dairy']);
expect('loose dairy section', currentOf('dairy section'), ['Dairy']);
expect('loose aisle 04', currentOf('aisle 04'), ['Aisles']);
expect('Aisle 4a marks nothing', currentOf('Aisle 4a'), []);

// usedAisleNumbers.
expect(
  'used aisles distinct, numeric, unparseable skipped',
  usedAisleNumbers(['Aisle 22', 'Aisle 2', 'Dairy', 'Aisle 20', 'Aisle 2', 'Aisle 4a', 'aisle 04'], parse),
  [2, 4, 20, 22],
);
expect('used aisles empty', usedAisleNumbers([], parse), []);
expect('used aisles none match', usedAisleNumbers(['Dairy', 'Cleaning'], parse), []);

// parseAisleDraft.
for (const [text, want] of [
  ['7', 7], ['07', 7], ['999', 999], ['1', 1], [' 7 ', 7],
  ['0', null], ['000', null], ['1000', null], ['', null], ['   ', null], ['4a', null],
  ['-5', null], ['2.5', null], ['1e2', null], ['٣', null],
]) {
  expect(`parseAisleDraft(${show(text)})`, parseAisleDraft(text, MAX_AISLE), want);
}

// nudgeAisle.
for (const [n, delta, want] of [
  [null, 1, 1], [null, -1, 1], [1, -1, 1], [1, 1, 2], [999, 1, 999], [999, -1, 998], [21, 1, 22], [21, -1, 20],
]) {
  expect(`nudgeAisle(${n}, ${delta})`, nudgeAisle(n, delta, MAX_AISLE), want);
}

// isSameAsCurrent.
for (const [label, current, want] of [
  ['Dairy', 'Dairy', true],
  ['Dairy', 'dairy section', true],
  ['Aisle 22', 'Aisle 22', true],
  ['Aisle 22', 'isle 022', true],
  ['Aisle 22', 'Aisle 20', false],
  ['Dairy', 'Deli', false],
  ['Dairy', 'Aisle 22', false],
  ['Dairy', 'Cleaning', false],
  ['Dairy', null, false],
  ['Aisle 22', null, false],
]) {
  expect(`isSameAsCurrent(${label}, ${current})`, isSameAsCurrent(label, current, parse), want);
}

// withStoreLine.
expect('withStoreLine', withStoreLine('New World Riccarton', 'Bulk bins'), 'Store: New World Riccarton\n\nBulk bins');

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} check(s) failed`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK: Item location picker chips, aisle control and report text match the rules.');
