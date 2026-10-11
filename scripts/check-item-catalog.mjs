// Fails if the Item catalog's grouping, search or open/closed rules drift (#149).
// Usage: node scripts/check-item-catalog.mjs   (before a PR; not in CI)
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks mobile/src/lib/itemCatalog.ts, driven the way the screen drives it: rows shaped
// like the screen's CatalogRow (the item nested under `item`), read through accessors.
// Does NOT check: the screen itself (collapse wiring, live region, editor handling).
import { isDeepStrictEqual } from 'node:util';

import { buildCatalogGroups, isCatalogGroupOpen } from '../mobile/src/lib/itemCatalog.ts';
import { foldItemName } from '../mobile/src/lib/itemName.ts';

const failures = [];
const show = (v) => JSON.stringify(v);
function expect(label, got, want) {
  if (!isDeepStrictEqual(got, want)) failures.push(`${label}: got ${show(got)}, want ${show(want)}`);
}

const row = (id, name, section, corrections = 0) => ({
  item: { id, name, section },
  corrections: Array.from({ length: corrections }, (_, i) => ({ proposedSection: `P${i}` })),
});
const options = (query) => ({
  query,
  getName: (r) => r.item.name,
  getSection: (r) => r.item.section,
  hasPendingCorrection: (r) => r.corrections.length > 0,
  fold: foldItemName,
});
const rows = [
  row('1', 'oat milk', 'Dairy'),
  row('2', 'bread', 'Bakery'),
  row('3', 'milk', 'Dairy', 1),
  row('4', 'jalapeno', 'Fruit & Veg'),
  row('5', 'apples', 'Fruit & Veg', 2),
];
const summary = (groups) =>
  groups.map((g) => ({ section: g.section, ids: g.items.map((r) => r.item.id), dot: g.hasPendingCorrection }));
const build = (query, input = rows) => summary(buildCatalogGroups(input, options(query)));

// Empty query: everything, sections and names sorted.
expect('empty query', build(''), [
  { section: 'Bakery', ids: ['2'], dot: false },
  { section: 'Dairy', ids: ['3', '1'], dot: true },
  { section: 'Fruit & Veg', ids: ['5', '4'], dot: true },
]);

// The query arrives folded; stored names are matched after folding too.
expect('MILK matches milk and oat milk, drops empty groups', build(foldItemName('MILK')), [
  { section: 'Dairy', ids: ['3', '1'], dot: true },
]);
expect('jalapeno with a tilde', build(foldItemName('jalapeño')), [
  { section: 'Fruit & Veg', ids: ['4'], dot: false },
]);
expect('substring match', build('ilk').map((g) => g.section), ['Dairy']);

// Whitespace-only folds to '' and so is not a search.
expect('whitespace-only is not searching', foldItemName('   \t'), '');
expect('whitespace-only keeps every group', build(foldItemName('   ')).length, 3);

expect('no match gives []', build('zzz'), []);

// The dot only reflects kept items while searching.
expect(
  'non-matching correction does not set the dot while searching',
  build('oat').map((g) => [g.section, g.dot]),
  [['Dairy', false]],
);
expect('dot is set when browsing', build('').find((g) => g.section === 'Dairy').dot, true);

// Input is not mutated, in order or in content.
{
  const input = structuredClone(rows);
  const before = structuredClone(input);
  buildCatalogGroups(input, options('milk'));
  buildCatalogGroups(input, options(''));
  expect('input not mutated', input, before);
}

// Accessors, not field names, decide: a differently shaped row works.
{
  const flat = [
    { n: 'tea', s: 'Aisle 3', p: true },
    { n: 'coffee', s: 'Aisle 3', p: false },
  ];
  const groups = buildCatalogGroups(flat, {
    query: '',
    getName: (r) => r.n,
    getSection: (r) => r.s,
    hasPendingCorrection: (r) => r.p,
    fold: foldItemName,
  });
  expect(
    'accessors over a flat row',
    groups.map((g) => [g.section, g.items.map((r) => r.n), g.hasPendingCorrection]),
    [['Aisle 3', ['coffee', 'tea'], true]],
  );
}

// isCatalogGroupOpen truth table.
const empty = new Set();
const some = new Set(['Dairy']);
for (const [label, args, want] of [
  ['browsing, not expanded', { searching: false, expanded: empty, searchCollapsed: empty }, false],
  ['browsing, expanded', { searching: false, expanded: some, searchCollapsed: empty }, true],
  ['browsing ignores searchCollapsed', { searching: false, expanded: empty, searchCollapsed: some }, false],
  ['searching, nothing collapsed', { searching: true, expanded: empty, searchCollapsed: empty }, true],
  ['searching, collapsed', { searching: true, expanded: empty, searchCollapsed: some }, false],
  ['searching ignores expanded', { searching: true, expanded: some, searchCollapsed: some }, false],
]) {
  expect(`isCatalogGroupOpen ${label}`, isCatalogGroupOpen('Dairy', args), want);
}

if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL: ${f}`).join('\n'));
  process.exit(1);
}
console.log('OK: Item catalog grouping, search and open/closed rules.');
