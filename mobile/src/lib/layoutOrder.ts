/**
 * Layout order for Shopping Mode (#153): the fixed walk through a supermarket that
 * items are listed in, by their Item location label.
 *
 * Pure and generic over the row type, with no runtime imports (only `import type`),
 * like `itemCatalog.ts`, so `scripts/check-layout-order.mjs` can run it under Node's
 * type stripping, which cannot resolve extension-less relative imports. For that
 * reason the item-name fold is injected (`fold`); callers pass `foldItemName`.
 *
 * Labels are read forgivingly, with exactly the rules of the database's
 * `public.item_location_label` (supabase/migrations/20261114000000_item_location_standard_labels.sql,
 * #112): "dairy section" is Dairy, "isle 04" is Aisle 4, and the one synonym "Meat" is
 * Butchery (Ant's call, D2). Anything else is an unknown label and sorts after the
 * standard ones (the database refuses it since #112, so only old cached data can hold
 * one). `scripts/check-layout-order.mjs` holds this file and the SQL to the shared
 * cases in supabase/tests/item_location_label_cases.json.
 */

export type Fold = (text: string) => string;

/** The walk, in order. `'Aisle'` stands for every numbered aisle, sorted by number. */
export const LAYOUT_ORDER_SEQUENCE = [
  'Fruit & Veg',
  'Butchery',
  'Seafood',
  'Deli',
  'Bakery',
  'Dairy',
  'Chilled',
  'Aisle',
  'Frozen',
  'Health & Beauty',
  'Pharmacy',
  'Beer & Wine',
] as const;

export type LayoutSlot = (typeof LAYOUT_ORDER_SEQUENCE)[number];
export type Department = Exclude<LayoutSlot, 'Aisle'>;

/** The highest aisle number the standard label set allows. */
export const MAX_AISLE = 999;

export function isAisleNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_AISLE;
}

export function aisleLabel(n: number): string {
  return `Aisle ${n}`;
}

export type LayoutPlace =
  | { kind: 'department'; label: Department }
  | { kind: 'aisle'; aisle: number; label: string }
  | { kind: 'other'; label: string; key: string }
  | { kind: 'none' };

const AISLE_SLOT = LAYOUT_ORDER_SEQUENCE.indexOf('Aisle');
const OTHER_RANK = LAYOUT_ORDER_SEQUENCE.length;
const NONE_RANK = LAYOUT_ORDER_SEQUENCE.length + 1;

const DEPARTMENTS = LAYOUT_ORDER_SEQUENCE.filter((slot): slot is Department => slot !== 'Aisle');
/** The only synonym (#112, D2), keyed like a department on the stripped key. */
const SYNONYMS: ReadonlyMap<string, Department> = new Map([['meat', 'Butchery']]);
const AISLE_PATTERN = /^(?:aisle|isle|ailse|asile) ?(?:no\.?|number|#)? ?0*([1-9][0-9]{0,2})$/;

/** Where a stored label sits in the walk. Null, empty and whitespace-only are `none`. */
export function parseLayoutLabel(label: string | null, fold: Fold): LayoutPlace {
  if (label === null) return { kind: 'none' };
  const k0 = fold(label);
  if (k0 === '') return { kind: 'none' };

  const k1 = k0
    .replace(/^the | (section|department|dept|area|counter|aisle|isle|bay)$/g, '')
    .replace(/ and /g, ' & ');
  const department = DEPARTMENTS.find((d) => fold(d) === k1) ?? SYNONYMS.get(k1);
  if (department) return { kind: 'department', label: department };

  const match = AISLE_PATTERN.exec(k0);
  if (match) {
    const aisle = Number(match[1]);
    return { kind: 'aisle', aisle, label: aisleLabel(aisle) };
  }

  return { kind: 'other', label, key: k0 };
}

function rankOf(place: LayoutPlace): number {
  switch (place.kind) {
    case 'department':
      return LAYOUT_ORDER_SEQUENCE.indexOf(place.label);
    case 'aisle':
      return AISLE_SLOT;
    case 'other':
      return OTHER_RANK;
    case 'none':
      return NONE_RANK;
  }
}

/** Negative if `a` comes first in the walk; 0 for the same place. */
export function compareLayoutPlaces(a: LayoutPlace, b: LayoutPlace): number {
  const byRank = rankOf(a) - rankOf(b);
  if (byRank !== 0) return byRank;
  if (a.kind === 'aisle' && b.kind === 'aisle') return a.aisle - b.aisle;
  if (a.kind === 'other' && b.kind === 'other') return a.key.localeCompare(b.key);
  return 0;
}

export type SortByLayoutOrderOptions<T> = {
  getName: (item: T) => string;
  getLabel: (item: T) => string | null;
  fold: Fold;
};

/**
 * Orders items by Layout order, alphabetically (by folded name) within a place.
 * Items with no location go last and keep the order they came in, which is also the
 * final tie-break for everything else. Returns a new array; never mutates `items`.
 */
export function sortByLayoutOrder<T>(
  items: readonly T[],
  { getName, getLabel, fold }: SortByLayoutOrderOptions<T>,
): T[] {
  const decorated = items.map((item, index) => ({
    item,
    index,
    place: parseLayoutLabel(getLabel(item), fold),
    nameKey: fold(getName(item)),
  }));
  decorated.sort((a, b) => {
    const byPlace = compareLayoutPlaces(a.place, b.place);
    if (byPlace !== 0) return byPlace;
    if (a.place.kind !== 'none') {
      const byName = a.nameKey.localeCompare(b.nameKey);
      if (byName !== 0) return byName;
    }
    return a.index - b.index;
  });
  return decorated.map((entry) => entry.item);
}
