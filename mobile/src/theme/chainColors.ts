/**
 * Chain -> brand colour lookup, added for #51. This is a deliberate, narrow
 * exception to tokens.ts's "one accent" rule: real NZ supermarket chains
 * have recognisable brand colours, and using them makes the store-frequency
 * donut chart (DonutChart.tsx) actually readable instead of a gradient of
 * one hue. Nothing else in the app should reach for this file — it exists
 * only for chain-identified UI, not as a general second palette.
 *
 * Colours are theme-invariant: same hex in light and dark mode. These are
 * fixed brand colours, not part of this app's own light/dark palette pair,
 * so unlike everything in tokens.ts there is no light/dark split here.
 *
 * The primary hex is the fill, and the only colour the donut uses. Four Square
 * and FreshChoice also have a ring colour, used only by StoreBadge, because
 * their reds are nearly the same as New World's at badge size. FreshChoice's
 * ring is its website UI blue (Ant's choice over the leaf green) so it can't
 * be confused with Four Square's green.
 */
export type Chain =
  | 'new_world'
  | 'paknsave'
  | 'four_square'
  | 'woolworths'
  | 'freshchoice';

export const CHAIN_OPTIONS: { value: Chain; label: string }[] = [
  { value: 'new_world', label: 'New World' },
  { value: 'paknsave', label: "PAK'nSAVE" },
  { value: 'four_square', label: 'Four Square' },
  { value: 'woolworths', label: 'Woolworths' },
  { value: 'freshchoice', label: 'FreshChoice' },
];

const CHAIN_COLORS: Record<Chain, string> = {
  new_world: '#E11A2C',
  paknsave: '#FFD600',
  four_square: '#ED1D24',
  woolworths: '#007837',
  freshchoice: '#D8232A',
};

const CHAIN_RING_COLORS: Partial<Record<Chain, string>> = {
  four_square: '#278342',
  freshchoice: '#18A3D7',
};

/**
 * Returns the badge ring hex for a chain, or null when it has none (every chain but
 * Four Square and FreshChoice, plus null/undefined/unknown values).
 */
export function chainRingColor(chain: string | null | undefined): string | null {
  if (!chain) {
    return null;
  }
  return (CHAIN_RING_COLORS as Record<string, string>)[chain] ?? null;
}

/**
 * Returns the brand hex for a chain, or null for null/undefined/unknown values
 * (legacy 'other' rows included) — callers (DonutChart.tsx) treat null as "use the
 * existing tint-mixed-accent look," never as an error or a default colour of its own.
 */
export function chainColor(chain: string | null | undefined): string | null {
  if (!chain) {
    return null;
  }
  return (CHAIN_COLORS as Record<string, string>)[chain] ?? null;
}
