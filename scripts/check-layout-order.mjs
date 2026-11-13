// Fails if Shopping Mode's Layout order drifts (#153), or if the app's label rules and
// the database's drift apart (#112).
// Usage: node scripts/check-layout-order.mjs          check (before a PR; not in CI)
//        node scripts/check-layout-order.mjs --write  also regenerate the SQL block
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks mobile/src/lib/layoutOrder.ts: label parsing (the rules of the database's
// public.item_location_label, including the one synonym "Meat" to Butchery), place
// comparison, and the end-to-end sort. Parity with the SQL (#112):
//  1. parseLayoutLabel gives the expected label for every case in
//     supabase/tests/item_location_label_cases.json (null = refused);
//  2. the department list in public.item_location_departments() (read from the #112
//     migration file) equals LAYOUT_ORDER_SEQUENCE without 'Aisle', and the CHECK's
//     aisle pattern is the 1..MAX_AISLE one with MAX_AISLE = 999;
//  3. the block between the GENERATED markers in supabase/tests/item_location_labels.sql
//     is exactly what those cases generate (that file asserts them against Postgres).
// Does NOT check: the screen wiring, or that Postgres agrees (run
// item_location_labels.sql for that; it needs a database).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  LAYOUT_ORDER_SEQUENCE,
  MAX_AISLE,
  aisleLabel,
  compareLayoutPlaces,
  isAisleNumber,
  parseLayoutLabel,
  sortByLayoutOrder,
} from '../mobile/src/lib/layoutOrder.ts';
import { foldItemName } from '../mobile/src/lib/itemName.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const casesPath = join(root, 'supabase/tests/item_location_label_cases.json');
const sqlTestPath = join(root, 'supabase/tests/item_location_labels.sql');
const migrationPath = join(root, 'supabase/migrations/20261114000000_item_location_standard_labels.sql');
const BEGIN = '-- GENERATED BEGIN (node scripts/check-layout-order.mjs --write)';
const END = '-- GENERATED END';

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
  ['Meat', 'Butchery'],
  ['meat section', 'Butchery'],
]) {
  expect(`parse ${label}`, parse(label), dept(want));
}
for (const [label, n] of [['aisle 4', 4], ['Isle 04', 4], ['aisle no. 4', 4], ['aisle #4', 4], ['Aisle 999', 999], ['Aisle 22', 22]]) {
  expect(`parse ${label}`, parse(label), aisle(n));
}
for (const label of ['Aisle 4a', 'Aisle 4-5', 'Aisle', 'Aisle 0', 'Aisle 1000', '15', 'Meats', 'Cleaning', 'Dali', 'constructor']) {
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
  sort([r('x1', 'Pets'), r('beer', 'Beer & Wine'), r('y1', 'Cleaning'), r('x0', 'pets'), r('none', null), r('y0', 'Cleaning')]),
  ['beer', 'y0', 'y1', 'x0', 'x1', 'none'],
);
expect(
  'Meat sorts with Butchery (D2)',
  sort([r('steak', 'Meat'), r('apples', 'Fruit & Veg'), r('beef', 'Butchery'), r('fish', 'Seafood')]),
  ['apples', 'beef', 'steak', 'fish'],
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

// ---------------------------------------------------------------------------
// Parity with the database (#112).
// ---------------------------------------------------------------------------

/** What the app reads a text as, in the database's terms: the standard label or null. */
const standardOf = (input) => {
  const place = parse(input);
  return place.kind === 'department' || place.kind === 'aisle' ? place.label : null;
};
/** is_item_location_label in app terms: the text is already the standard label it reads as. */
const isStandard = (input) => input !== null && standardOf(input) === input;

const casesText = readFileSync(casesPath, 'utf8');
if (/[^\x00-\x7f]/.test(casesText)) failures.push('item_location_label_cases.json must be ASCII-only (use \\u escapes)');
const cases = JSON.parse(casesText);

// 1. JS against the shared cases.
for (const c of cases.label) {
  expect(`case "${c.label}"`, standardOf(c.input), c.expected);
}
for (const c of cases.standard) {
  expect(`standard case "${c.label}"`, isStandard(c.input), c.expected);
}

// 2. The SQL department list and aisle cap.
const departments = LAYOUT_ORDER_SEQUENCE.filter((s) => s !== 'Aisle');
const migration = readFileSync(migrationPath, 'utf8');
const fnMatch = /create function public\.item_location_departments\(\)[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/.exec(migration);
if (!fnMatch) {
  failures.push('could not find the item_location_departments() array in the #112 migration');
} else {
  const sqlDepartments = [...fnMatch[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
  expect('SQL item_location_departments() = LAYOUT_ORDER_SEQUENCE without Aisle', sqlDepartments, departments);
}
expect('MAX_AISLE', MAX_AISLE, 999);
if (!migration.includes("p ~ '^Aisle [1-9][0-9]{0,2}$'")) {
  failures.push("the #112 migration's is_item_location_label no longer uses '^Aisle [1-9][0-9]{0,2}$' (Aisle 1..999)");
}

// 3. The generated SQL block.
/** A SQL literal; null stays null, non-ASCII and control characters become U& escapes. */
function lit(s) {
  if (s === null) return 'null::text';
  if (/^[\x20-\x7e]*$/.test(s)) return `'${s.replace(/'/g, "''")}'`;
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === "'") out += "''";
    else if (ch === '\\') out += '\\\\';
    else if (cp >= 0x20 && cp <= 0x7e) out += ch;
    else if (cp <= 0xffff) out += '\\' + cp.toString(16).toUpperCase().padStart(4, '0');
    else out += '\\+' + cp.toString(16).toUpperCase().padStart(6, '0');
  }
  return `U&'${out}'`;
}

function generate() {
  const lines = [BEGIN, 'do $$', 'begin'];
  lines.push(
    '  if public.item_location_departments() is distinct from',
    `       array[${departments.map(lit).join(', ')}]::text[] then`,
    "    raise exception 'FAIL: item_location_departments() is not LAYOUT_ORDER_SEQUENCE without Aisle';",
    '  end if;',
  );
  for (const c of cases.label) {
    lines.push(
      `  if public.item_location_label(${lit(c.input)}) is distinct from ${lit(c.expected)} then`,
      `    raise exception 'FAIL: item_location_label case %: got %', ${lit(c.label)}, public.item_location_label(${lit(c.input)});`,
      '  end if;',
    );
  }
  for (const c of cases.standard) {
    lines.push(
      `  if public.is_item_location_label(${lit(c.input)}) is distinct from ${c.expected} then`,
      `    raise exception 'FAIL: is_item_location_label case %', ${lit(c.label)};`,
      '  end if;',
    );
  }
  const produced = [...new Set(cases.label.map((c) => c.expected).filter((e) => e !== null))];
  for (const label of produced) {
    lines.push(
      `  if not public.is_item_location_label(${lit(label)}) then`,
      `    raise exception 'FAIL: item_location_label produced %, which is_item_location_label refuses', ${lit(label)};`,
      '  end if;',
    );
  }
  lines.push('end $$;', END);
  return lines.join('\n');
}

const sql = readFileSync(sqlTestPath, 'utf8');
const normalised = sql.replace(/\r\n/g, '\n');
const start = normalised.indexOf(BEGIN);
const end = normalised.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  failures.push(`${sqlTestPath}: GENERATED markers not found`);
} else {
  const current = normalised.slice(start, end + END.length);
  const wanted = generate();
  if (current !== wanted) {
    if (process.argv.includes('--write')) {
      const eol = sql.includes('\r\n') ? '\r\n' : '\n';
      writeFileSync(sqlTestPath, (normalised.slice(0, start) + wanted + normalised.slice(end + END.length)).replace(/\n/g, eol));
      console.log('Regenerated the SQL block in supabase/tests/item_location_labels.sql');
    } else {
      failures.push('supabase/tests/item_location_labels.sql: generated block is stale (run with --write)');
    }
  }
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} check(s) failed`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `OK: Layout order labels, comparison and sort match the rules; ${cases.label.length} label and ` +
    `${cases.standard.length} standard cases match; SQL department list and generated block current.`,
);
