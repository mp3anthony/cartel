import { Platform } from 'react-native';

const MAX_LENGTH = 300;

/**
 * A one-line description of the device for a report (#109), captured automatically so
 * the form no longer asks for it. On web it is the browser's user agent, tagged when the
 * page runs as an installed home-screen app, plus the screen size. On native it is the
 * platform and its version.
 *
 * A hint, not a fact: Safari may freeze the iOS version in the user agent string
 * (unverified), so the version shown for an iPhone can be older than the real one.
 */
export function describeDevice(): string {
  let text: string;

  if (Platform.OS === 'web') {
    const parts: string[] = [];

    if (typeof navigator !== 'undefined') {
      let installed = false;
      try {
        installed =
          (typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(display-mode: standalone)').matches) ||
          (navigator as { standalone?: boolean }).standalone === true;
      } catch {
        installed = false;
      }
      parts.push(`${navigator.userAgent}${installed ? ' · installed app' : ''}`);
    }

    if (typeof window !== 'undefined' && typeof window.screen !== 'undefined') {
      parts.push(`${window.screen.width}×${window.screen.height}`);
    }

    text = parts.join(' · ');
  } else {
    text = `${Platform.OS} ${Platform.Version}`;
  }

  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
}
