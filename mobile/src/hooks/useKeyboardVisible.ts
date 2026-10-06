import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'radio',
  'submit',
  'reset',
  'file',
  'range',
  'color',
  'image',
  'hidden',
]);

function isTextFieldFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  if (tag === 'TEXTAREA') {
    return true;
  }
  if (tag === 'INPUT') {
    return !NON_TEXT_INPUT_TYPES.has(((el as HTMLInputElement).type || 'text').toLowerCase());
  }
  return el.isContentEditable;
}

/**
 * Whether the on-screen keyboard is (probably) up, for hiding the bottom pill (#158).
 *
 * Web: a focused text field on a touch device. iOS Safari does not resize the layout
 * viewport for its keyboard, and `visualViewport` sizing is fragile there, so focus is the
 * signal instead. Only active when the primary pointer is coarse (a desktop browser
 * never has an on-screen keyboard). After `focusout` the active element is re-read on the
 * next frame, so moving between two fields does not flicker the pill. Native: the
 * `Keyboard` show/hide events.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (
        typeof document === 'undefined' ||
        typeof window === 'undefined' ||
        !window.matchMedia ||
        !window.matchMedia('(pointer: coarse)').matches
      ) {
        return undefined;
      }
      let frame: number | null = null;
      const sync = () => setVisible(isTextFieldFocused());
      const onFocusIn = () => {
        if (frame !== null) {
          cancelAnimationFrame(frame);
          frame = null;
        }
        sync();
      };
      const onFocusOut = () => {
        if (frame !== null) {
          cancelAnimationFrame(frame);
        }
        frame = requestAnimationFrame(() => {
          frame = null;
          sync();
        });
      };
      document.addEventListener('focusin', onFocusIn);
      document.addEventListener('focusout', onFocusOut);
      sync();
      return () => {
        document.removeEventListener('focusin', onFocusIn);
        document.removeEventListener('focusout', onFocusOut);
        if (frame !== null) {
          cancelAnimationFrame(frame);
        }
      };
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
