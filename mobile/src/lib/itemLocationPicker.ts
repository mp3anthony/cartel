/**
 * Pure rules behind the Item location picker (#154): which chips show and which one is
 * current, the Store's already-used aisle numbers, the aisle number control, and the
 * text of the "Item location missing" report (its subject and title fallback).
 *
 * No runtime imports (only `import type`), like `layoutOrder.ts` and `itemCatalog.ts`,
 * so `scripts/check-item-location-picker.mjs` can run it under Node's type stripping,
 * which cannot resolve extension-less relative imports. The label parser, the walk
 * sequence and the aisle cap are therefore injected; callers pass
 * `parseLayoutLabel(label, foldItemName)`, `LAYOUT_ORDER_SEQUENCE` and `MAX_AISLE`.
 */
import type { LayoutPlace } from './layoutOrder';

/** A label parser already bound to the name fold. */
export type ParseLabel = (label: string | null) => LayoutPlace;

export type PickerChip =
  | { kind: 'area'; label: string; isCurrent: boolean }
  | { kind: 'aisles'; isCurrent: boolean };

/**
 * One chip per slot of the sequence, in walk order. The `'Aisle'` slot becomes the single
 * Aisles chip. At most one chip is current: the department the label reads as, or Aisles
 * when it reads as an aisle. A legacy, unknown or missing label marks nothing.
 */
export function pickerChips(
  current: string | null,
  parse: ParseLabel,
  sequence: readonly string[],
): PickerChip[] {
  const place = parse(current);
  return sequence.map((slot): PickerChip => {
    if (slot === 'Aisle') {
      return { kind: 'aisles', isCurrent: place.kind === 'aisle' };
    }
    return { kind: 'area', label: slot, isCurrent: place.kind === 'department' && place.label === slot };
  });
}

/** The Store's aisle numbers in use: distinct, ascending; labels that are not aisles are skipped. */
export function usedAisleNumbers(sections: readonly string[], parse: ParseLabel): number[] {
  const seen = new Set<number>();
  for (const section of sections) {
    const place = parse(section);
    if (place.kind === 'aisle') seen.add(place.aisle);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * The aisle number typed into the control: surrounding whitespace is ignored, then it must
 * be digits only, a whole number from 1 to `max`. Leading zeros are allowed ("07" is 7).
 */
export function parseAisleDraft(text: string, max: number): number | null {
  const trimmed = text.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= max ? n : null;
}

/** The − and + buttons. "+" on an empty control gives 1; both ends stay put. */
export function nudgeAisle(current: number | null, delta: 1 | -1, max: number): number {
  if (current === null) return 1;
  return Math.min(max, Math.max(1, current + delta));
}

/**
 * True only when `label` is exactly the stored label, so the picker just closes (a write
 * would be refused as `correction_matches_current`). Deliberately exact, not compared as
 * places: an older label such as "Dairy section" or "isle 022" still marks the matching
 * chip, but tapping that chip sends the standard label ("Dairy", "Aisle 22") so the
 * label can be tidied. A case-only difference is applied at once by the database;
 * anything else goes through as a normal correction.
 */
export function isSameAsCurrent(label: string, current: string | null): boolean {
  return current !== null && label === current;
}

/** Subject the "Missing one? Tell us" link pre-fills on the Feedback form. */
export const MISSING_LOCATION_TITLE = 'Item location missing';

/**
 * The report's title: what the user typed, else the pre-filled subject, else empty (the
 * Edge Function then makes one). Clearing the field must not leave the report with only a
 * Store line for a title.
 */
export function reportTitle(typed: string, prefilled: string | undefined): string {
  const t = typed.trim();
  return t !== '' ? t : (prefilled?.trim() ?? '');
}

/** The report body for a missing Item location: the Store on its own line, then the user's text. */
export function withStoreLine(storeName: string, text: string): string {
  return `Store: ${storeName}\n\n${text}`;
}
