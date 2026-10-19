import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import type { PageScroll } from '../hooks/usePageScroll';
import {
  edgeScrollVelocity,
  effectiveDragDy,
  isArmed,
  nextScrollOffset,
  targetIndex,
} from '../lib/dragReorder';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * Drag-to-reorder for a vertical list (Issue #102 slice 3), built from the built-in
 * `PanResponder` and `Animated` only: no gesture library, so no new dependency and no
 * config change (the plan rules out reanimated and gesture-handler without Ant's say).
 *
 * Handle-only: the drag starts on the handle `View` and nowhere else, so swiping
 * anywhere else on a row still scrolls the page. On the web build the handle carries
 * CSS `touch-action: none` (iOS Safari would otherwise claim the touch for scrolling and
 * cancel the gesture), `user-select: none` (no text selection or callout from a held
 * press) and a grab cursor. `onPanResponderTerminationRequest` is false so the page's
 * `ScrollView` cannot take the gesture back mid-drag. Whether iOS Safari honours all of
 * that is what the spike on Ant's iPhone settles (docs/lessons.md).
 *
 * While a drag is live the rows come from a frozen snapshot, so a Realtime refresh
 * cannot reflow them under the finger. The dragged row follows the finger (`dy`), the
 * rows it crosses shift by its height, and on release `onDrop` receives the ids of the
 * two neighbours the item lands between (taken from the snapshot, excluding the moved
 * item; null at an end). Releasing where it started calls nothing. The caller owns the
 * write and must show the new order itself until the write lands, because this
 * component goes back to the `items` prop the moment the drag ends. Reduce-motion skips
 * the shifting animation: rows just jump.
 *
 * Auto-scroll (#123): with `autoScroll` (the page's scroll handle) a held drag near the top
 * or bottom of the visible page scrolls it, and the dragged row keeps following the
 * finger because its offset adds the page's scroll since the grant. A frame loop runs
 * only while a drag is live and the page can scroll. It works only because the handle's
 * `onPanResponderTerminationRequest` is false: react-native-web's ResponderSystem ends
 * the active responder when an ancestor scrolls unless that returns false
 * (ResponderSystem.js ~331). The finger position is a page position (`moveY`), while web
 * `measureInWindow` is viewport-relative, so `usePageScroll` converts (docs/lessons.md).
 */
export type ReorderableListProps<T extends { id: string }> = {
  items: T[];
  /** Renders one row; put `handle` wherever the grip belongs (first, on the left). */
  renderRow: (item: T, handle: ReactNode, dragging: boolean) => ReactNode;
  handleIcon: ReactNode;
  handleLabel: (item: T) => string;
  onDrop: (itemId: string, beforeId: string | null, afterId: string | null) => void;
  disabled?: boolean;
  /** Dims the handles; defaults to `disabled`. Lets a transient disable (a write in flight) skip the dimming. */
  dimmed?: boolean;
  /** The page's scroll handle; when set, a drag near the page edge scrolls it. */
  autoScroll?: PageScroll;
};

const SETTLE_MS = 120;

export function ReorderableList<T extends { id: string }>({
  items,
  renderRow,
  handleIcon,
  handleLabel,
  onDrop,
  disabled = false,
  dimmed = disabled,
  autoScroll,
}: ReorderableListProps<T>) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [dragId, setDragId] = useState<string | null>(null);
  // The order shown while dragging, fixed at grant time.
  const snapshotRef = useRef<T[]>([]);
  const heightsRef = useRef(new Map<string, number>());
  const dragIdRef = useRef<string | null>(null);
  const targetRef = useRef(0);
  const [target, setTarget] = useState(0);
  const dy = useRef(new Animated.Value(0)).current;
  const shifts = useRef(new Map<string, Animated.Value>()).current;
  const reduceMotionRef = useRef(false);
  // Auto-scroll state, all refs: the frame loop never closes over props or state.
  const autoScrollRef = useRef(autoScroll);
  autoScrollRef.current = autoScroll;
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const gestureDyRef = useRef(0);
  const fingerYRef = useRef(0);
  const scrollAtGrantRef = useRef(0);
  const viewportRef = useRef<{ top: number; bottom: number } | null>(null);
  const armedRef = useRef(false);
  const dragTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      reduceMotionRef.current = on;
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotionRef.current = on;
    });
    return () => subscription.remove();
  }, []);

  // Latest props for the handles' once-created responders.
  const latest = useRef({ disabled, onDrop });
  latest.current = { disabled, onDrop };

  const shown = dragId !== null ? snapshotRef.current : items;

  function shiftValue(id: string) {
    let value = shifts.get(id);

    if (!value) {
      value = new Animated.Value(0);
      shifts.set(id, value);
    }

    return value;
  }

  // Index the dragged row would land at, from where its centre is now.
  function targetFor(id: string, dragDy: number) {
    const order = snapshotRef.current;
    const from = order.findIndex((item) => item.id === id);
    const heights = order.map((item) => heightsRef.current.get(item.id) ?? 0);

    return targetIndex(heights, from, dragDy);
  }

  function begin(id: string, fingerY: number) {
    if (latest.current.disabled || dragIdRef.current !== null) {
      return;
    }

    snapshotRef.current = items;
    dragIdRef.current = id;
    targetRef.current = items.findIndex((item) => item.id === id);
    dy.setValue(0);
    setTarget(targetRef.current);
    setDragId(id);

    gestureDyRef.current = 0;
    fingerYRef.current = fingerY;
    armedRef.current = false;
    viewportRef.current = null;
    scrollAtGrantRef.current = 0;
    lastFrameAtRef.current = null;

    const scroller = autoScrollRef.current;

    // A page that cannot scroll behaves exactly as before: no measuring, no frame loop.
    if (scroller && scroller.getMaxOffset() > 0) {
      scrollAtGrantRef.current = scroller.getOffset();
      dragTokenRef.current += 1;
      const token = dragTokenRef.current;
      scroller.measureViewport((top, bottom) => {
        if (dragTokenRef.current === token && dragIdRef.current === id) {
          viewportRef.current = { top, bottom };
        }
      });
      frameRef.current = requestAnimationFrame(tick);
    }
  }

  // Moves the dragged row to the finger plus however far the page has scrolled since the
  // grant, and retargets. Reads refs only, so the frame loop is safe on a stale closure.
  function apply(id: string) {
    const scroller = autoScrollRef.current;
    const eff = effectiveDragDy(
      gestureDyRef.current,
      scroller ? scroller.getOffset() : scrollAtGrantRef.current,
      scrollAtGrantRef.current,
    );

    dy.setValue(eff);

    const next = targetFor(id, eff);

    if (next !== targetRef.current) {
      targetRef.current = next;
      setTarget(next);
    }
  }

  function move(id: string, gestureDy: number, fingerY: number) {
    if (dragIdRef.current !== id) {
      return;
    }

    gestureDyRef.current = gestureDy;
    fingerYRef.current = fingerY;
    apply(id);
  }

  function tick(timestamp: number) {
    frameRef.current = null;
    const id = dragIdRef.current;
    const scroller = autoScrollRef.current;

    if (id === null || !scroller) {
      return;
    }

    const dt = lastFrameAtRef.current === null ? 0 : timestamp - lastFrameAtRef.current;
    lastFrameAtRef.current = timestamp;
    const viewport = viewportRef.current;

    if (viewport) {
      const velocity = edgeScrollVelocity(fingerYRef.current, viewport.top, viewport.bottom);
      armedRef.current = isArmed(armedRef.current, velocity, gestureDyRef.current);

      if (armedRef.current && velocity !== 0) {
        const current = scroller.getOffset();
        const next = nextScrollOffset(current, velocity, dt, scroller.getMaxOffset());

        if (next !== current) {
          scroller.scrollTo(next);
        }
      }
    }

    apply(id);
    frameRef.current = requestAnimationFrame(tick);
  }

  function end(id: string, drop: boolean) {
    if (dragIdRef.current !== id) {
      return;
    }

    // After the stale-id guard, so a stale onEnd cannot stop another drag's loop.
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const order = snapshotRef.current;
    const from = order.findIndex((item) => item.id === id);
    const to = targetRef.current;
    dragIdRef.current = null;

    if (drop && from >= 0 && to !== from) {
      const others = order.filter((item) => item.id !== id);
      latest.current.onDrop(id, others[to - 1]?.id ?? null, others[to]?.id ?? null);
    }

    setDragId(null);
  }

  // Assistive-technology move (no drag): one step up or down, same neighbour semantics as end().
  function step(id: string, direction: -1 | 1) {
    if (latest.current.disabled || dragIdRef.current !== null) {
      return;
    }

    const from = items.findIndex((item) => item.id === id);
    const to = from + direction;

    if (from < 0 || to < 0 || to >= items.length) {
      return;
    }

    const others = items.filter((item) => item.id !== id);
    latest.current.onDrop(id, others[to - 1]?.id ?? null, others[to]?.id ?? null);
  }

  // Row shifts follow the target while a drag is live.
  useEffect(() => {
    if (dragId === null) {
      return;
    }

    const order = snapshotRef.current;
    const from = order.findIndex((item) => item.id === dragId);
    const moved = heightsRef.current.get(dragId) ?? 0;
    const others = order.filter((item) => item.id !== dragId);

    others.forEach((item, index) => {
      // Position this row would hold with the dragged one removed vs. inserted at `target`.
      const wasBefore = index < from;
      const isBefore = index < target;
      const shift = wasBefore === isBefore ? 0 : isBefore ? -moved : moved;
      const value = shiftValue(item.id);

      if (reduceMotionRef.current) {
        value.setValue(shift);
      } else {
        Animated.timing(value, {
          toValue: shift,
          duration: SETTLE_MS,
          useNativeDriver: false,
        }).start();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId, target]);

  // When the drag ends the rows go back to the caller's order: reset every offset in the
  // same commit as that re-render (layout effect), so there is no frame of the old
  // offsets over the new order.
  useLayoutEffect(() => {
    if (dragId === null) {
      dy.setValue(0);
      shifts.forEach((value) => value.setValue(0));
    }
  }, [dragId, dy, shifts]);

  const onLayoutFor = useCallback(
    (id: string) => (event: LayoutChangeEvent) => {
      heightsRef.current.set(id, event.nativeEvent.layout.height);
    },
    [],
  );

  return (
    <View>
      {shown.map((item) => {
        const dragging = item.id === dragId;
        const handle = (
          <DragHandle
            label={handleLabel(item)}
            disabled={disabled}
            dimmed={dimmed}
            onStep={(direction) => step(item.id, direction)}
            onBegin={(fingerY) => begin(item.id, fingerY)}
            onMove={(gestureDy, fingerY) => move(item.id, gestureDy, fingerY)}
            onEnd={(drop) => end(item.id, drop)}
          >
            {handleIcon}
          </DragHandle>
        );

        return (
          <Animated.View
            key={item.id}
            onLayout={onLayoutFor(item.id)}
            style={[
              dragging
                ? [styles.dragging, { transform: [{ translateY: dy }] }]
                : { transform: [{ translateY: shiftValue(item.id) }] },
            ]}
          >
            {renderRow(item, handle, dragging)}
          </Animated.View>
        );
      })}
    </View>
  );
}

function DragHandle({
  label,
  disabled,
  dimmed,
  onStep,
  onBegin,
  onMove,
  onEnd,
  children,
}: {
  label: string;
  disabled: boolean;
  dimmed: boolean;
  onStep: (direction: -1 | 1) => void;
  onBegin: (fingerY: number) => void;
  onMove: (dy: number, fingerY: number) => void;
  onEnd: (drop: boolean) => void;
  children: ReactNode;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const callbacks = useRef({ disabled, onBegin, onMove, onEnd });
  callbacks.current = { disabled, onBegin, onMove, onEnd };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !callbacks.current.disabled,
      onMoveShouldSetPanResponder: () => !callbacks.current.disabled,
      // Nothing may take the gesture off the handle once it has it.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (_event, gesture) => callbacks.current.onBegin(gesture.y0),
      onPanResponderMove: (_event, gesture) =>
        callbacks.current.onMove(gesture.dy, gesture.moveY),
      onPanResponderRelease: () => callbacks.current.onEnd(true),
      onPanResponderTerminate: () => callbacks.current.onEnd(false),
    }),
  ).current;

  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityActions={[
        { name: 'moveUp', label: 'Move up' },
        { name: 'moveDown', label: 'Move down' },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'moveUp') {
          onStep(-1);
        } else if (event.nativeEvent.actionName === 'moveDown') {
          onStep(1);
        }
      }}
      style={[styles.handle, dimmed && styles.handleInactive]}
    >
      {children}
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    // 44pt wide, full row tall; the web-only properties are what keep iOS Safari from
    // scrolling, selecting or showing a callout during the press. react-native-web
    // passes them through to the DOM; they are not in the native style types.
    handle: {
      width: tokens.minTouchTarget,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -tokens.space.sm,
      ...({
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        cursor: 'grab',
      } as object),
    },
    handleInactive: {
      opacity: 0.4,
    },
    dragging: {
      zIndex: 10,
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.sm,
      ...tokens.elevation.card,
    },
  });
}
