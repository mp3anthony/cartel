/**
 * Store colour assignment shared by the Home donut, the graph pop-ups' rows, the stacked
 * bars and the legend (#215), so one Store is one colour everywhere.
 *
 * The rule (from #22, #51): the top `maxNamed` Stores by lifetime shops get a colour. A Store
 * with a recognised chain wears its brand colour (`chainHex`); one without gets the accent
 * blended toward the surface by rank, a single hue at falling strength. Every other Store
 * shares the neutral `otherColor` and reads as "Other stores".
 *
 * No runtime imports (only `import type`), so `scripts/check-shop-frequency.mjs` can run it
 * under Node's type stripping. The caller resolves `chainHex` with `chainColor()`.
 */
export type StoreColorInput = {
  key: string;
  value: number;
  /** The Store's brand hex, or null when it has no recognised chain. */
  chainHex: string | null;
};

export type StoreColorPalette = { accent: string; surface: string; border: string };

export type RankedStoreColor = {
  key: string;
  /** 0 = most shops. */
  rank: number;
  color: string;
  /** True for the top `maxNamed`; false for the shared "Other stores" tail. */
  named: boolean;
};

export const MAX_NAMED_STORES = 5;

/** Key of the merged tail segment / legend row. */
export const OTHER_KEY = '__other__';

export function assignStoreColors(
  segments: StoreColorInput[],
  palette: StoreColorPalette,
  maxNamed: number = MAX_NAMED_STORES,
): { ranked: RankedStoreColor[]; otherColor: string } {
  const sorted = [...segments].sort((a, b) => b.value - a.value || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const ranked = sorted.map((segment, rank): RankedStoreColor => {
    const named = rank < maxNamed;
    return {
      key: segment.key,
      rank,
      named,
      color: named
        ? (segment.chainHex ?? mixWithSurface(palette.accent, palette.surface, rank / maxNamed))
        : palette.border,
    };
  });
  return { ranked, otherColor: palette.border };
}

/** Blends `from` toward `to` by `ratio` (0 = `from`, 1 = `to`). Both colours
 * must be 6-digit `#rrggbb` hex, the only shape this app's tokens use. */
export function mixWithSurface(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * ratio);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(a.r, b.r))}${toHex(mix(a.g, b.g))}${toHex(mix(a.b, b.b))}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
