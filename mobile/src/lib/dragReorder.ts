// Pure maths for drag-to-reorder (Issue #102 slice 3, auto-scroll #123). No imports, so
// scripts/check-drag-autoscroll.mjs can run it directly.

/** Height of the band at the top and bottom of the visible page that scrolls it (px). */
export const EDGE_ZONE_PX = 72;
/** The band never takes more than this share of the visible height. */
export const EDGE_ZONE_MAX_FRACTION = 0.25;
/** Scroll speed at the inner edge of the band (px/s). Deliberately a jump from 0. */
export const EDGE_MIN_SPEED = 180;
/** Scroll speed with the finger at, or past, the screen edge (px/s). */
export const EDGE_MAX_SPEED = 960;
/** A finger that started inside the band must move this far before it scrolls (px). */
export const EDGE_ARM_PX = 12;
/** A longer frame gap (tab hidden, long task) is treated as this, so the page cannot leap. */
export const EDGE_MAX_FRAME_MS = 50;

export function edgeZone(visibleHeight: number): number {
  if (visibleHeight <= 0) {
    return 0;
  }

  return Math.min(EDGE_ZONE_PX, visibleHeight * EDGE_ZONE_MAX_FRACTION);
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Signed scroll speed (px/s, negative = up) for a finger at `fingerY`, in the same
 * coordinates as `top` and `bottom` (the visible area of the scrolling page). Zero
 * outside the bands; a finger past the edge counts as fully in.
 */
export function edgeScrollVelocity(fingerY: number, top: number, bottom: number): number {
  const zone = edgeZone(bottom - top);

  if (zone <= 0) {
    return 0;
  }

  const fromTop = fingerY - top;

  if (fromTop < zone) {
    const depth = clamp((zone - fromTop) / zone, 0, 1);
    return -(EDGE_MIN_SPEED + (EDGE_MAX_SPEED - EDGE_MIN_SPEED) * depth);
  }

  const fromBottom = bottom - fingerY;

  if (fromBottom < zone) {
    const depth = clamp((zone - fromBottom) / zone, 0, 1);
    return EDGE_MIN_SPEED + (EDGE_MAX_SPEED - EDGE_MIN_SPEED) * depth;
  }

  return 0;
}

/**
 * Whether auto-scroll may run. Once armed it stays armed for the drag. A drag that begins
 * outside a band is armed at once; one that begins inside waits for a deliberate move, so
 * grabbing a handle near the edge does not lurch the page.
 */
export function isArmed(wasArmed: boolean, velocity: number, gestureDy: number): boolean {
  return wasArmed || velocity === 0 || Math.abs(gestureDy) >= EDGE_ARM_PX;
}

/** The next scroll offset after `dtMs` at `velocity`, kept inside 0..maxOffset. */
export function nextScrollOffset(
  current: number,
  velocity: number,
  dtMs: number,
  maxOffset: number,
): number {
  const dt = Math.min(Math.max(dtMs, 0), EDGE_MAX_FRAME_MS);

  return clamp(current + (velocity * dt) / 1000, 0, Math.max(0, maxOffset));
}

/** How far the dragged row has moved in the list: the finger's travel plus the page's. */
export function effectiveDragDy(gestureDy: number, scrollNow: number, scrollAtGrant: number): number {
  return gestureDy + (scrollNow - scrollAtGrant);
}

/** Index the dragged row would land at, from where its centre is after `dragDy`. */
export function targetIndex(heights: number[], from: number, dragDy: number): number {
  if (from < 0 || from >= heights.length) {
    return 0;
  }

  let top = 0;
  const centres = heights.map((h) => {
    const centre = top + h / 2;
    top += h;
    return centre;
  });
  const draggedCentre = centres[from] + dragDy;

  return centres.filter((centre, index) => index !== from && centre < draggedCentre).length;
}
