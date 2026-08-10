import * as Location from 'expo-location';

/**
 * `denied` covers every non-granted permission outcome, including the call itself
 * throwing (an unsupported browser, for instance) — the caller does not need to
 * distinguish "the user said no" from "the platform cannot ask", because both lead
 * to the same sticky screen-level fallback. `error` is a different failure class
 * entirely: permission was granted and the GPS fetch itself failed, which is worth
 * its own message rather than being folded into denial.
 */
export type LocationPermissionOutcome =
  | { status: 'granted'; lat: number; lng: number }
  | { status: 'denied' }
  | { status: 'error'; message: string };

/**
 * Requests foreground location permission and, if granted, a single fix.
 *
 * No `Platform.OS` branching: `expo-location`'s API is already cross-platform, and
 * the plan for this module is deliberately to stay that way rather than reaching for
 * platform-specific behaviour that isn't needed.
 */
export async function requestLocation(): Promise<LocationPermissionOutcome> {
  let permission;

  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    return { status: 'denied' };
  }

  if (permission.status !== 'granted') {
    return { status: 'denied' };
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      status: 'granted',
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch {
    return {
      status: 'error',
      message:
        "Couldn't get your location just now. Check that location services are on, and try again.",
    };
  }
}
