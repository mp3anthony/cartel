import { useMemo, useRef } from 'react';
import {
  Platform,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

/**
 * A handle on a screen's page `ScrollView` for drag auto-scroll (#123): current offset,
 * scrollable range, a jump-to-offset and the visible area. It tracks everything in refs,
 * so scrolling never re-renders the screen. Pass it to `Screen` as `pageScroll`, and to
 * `ReorderableList` as `autoScroll`.
 */
export type PageScroll = {
  ref: React.RefObject<ScrollView | null>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onContentSizeChange: (width: number, height: number) => void;
  getOffset: () => number;
  getMaxOffset: () => number;
  scrollTo: (y: number) => void;
  /** The visible area of the scroller as top/bottom, in the coordinates of a drag's `moveY`. */
  measureViewport: (callback: (top: number, bottom: number) => void) => void;
};

type WebScroller = ScrollView & { getScrollableNode?: () => { scrollTop?: number } | null };
type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

export function usePageScroll(): PageScroll {
  const ref = useRef<ScrollView | null>(null);
  const state = useRef({ offset: 0, viewport: 0, content: 0 });

  return useMemo<PageScroll>(() => {
    const getOffset = () => {
      if (Platform.OS === 'web') {
        const scroller = ref.current as WebScroller | null;
        const node = scroller?.getScrollableNode?.() ?? (scroller as unknown as { scrollTop?: number } | null);

        if (typeof node?.scrollTop === 'number') {
          return node.scrollTop;
        }
      }

      return state.current.offset;
    };

    return {
      ref,
      onScroll: (event) => {
        state.current.offset = event.nativeEvent.contentOffset.y;
      },
      onLayout: (event) => {
        state.current.viewport = event.nativeEvent.layout.height;
      },
      // The content container's size, not the DOM scrollHeight: the same basis as the
      // viewport height from onLayout, so the difference is the scrollable range.
      onContentSizeChange: (_width, height) => {
        state.current.content = height;
      },
      getOffset,
      getMaxOffset: () => Math.max(0, state.current.content - state.current.viewport),
      scrollTo: (y) => {
        ref.current?.scrollTo({ y, animated: false });
        state.current.offset = y;
      },
      measureViewport: (callback) => {
        const scroller = ref.current;

        if (!scroller) {
          return;
        }

        (scroller as unknown as Measurable).measureInWindow((_x, y, _width, height) => {
          let top = y;
          let bottom = y + height;

          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            // measureInWindow is viewport-relative here, a drag's moveY is a page position
            // (they differ by window.scrollY), and the on-screen keyboard shrinks what is
            // visible. Clip to the visual viewport, then convert to page coordinates.
            const visual = window.visualViewport;

            if (visual) {
              top = Math.max(top, visual.offsetTop);
              bottom = Math.min(bottom, visual.offsetTop + visual.height);
            }

            top += window.scrollY;
            bottom += window.scrollY;
          }

          if (bottom - top > 0) {
            callback(top, bottom);
          }
        });
      },
    };
  }, []);
}
