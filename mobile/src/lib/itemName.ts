/**
 * Item-name identity (#106). One function decides "are these the same item?" for
 * list items, Item location tags, correction votes and check-off records, so the
 * answer is never re-derived with `trim().toLowerCase()`.
 *
 * The fold has a twin in Postgres, `public.fold_item_name` (migration
 * 20261008000000_item_name_fold.sql). The two must agree character for character:
 * `scripts/check-item-name-parity.mjs` runs both against
 * `supabase/tests/item_name_cases.json`. Change one side, run that script.
 *
 * Steps, in order: 1 lower-case; 2 NFD; 3 strip combining marks U+0300-U+036F;
 * 4 map curly quotes and en/em dashes to their straight forms; 5 collapse runs of
 * whitespace to one space; 6 trim; 7 NFC. Lower-casing first turns "İ" into
 * "i" + U+0307, which step 3 then strips. Not folded on purpose: ß, æ, ø, ł (no
 * decomposition), and й becomes и (its breve is a combining mark).
 *
 * The whitespace class is written out because Postgres `btrim` trims only U+0020
 * while JS `trim()` also trims NBSP and friends; both sides use this one set.
 */
const WHITESPACE = '\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff';
const WHITESPACE_RUN = new RegExp(`[${WHITESPACE}]+`, 'g');
const WHITESPACE_EDGES = new RegExp(`^[${WHITESPACE}]+|[${WHITESPACE}]+$`, 'g');

/** The ceiling on an item's quantity; the database enforces the same 1..99. */
const MAX_QUANTITY = 99;

/** Folds an item name to its comparison key. See the file header for the steps. */
export function foldItemName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‛ʼ]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(WHITESPACE_RUN, ' ')
    .replace(/^ +| +$/g, '')
    .normalize('NFC');
}

/**
 * The spelling an item name or Item location label is stored in: trimmed, first
 * character upper-cased, the rest exactly as typed ("iPhone cable" becomes
 * "IPhone cable"). "First character" is the first code point.
 */
export function capitaliseFirst(text: string): string {
  const trimmed = text.replace(WHITESPACE_EDGES, '');
  if (trimmed === '') return '';
  const first = String.fromCodePoint(trimmed.codePointAt(0)!);
  return first.toUpperCase() + trimmed.slice(first.length);
}

/**
 * Collapses items that fold to the same name into one, for copying a History
 * snapshot onto a new list. The first occurrence keeps its place and its
 * capitalised spelling; quantities are summed and clamped to 99; items whose name
 * folds to nothing are dropped.
 */
export function mergeSameItems<T extends { name: string; quantity: number }>(items: readonly T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of items) {
    const key = foldItemName(item.name);
    if (key === '') continue;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + item.quantity);
    } else {
      merged.set(key, { ...item, name: capitaliseFirst(item.name), quantity: Math.min(MAX_QUANTITY, item.quantity) });
    }
  }
  return [...merged.values()];
}

/**
 * The other item on the list that `name` would collide with, if any. The item
 * being renamed (`itemId`) never clashes with itself, so a case-only rename passes.
 */
export function findNameClash<T extends { id: string; name: string }>(
  items: readonly T[],
  itemId: string,
  name: string,
): T | undefined {
  const key = foldItemName(name);
  return items.find((item) => item.id !== itemId && foldItemName(item.name) === key);
}
