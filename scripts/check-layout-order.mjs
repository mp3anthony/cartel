// Fails if Shopping Mode's Layout order drifts (#153).
// Usage: node scripts/check-layout-order.mjs   (before a PR; not in CI)
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks mobile/src/lib/layoutOrder.ts: label parsing (rules 1 and 2 of the C2 label
// migration, no synonym map), place comparison, and the end-to-end sort.
// Does NOT check: the screen wiring, or that the label rules match the SQL (the SQL
// is the reference; keep the two in step by hand).
import { isDeepStrictEqual } from 'node:util';

import {
  LAYOUT_ORDER_SEQUENCE,
  aisleLabel,
  compareLayoutPlaces,
  isAisleNumber,
  parseLayoutLabel,
  sortByLayoutOrder,
} from '../mobile/src/lib/layoutOrder.ts';
import { foldItemName } from '../mobile/src/lib/itemName.ts';

const failures = [];
const show = (v) => JSON.stringify(v);
function expect(label, got, want) {
  if (!isDeepStrictEqual(got, want)) failures.push(`${label}: got ${show(got)}, want ${show(want)}`);
}

const parse = (label) => parseLayoutLabel(label, foldItemName);
const dept = (label) => ({ kind: 'department', label });
const aisle = (n) => ({ kind: 'aisle', aisle: n, label: `Aisle ${n}` });
const NONE = { kind: 'none' };

// Sequence and small helpers.
expect('sequence length', LAYOUT_ORDER_SEQUENCE.length, 12);
expect('Aisle index', LAYOUT_ORDER_SEQUENCE.indexOf('Aisle'), 7);
expect('aisleLabel', aisleLabel(22), 'Aisle 22');
for (const [n, want] of [[1, true], [999, true], [0, false], [1000, false], [2.5, false], [NaN, false]]) {
  expect(`isAisleNumber(${n})`, isAisleNumber(n), want);
}

// parseLayoutLabel: every department canonical, then the forgiving spellings.
for (const d of LAYOUT_ORDER_SEQUENCE.filter((s) => s !== 'Aisle')) {
  expect(`parse ${d}`, parse(d), dept(d));
}
for (const [label, want] of [
  ['dairy section', 'Dairy'],
  ['DAIRY', 'Dairy'],
  ['the deli', 'Deli'],
  ['Deli counter', 'Deli'],
  ['fruit and veg', 'Fruit & Veg'],
  ['Health and Beauty', 'Health & Beauty'],
  ['frozen area', 'Frozen'],
  ['Dairy aisle', 'Dairy'],
  ['DÉLI', 'Deli'],
]) {
  expect(`parse ${label}`, parse(label), dept(want));
}
for (const [label, n] of [['aisle 4', 4], ['Isle 04', 4], ['aisle no. 4', 4], ['aisle #4', 4], ['Aisle 999', 999], ['Aisle 22', 22]]) {
  expect(`parse ${label}`, parse(label), aisle(n));
}
for (const label of ['Aisle 4a', 'Aisle 4-5', 'Aisle', 'Aisle 0', 'Aisle 1000', '15', 'Meat', 'Cleaning', 'Dali']) {
  expect(`parse ${label}`, parse(label), { kind: 'other', label, key: foldItemName(label) });
}
for (const label of [null, '', '   ']) {
  expect(`parse ${show(label)}`, parse(label), NONE);
}

// compareLayoutPlaces.
const full = [
  dept('Fruit & Veg'), dept('Butchery'), dept('Seafood'), dept('Deli'), dept('Bakery'), dept('Dairy'),
  dept('Chilled'), aisle(2), aisle(20), aisle(22), dept('Frozen'), dept('Health & Beauty'),
  dept('Pharmacy'), dept('Beer & Wine'), parse('Cleaning'), NONE,
];
const shuffled = [7, 2, 13, 0, 15, 9, 4, 11, 1, 14, 6, 3, 12, 8, 5, 10].map((i) => full[i]);
expect('sorted full sequence', [...shuffled].sort(compareLayoutPlaces), full);
expect('other after Beer & Wine, before none', [parse('Zzz'), NONE, dept('Beer & Wine')].sort(compareLayoutPlaces), [
  dept('Beer & Wine'),
  parse('Zzz'),
  NONE,
]);
expect('others alphabetical', [parse('Zebra'), parse('Apple')].sort(compareLayoutPlaces).map((p) => p.label), ['Apple', 'Zebra']);
expect('same place is 0', compareLayoutPlaces(dept('Dairy'), dept('Dairy')), 0);
expect('same aisle is 0', compareLayoutPlaces(aisle(4), parse('isle 04')), 0);
expect('none vs none is 0', compareLayoutPlaces(NONE, NONE), 0);

// sortByLayoutOrder end to end.
const sort = (rows) =>
  sortByLayoutOrder(rows, { getName: (r) => r.n, getLabel: (r) => r.l, fold: foldItemName }).map((r) => r.n);
const r = (n, l) => ({ n, l });

expect(
  'alphabetical within department, mixed case and accents',
  sort([r('Yoghurt', 'Dairy'), r('apples', 'Fruit & Veg'), r('Éclair', 'Bakery'), r('bread', 'Bakery'), r('cheese', 'Dairy'), r('Banana', 'Fruit & Veg')]),
  ['apples', 'Banana', 'bread', 'Éclair', 'cheese', 'Yoghurt'],
);
expect(
  'dairy section and Dairy interleave',
  sort([r('milk', 'Dairy'), r('butter', 'dairy section'), r('cream', 'Dairy'), r('apple', 'DAIRY')]),
  ['apple', 'butter', 'cream', 'milk'],
);
expect(
  'aisles numeric not lexical',
  sort([r('a', 'Aisle 22'), r('b', 'Aisle 2'), r('c', 'Aisle 20'), r('d', 'isle 04')]),
  ['b', 'd', 'c', 'a'],
);
expect(
  'untagged last in input order',
  sort([r('zeta', null), r('milk', 'Dairy'), r('alpha', null), r('beer', 'Beer & Wine'), r('mid', '')]),
  ['milk', 'beer', 'zeta', 'alpha', 'mid'],
);
expect(
  'unknown labels after standard, grouped by label',
  sort([r('x1', 'Meat'), r('beer', 'Beer & Wine'), r('y1', 'Cleaning'), r('x0', 'meat'), r('none', null), r('y0', 'Cleaning')]),
  ['beer', 'y0', 'y1', 'x0', 'x1', 'none'],
);
expect(
  'names that fold the same keep input order',
  sort([r('Milk', 'Dairy'), r('milk', 'Dairy'), r('MILK', 'Dairy')]),
  ['Milk', 'milk', 'MILK'],
);
expect(
  'full walk',
  sort([
    r('wine', 'Beer & Wine'), r('peas', 'Frozen'), r('soap', 'Aisle 9'), r('milk', 'Dairy'),
    r('beef', 'Butchery'), r('plasters', 'Pharmacy'), r('apples', 'Fruit & Veg'), r('shampoo', 'Health & Beauty'),
  ]),
  ['apples', 'beef', 'milk', 'soap', 'peas', 'shampoo', 'plasters', 'wine'],
);

const input = [r('b', 'Dairy'), r('a', null), r('c', 'Bakery')];
const before = structuredClone(input);
const out = sortByLayoutOrder(input, { getName: (x) => x.n, getLabel: (x) => x.l, fold: foldItemName });
expect('input not mutated', input, before);
expect('output is a new array', out !== input, true);
expect('empty array', sortByLayoutOrder([], { getName: (x) => x, getLabel: () => null, fold: foldItemName }), []);

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} check(s) failed`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('OK: Layout order labels, comparison and sort match the rules.');
