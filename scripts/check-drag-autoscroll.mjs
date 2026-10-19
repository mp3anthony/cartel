// Fails if the drag auto-scroll maths drift (#123).
// Usage: node scripts/check-drag-autoscroll.mjs   (before a PR; not in CI)
// Needs Node 22.18+ or 23.6+ (runs the .ts source directly); older Node: add
// --experimental-strip-types. Pure maths, so there is no TZ variant.
//
// Checks mobile/src/lib/dragReorder.ts: edgeZone, edgeScrollVelocity (bands, ramp, edges),
// isArmed, nextScrollOffset (frame cap, clamps), effectiveDragDy and targetIndex (also with
// the page's scroll added).
// Does NOT check: the frame loop in ReorderableList, usePageScroll's measuring and
// scrolling, Screen's wiring, or whether iOS Safari keeps the touch alive while the page
// scrolls from code (iPhone only).
import { isDeepStrictEqual } from 'node:util';

import {
  edgeScrollVelocity,
  edgeZone,
  effectiveDragDy,
  isArmed,
  nextScrollOffset,
  targetIndex,
} from '../mobile/src/lib/dragReorder.ts';

const failures = [];
const show = (v) => JSON.stringify(v);
function expect(label, got, want) {
  if (!isDeepStrictEqual(got, want)) failures.push(`${label}: got ${show(got)}, want ${show(want)}`);
}
function expectNear(label, got, want, eps = 0.01) {
  if (!(Math.abs(got - want) <= eps)) failures.push(`${label}: got ${show(got)}, want about ${show(want)}`);
}
function expectTrue(label, cond) {
  if (!cond) failures.push(`${label}: condition false`);
}

// edgeZone.
expect('zone of 0', edgeZone(0), 0);
expect('zone of negative', edgeZone(-5), 0);
expect('zone of 700', edgeZone(700), 72);
expect('zone of 100 is a quarter', edgeZone(100), 25);

// edgeScrollVelocity, visible area 100..700 (zone 72).
expect('centre', edgeScrollVelocity(400, 100, 700), 0);
expect('just outside the top band', edgeScrollVelocity(172, 100, 700), 0);
expectTrue('just inside the top band', edgeScrollVelocity(171.9, 100, 700) < -180);
expectNear('just inside the top band is near -180', edgeScrollVelocity(171.9, 100, 700), -180, 2);
expect('at the top edge', edgeScrollVelocity(100, 100, 700), -960);
expect('past the top edge', edgeScrollVelocity(50, 100, 700), -960);
expect('just outside the bottom band', edgeScrollVelocity(628, 100, 700), 0);
expectTrue('just inside the bottom band', edgeScrollVelocity(628.1, 100, 700) > 180);
expectNear('just inside the bottom band is near 180', edgeScrollVelocity(628.1, 100, 700), 180, 2);
expect('at the bottom edge', edgeScrollVelocity(700, 100, 700), 960);
expect('past the bottom edge', edgeScrollVelocity(900, 100, 700), 960);
expect('empty viewport', edgeScrollVelocity(150, 100, 100), 0);
// Short viewport 100..200 (zone 25): the middle stays quiet, the bands do not overlap.
expect('short viewport middle', edgeScrollVelocity(150, 100, 200), 0);
expectTrue('short viewport top band', edgeScrollVelocity(110, 100, 200) < 0);
expectTrue('short viewport bottom band', edgeScrollVelocity(190, 100, 200) > 0);

// isArmed.
expect('inside a band, small move', isArmed(false, -500, 5), false);
expect('inside a band, 12 px move', isArmed(false, -500, 12), true);
expect('inside a band, 12 px move down', isArmed(false, 500, -12), true);
expect('outside a band', isArmed(false, 0, 0), true);
expect('stays armed', isArmed(true, -500, 0), true);

// nextScrollOffset.
expectNear('960 px/s for one 16 ms frame', nextScrollOffset(100, 960, 16, 1000), 115.36);
expect('long gap capped at 50 ms', nextScrollOffset(100, 960, 1000, 10000), 148);
expect('negative dt does not move', nextScrollOffset(100, 960, -16, 1000), 100);
expect('clamped at 0', nextScrollOffset(5, -960, 16, 1000), 0);
expect('clamped at max', nextScrollOffset(995, 960, 16, 1000), 1000);
expect('max below 0 gives 0', nextScrollOffset(10, 960, 16, -5), 0);

// effectiveDragDy.
expect('page scrolled 50 px since the grant', effectiveDragDy(30, 250, 200), 80);
expect('no scroll', effectiveDragDy(30, 200, 200), 30);

// targetIndex, four 52 px rows.
const heights = [52, 52, 52, 52];
expect('stay put', targetIndex(heights, 1, 0), 1);
expect('down one row', targetIndex(heights, 1, 60), 2);
expect('up one row', targetIndex(heights, 1, -60), 0);
expect('far down', targetIndex(heights, 1, 1000), 3);
expect('far up', targetIndex(heights, 1, -1000), 0);
expect('unknown from', targetIndex(heights, -1, 40), 0);
expect('from past the end', targetIndex(heights, 4, 40), 0);
expect('mixed heights', targetIndex([40, 80, 40], 0, 70), 1);
expect('mixed heights, further', targetIndex([40, 80, 40], 0, 121), 2);
// A drag whose finger barely moved but whose page scrolled 104 px lands two rows down.
expect('scroll-adjusted', targetIndex(heights, 0, effectiveDragDy(10, 104, 0)), 2);

if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log('OK: drag auto-scroll maths');
