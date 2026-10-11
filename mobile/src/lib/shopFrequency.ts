export const WEEKS_SHOWN = 8;
export const MONTHS_SHOWN = 6;

export type ShopBucket = {
  /** Local-time start of the week (Monday 00:00) or month (the 1st, 00:00). */
  start: Date;
  count: number;
};

/**
 * Counts completed shops into `count` consecutive local-time buckets ending with the one
 * that holds `now`, oldest first (#145). Always exactly `count` buckets long, zero-filled.
 *
 * Weeks start Monday, months on the 1st, both in the device's local time. Earlier buckets
 * are derived by local calendar arithmetic, never by subtracting milliseconds: a week is not
 * always 168 hours in a DST-observing zone (NZ), and a millisecond subtraction would land
 * an hour off a Monday midnight. Each timestamp goes to the last bucket that starts at or
 * before it; one before the first bucket is dropped (older history is not shown here, though
 * the donut still counts it); one after `now` (clock skew) counts in the current bucket;
 * an unparseable one is skipped.
 */
export function bucketShops(
  completedAt: string[],
  now: Date,
  unit: 'week' | 'month',
  count: number,
): ShopBucket[] {
  const current = new Date(now.getTime());
  if (unit === 'week') {
    current.setHours(0, 0, 0, 0);
    current.setDate(current.getDate() - ((current.getDay() + 6) % 7));
  }

  const buckets: ShopBucket[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    let start: Date;
    if (unit === 'week') {
      start = new Date(current.getTime());
      start.setDate(start.getDate() - 7 * i);
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    }
    buckets.push({ start, count: 0 });
  }

  for (const iso of completedAt) {
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) {
      continue;
    }
    for (let i = buckets.length - 1; i >= 0; i -= 1) {
      if (buckets[i].start.getTime() <= time) {
        buckets[i].count += 1;
        break;
      }
    }
  }

  return buckets;
}
