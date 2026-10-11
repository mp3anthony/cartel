/**
 * Grouping, search and open/closed rules for the per-store Item catalog (#149).
 *
 * Pure and generic over the row type, with no runtime imports (only `import type`),
 * so `scripts/check-item-catalog.mjs` can run it under Node's type stripping, which
 * cannot resolve extension-less relative imports. For that reason the item-name fold
 * is injected (`fold`) instead of imported; the screen passes `foldItemName`.
 */

export type ItemCatalogGroup<T> = {
  section: string;
  items: T[];
  /** True if any item kept in this group has a pending correction. */
  hasPendingCorrection: boolean;
};

export type BuildCatalogGroupsOptions<T> = {
  /** Already folded; `''` means not searching. */
  query: string;
  /** The stored, folded name: it is both the sort key and what the query matches. */
  getName: (row: T) => string;
  getSection: (row: T) => string;
  hasPendingCorrection: (row: T) => boolean;
  fold: (text: string) => string;
};

/**
 * Groups rows by exact section; sections and rows `localeCompare`. While searching,
 * keeps rows whose name contains the query and drops groups left empty, so
 * `hasPendingCorrection` only reflects what is shown. Never mutates `rows`.
 */
export function buildCatalogGroups<T>(
  rows: readonly T[],
  { query, getName, getSection, hasPendingCorrection, fold }: BuildCatalogGroupsOptions<T>,
): ItemCatalogGroup<T>[] {
  const bySection = new Map<string, T[]>();
  for (const row of rows) {
    if (query !== '' && !fold(getName(row)).includes(query)) {
      continue;
    }
    const section = getSection(row);
    const bucket = bySection.get(section);
    if (bucket) {
      bucket.push(row);
    } else {
      bySection.set(section, [row]);
    }
  }

  return Array.from(bySection.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((section) => {
      const items = bySection.get(section)!.sort((a, b) => getName(a).localeCompare(getName(b)));
      return { section, items, hasPendingCorrection: items.some(hasPendingCorrection) };
    });
}

/**
 * Searching has its own collapse set, so search never writes `expanded` and clearing
 * the search restores the user's own choices. While searching every group starts open.
 */
export function isCatalogGroupOpen(
  section: string,
  {
    searching,
    expanded,
    searchCollapsed,
  }: { searching: boolean; expanded: ReadonlySet<string>; searchCollapsed: ReadonlySet<string> },
): boolean {
  return searching ? !searchCollapsed.has(section) : expanded.has(section);
}
