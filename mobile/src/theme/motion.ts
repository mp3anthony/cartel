import { useSyncExternalStore } from 'react';
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
let reduceMotionEnabled = false;
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
