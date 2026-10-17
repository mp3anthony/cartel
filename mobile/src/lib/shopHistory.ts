/**
 * Pure text for the History screen (#229): a row's title, secondary line and spoken label, the
 * "N items located" line, and the date format. Kept out of the screen so
 * `scripts/check-items-located.mjs` can run it without React.
 */

export function formatCompletedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "No items located", "1 item located", "N items located". */
export function itemsLocatedText(count: number): string {
  if (count === 0) {
    return 'No items located';
  }
  return count === 1 ? '1 item located' : `${count} items located`;
}

/**
 * A History row's text. The title is the Store's name; the secondary line is "date · list
 * name" (the list name is dropped when the list is gone). With no Store found (not expected,
 * since `location_id` is not null) the list name stands in as the title and the secondary line
 * is the date alone; with neither, the title is "Unknown store". The spoken label ends with the
 * action, since a row opens a pop-up rather than expanding in place.
 */
export function shopRowText({
  storeName,
  listName,
  completedAt,
}: {
  storeName: string | null;
  listName: string | null;
  completedAt: string;
}): { title: string; secondary: string; accessibilityLabel: string } {
  const date = formatCompletedAt(completedAt);
  const title = storeName ?? listName ?? 'Unknown store';
  const secondary = storeName !== null && listName ? `${date} · ${listName}` : date;

  return { title, secondary, accessibilityLabel: `${title}, ${secondary}, opens details` };
}
