import * as Location from 'expo-location';

/**
 * Resolving the user's origin ZIP from the device, so the prices screen can start
 * with a sensible default instead of an empty text field.
 *
 * Deliberately non-blocking and always optional: manual entry stays the primary
 * path. Location is a coarse convenience here — we need a five-digit ZIP, not a
 * position — so every failure mode degrades to "let them type it" rather than
 * surfacing an error the user cannot act on.
 *
 * Privacy: the coordinate never leaves the device by our hand. iOS resolves the
 * postal code through the OS geocoder, and only the resulting ZIP is stored.
 */

export type DeviceZipResult =
  | { status: 'ok'; zip: string }
  /** The user said no. Never ask again in the same session; show manual entry. */
  | { status: 'denied' }
  /** Location is off, unsupported (web has no geocoder), or the lookup failed. */
  | { status: 'unavailable'; reason: string };

const US_ZIP = /^\d{5}$/;

/** True when permission is already granted, so we can fill in without prompting. */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

/**
 * @param request when false, never shows the system prompt — used on first paint so
 * an unprompted permission dialog cannot appear before the screen explains why.
 */
export async function getDeviceZip({ request = false } = {}): Promise<DeviceZipResult> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    let granted = existing.granted;

    if (!granted) {
      if (!request) return { status: 'unavailable', reason: 'not yet permitted' };
      if (!existing.canAskAgain) return { status: 'denied' };
      granted = (await Location.requestForegroundPermissionsAsync()).granted;
      if (!granted) return { status: 'denied' };
    }

    // Balanced accuracy: a ZIP covers miles, so a high-accuracy GPS fix would cost
    // battery and seconds of latency for precision the answer cannot use.
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });

    const places = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });

    // ZIP+4 sometimes comes back as "94110-1234"; we only store the five.
    const zip = places.map((place) => place.postalCode?.split('-')[0]?.trim()).find((code) => code && US_ZIP.test(code));

    if (!zip) return { status: 'unavailable', reason: 'no postal code for this location' };
    return { status: 'ok', zip };
  } catch (error) {
    // reverseGeocodeAsync throws outright on web, and getCurrentPositionAsync
    // throws when Location Services are switched off device-wide.
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'location lookup failed',
    };
  }
}
