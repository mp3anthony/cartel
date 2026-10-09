// Fails if the JS item-name fold drifts from its fixtures, or if the SQL assertions
// generated from those fixtures are stale (#106).
// Usage: node scripts/check-item-name-parity.mjs          check (CI / before a PR)
//        node scripts/check-item-name-parity.mjs --write  regenerate the SQL block
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types.
//
// Checks:
//  1. foldItemName / capitaliseFirst in mobile/src/lib/itemName.ts give the expected
//     value for every case in supabase/tests/item_name_cases.json.
//  2. mergeSameItems / findNameClash give the expected result for their cases (JS only).
//  3. The block between the GENERATED markers in supabase/tests/item_name_fold.sql
//     is exactly what these fixtures generate. That file asserts the same cases
//     against public.fold_item_name / public.capitalise_first, so Postgres is held
//     to the same table as JS. Running it needs a database; this script does not.
// Does NOT check: that Postgres agrees (run item_name_fold.sql for that).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  capitaliseFirst,
  findNameClash,
  foldItemName,
  mergeSameItems,
} from '../mobile/src/lib/itemName.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const casesPath = join(root, 'supabase/tests/item_name_cases.json');
const sqlPath = join(root, 'supabase/tests/item_name_fold.sql');
const BEGIN = '-- GENERATED BEGIN (node scripts/check-item-name-parity.mjs --write)';
const END = '-- GENERATED END';

const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
const failures = [];
const show = (s) => JSON.stringify(s);

// Guard: an editor that normalises the file would silently turn the NFD fixture into NFC.
const nfc = cases.fold.find((c) => c.label === 'jalapeno NFC');
const nfd = cases.fold.find((c) => c.label === 'jalapeno NFD');
if (!nfc || nfc.input !== nfc.input.normalize('NFC')) failures.push('fixture "jalapeno NFC" is not in NFC form');
if (!nfd || nfd.input === nfd.input.normalize('NFC')) failures.push('fixture "jalapeno NFD" is not in NFD form (was the file normalised?)');
if (/[^\x00-\x7f]/.test(readFileSync(casesPath, 'utf8'))) failures.push('item_name_cases.json must be ASCII-only (use \\u escapes)');

// 1 and 2: JS against the fixtures.
for (const c of cases.fold) {
  const got = foldItemName(c.input);
  if (got !== c.expected) failures.push(`fold "${c.label}": got ${show(got)}, want ${show(c.expected)}`);
}
for (const c of cases.capitalise) {
  const got = capitaliseFirst(c.input);
  if (got !== c.expected) failures.push(`capitalise "${c.label}": got ${show(got)}, want ${show(c.expected)}`);
}
for (const c of cases.mergeSameItems) {
  const input = structuredClone(c.input);
  const got = mergeSameItems(input);
  if (JSON.stringify(got) !== JSON.stringify(c.expected)) {
    failures.push(`mergeSameItems "${c.label}": got ${show(got)}, want ${show(c.expected)}`);
  }
  if (JSON.stringify(input) !== JSON.stringify(c.input)) {
    failures.push(`mergeSameItems "${c.label}": mutated its input`);
  }
}
for (const c of cases.findNameClash) {
  const got = findNameClash(c.items, c.itemId, c.name)?.id ?? null;
  if (got !== c.expectedId) failures.push(`findNameClash "${c.label}": got ${show(got)}, want ${show(c.expectedId)}`);
}

// 3: the generated SQL block.
/** A SQL string literal; non-ASCII and control characters become U&'\XXXX' escapes. */
function lit(s) {
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
  const lines = [BEGIN, 'do $$', 'declare', '  v text;', '  inputs text[] := array['];
  const inputs = [...cases.fold.flatMap((c) => [c.input, c.expected]), ...cases.capitalise.map((c) => c.input)];
  inputs.forEach((s, i) => lines.push(`    ${lit(s)}${i < inputs.length - 1 ? ',' : ''}`));
  lines.push('  ];', 'begin');
  for (const c of cases.fold) {
    lines.push(
      `  if public.fold_item_name(${lit(c.input)}) is distinct from ${lit(c.expected)} then`,
      `    raise exception 'FAIL: fold_item_name case %: got %', ${lit(c.label)}, public.fold_item_name(${lit(c.input)});`,
      '  end if;',
    );
  }
  for (const c of cases.capitalise) {
    lines.push(
      `  if public.capitalise_first(${lit(c.input)}) is distinct from ${lit(c.expected)} then`,
      `    raise exception 'FAIL: capitalise_first case %: got %', ${lit(c.label)}, public.capitalise_first(${lit(c.input)});`,
      '  end if;',
    );
  }
  lines.push(
    '  foreach v in array inputs loop',
    '    if public.fold_item_name(public.fold_item_name(v)) is distinct from public.fold_item_name(v) then',
    "      raise exception 'FAIL: fold_item_name is not idempotent for %', v;",
    '    end if;',
    '    if lower(btrim(public.fold_item_name(v))) is distinct from public.fold_item_name(v) then',
    "      raise exception 'FAIL: lower(btrim(fold_item_name(x))) differs from fold_item_name(x) for %', v;",
    '    end if;',
    '  end loop;',
    'end $$;',
    END,
  );
  return lines.join('\n');
}

const sql = readFileSync(sqlPath, 'utf8');
const normalised = sql.replace(/\r\n/g, '\n');
const start = normalised.indexOf(BEGIN);
const end = normalised.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  failures.push(`${sqlPath}: GENERATED markers not found`);
} else {
  const current = normalised.slice(start, end + END.length);
  const wanted = generate();
  if (current !== wanted) {
    if (process.argv.includes('--write')) {
      const eol = sql.includes('\r\n') ? '\r\n' : '\n';
      writeFileSync(sqlPath, (normalised.slice(0, start) + wanted + normalised.slice(end + END.length)).replace(/\n/g, eol));
      console.log('Regenerated the SQL block in supabase/tests/item_name_fold.sql');
    } else {
      failures.push('supabase/tests/item_name_fold.sql: generated block is stale (run with --write)');
    }
  }
}

if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL: ${f}`).join('\n'));
  process.exit(1);
}
console.log(
  `OK: ${cases.fold.length} fold, ${cases.capitalise.length} capitalise, ` +
    `${cases.mergeSameItems.length} merge, ${cases.findNameClash.length} clash cases; SQL block current.`,
);
