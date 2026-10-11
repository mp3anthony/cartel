import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Press feedback for controls (#156): the HS website's motion vocabulary, in one place.
 * Values live in `02-DESIGN-REFERENCE.html` ("Buttons, chips and motion"); every control
 * that scales or fills on press gets it from the helpers here, never from its own numbers.
 *
 * Curves and durations are *strings with units*, not numbers: they are CSS values that
 * react-native-web passes through to the DOM as `transition-*` properties. They do nothing
 * on native, where only the (instant) scale applies. Web-only properties are spread
 * `as object` only when `Platform.OS === 'web'`, the same pattern as the drag handle in
 * `ReorderableList.tsx`.
 *
 * Rules: scale is instant on press (0ms) and eases back on release (quiet, exit curve);
 * the accent fill eases in slowly (feedback, enter curve) and out quickly (quiet, exit
 * curve). With Reduce Motion on, nothing scales and the fill is instant: the state still
 * changes, it just does not move. The transition is declared on the *destination* state
 * (CSS uses the new state's transition), which is why rest and pressed differ.
 */
export const motion = {
  enter: 'cubic-bezier(.22,.31,0,1)',
  exit: 'cubic-bezier(.69,0,0,1)',
  quiet: '150ms',
  feedback: '300ms',
  structural: '550ms',
  pressScale: 0.97,
} as const;

const web = Platform.OS === 'web';

/** Web-only style properties; an empty object on native. */
function webOnly(style: Record<string, string>): object {
  return web ? style : {};
}

const FILL_PROPS = 'background-color, border-color, color';

const fx = StyleSheet.create({
  scaleRest: {
    ...webOnly({
      transitionProperty: 'transform',
      transitionDuration: motion.quiet,
      transitionTimingFunction: motion.exit,
    }),
  },
  scalePressed: {
    transform: [{ scale: motion.pressScale }],
    ...webOnly({
      transitionProperty: 'transform',
      transitionDuration: '0ms',
    }),
  },
  slide: {
    ...webOnly({
      transitionProperty: 'transform',
      transitionDuration: motion.feedback,
      transitionTimingFunction: motion.enter,
    }),
  },
  fillRest: {
    ...webOnly({
      transitionProperty: FILL_PROPS,
      transitionDuration: motion.quiet,
      transitionTimingFunction: motion.exit,
    }),
  },
  fillPressed: {
    ...webOnly({
      transitionProperty: FILL_PROPS,
      transitionDuration: motion.feedback,
      transitionTimingFunction: motion.enter,
    }),
  },
  fillInstant: {
    ...webOnly({
      transitionProperty: FILL_PROPS,
      transitionDuration: '0ms',
    }),
  },
  // Scale and fill on one element share a single `transition-*` list: two separate
  // declarations would overwrite each other. Order: transform, then the three fill props.
  bothRest: {
    ...webOnly({
      transitionProperty: `transform, ${FILL_PROPS}`,
      transitionDuration: `${motion.quiet}, ${motion.quiet}, ${motion.quiet}, ${motion.quiet}`,
      transitionTimingFunction: `${motion.exit}, ${motion.exit}, ${motion.exit}, ${motion.exit}`,
    }),
  },
  bothPressed: {
    transform: [{ scale: motion.pressScale }],
    ...webOnly({
      transitionProperty: `transform, ${FILL_PROPS}`,
      transitionDuration: `0ms, ${motion.feedback}, ${motion.feedback}, ${motion.feedback}`,
      transitionTimingFunction: `${motion.enter}, ${motion.enter}, ${motion.enter}, ${motion.enter}`,
    }),
  },
});

/** Scale down to 0.97 on press. Nothing under Reduce Motion. */
export function pressScale(pressed: boolean, reduceMotion: boolean): StyleProp<ViewStyle> {
  if (reduceMotion) {
    return null;
  }
  return pressed ? fx.scalePressed : fx.scaleRest;
}

/** Fade colours in on press. Instant (but still changing) under Reduce Motion. */
export function pressFill(pressed: boolean, reduceMotion: boolean): StyleProp<ViewStyle> {
  if (reduceMotion) {
    return fx.fillInstant;
  }
  return pressed ? fx.fillPressed : fx.fillRest;
}

/** Both on one element (the scale and the fill need one shared transition list). */
export function pressScaleFill(pressed: boolean, reduceMotion: boolean): StyleProp<ViewStyle> {
  if (reduceMotion) {
    return fx.fillInstant;
  }
  return pressed ? fx.bothPressed : fx.bothRest;
}

/** The bottom nav ring's slide to the new link ("Bottom pill nav" in `02-DESIGN-REFERENCE.html`); nothing under Reduce Motion. */
export function slideTransform(reduceMotion: boolean): StyleProp<ViewStyle> {
  return reduceMotion ? null : fx.slide;
}

// One module-level subscription to the OS Reduce Motion setting, shared by every control
// (a long list mounts ~150 icon buttons; one listener each would be wasteful).
// On web the browser answers synchronously, so seed from it: a chart then mounts at its final
// values on the first frame under Reduce Motion instead of flashing through an animation.
// Native has no synchronous read and snaps to the end once the async answer arrives.
let reduceMotionEnabled =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
let started = false;
const listeners = new Set<() => void>();

function setReduceMotion(value: boolean) {
  if (value !== reduceMotionEnabled) {
    reduceMotionEnabled = value;
    listeners.forEach((listener) => listener());
  }
}

function start() {
  if (started) {
    return;
  }
  started = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(setReduceMotion)
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reduceMotionEnabled,
    () => false,
  );
}

/** Length of on-mount motion (#110, #145): within the decided 200-300ms. */
export const MOUNT_MOTION_MS = 250;

// cubic-bezier(.22,.31,0,1), the same curve as `motion.enter`, evaluated in JS because
// charts animate numbers, not CSS properties.
const EASE_X1 = 0.22;
const EASE_Y1 = 0.31;
const EASE_X2 = 0;
const EASE_Y2 = 1;

function bezier(s: number, a: number, b: number): number {
  const u = 1 - s;
  return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s;
}

/** Ease-out matching `motion.enter`; `t` is clamped to 0..1. */
export function easeEnter(t: number): number {
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    if (bezier(mid, EASE_X1, EASE_X2) < t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return bezier((lo + hi) / 2, EASE_Y1, EASE_Y2);
}

/**
 * 0..1 progress of the on-mount motion, eased. Plays once per mount: it never restarts on a
 * re-render or a refetch. With Reduce Motion on it is 1 from the first frame (web) or snaps
 * to 1 as soon as the OS setting resolves (native). Call it in leaf components only, so only
 * the leaf re-renders per frame.
 */
export function useMountProgress(): number {
  const reduceMotion = useReduceMotion();
  const [progress, setProgress] = useState(reduceMotion ? 1 : 0);
  const done = useRef(reduceMotion);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (done.current) {
      return undefined;
    }
    const startedAt = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / MOUNT_MOTION_MS);
      setProgress(easeEnter(t));
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        done.current = true;
        frame.current = null;
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (reduceMotion && !done.current) {
      done.current = true;
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      setProgress(1);
    }
  }, [reduceMotion]);

  return progress;
}
