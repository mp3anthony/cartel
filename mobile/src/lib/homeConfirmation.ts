/**
 * The one-time confirmation Home shows after a shop ends (#103). Held in memory only, never
 * in the URL, so a reload or a shared link shows nothing. A caller `set`s it just before
 * navigating to Home; Home `peek`s on focus and `clear`s on blur. The TTL is a backstop: if
 * the navigation failed, a stale entry must not appear on some later visit to Home.
 */

/** Shown after Done shopping. */
export const SHOP_RECORDED_DONE = 'Shop recorded. Your list is unticked and ready for next time.';
/** Shown after Continue at another store, once a store is picked or kept. */
export const SHOP_RECORDED_CONTINUE = 'Shop recorded. Ticked items stay ticked for the next store.';
/** Shown after Reset list. */
export const LIST_RESET = 'List reset. Everything is unticked and ready for next time.';

/** How long an entry stays valid after it is set. */
export const HOME_CONFIRMATION_TTL_MS = 30_000;

export type HomeConfirmation = { id: number; message: string; setAt: number };

let current: HomeConfirmation | null = null;
let nextId = 1;

/** Replaces any existing entry. */
export function setHomeConfirmation(message: string, now: number = Date.now()): HomeConfirmation {
  current = { id: nextId++, message, setAt: now };
  return current;
}

/** The entry if there is one and it has not expired; does not consume it. */
export function peekHomeConfirmation(now: number = Date.now()): HomeConfirmation | null {
  if (current === null) {
    return null;
  }
  if (now - current.setAt > HOME_CONFIRMATION_TTL_MS) {
    current = null;
    return null;
  }
  return current;
}

export function clearHomeConfirmation(): void {
  current = null;
}
