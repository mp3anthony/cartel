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
 * Only the primary hex per chain is modeled. Four Square and FreshChoice
 * each have a researched optional secondary colour (green) too, but nothing
 * in scope for #51 needs a two-colour treatment — add it here if a later
 * issue needs it.
 */
export type Chain =
  | 'new_world'
  | 'paknsave'
  | 'four_square'
  | 'woolworths'
  | 'freshchoice'
  | 'other';

export const CHAIN_OPTIONS: { value: Chain; label: string }[] = [
  { value: 'new_world', label: 'New World' },
  { value: 'paknsave', label: "PAK'nSAVE" },
  { value: 'four_square', label: 'Four Square' },
  { value: 'woolworths', label: 'Woolworths' },
  { value: 'freshchoice', label: 'FreshChoice' },
  { value: 'other', label: 'Other' },
];

const CHAIN_COLORS: Record<Exclude<Chain, 'other'>, string> = {
  new_world: '#E11A2C',
  paknsave: '#FFD600',
  four_square: '#ED1D24',
  woolworths: '#007837',
  freshchoice: '#D8232A',
};

/**
 * Returns the brand hex for a chain, or null for 'other'/null/undefined —
 * callers (DonutChart.tsx) treat null as "use the existing tint-mixed-accent
 * look," never as an error or a default colour of its own.
 */
export function chainColor(chain: string | null | undefined): string | null {
  if (!chain || chain === 'other') {
    return null;
  }
  return (CHAIN_COLORS as Record<string, string>)[chain] ?? null;
}
