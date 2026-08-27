import * as Location from 'expo-location';
import { normaliseAddress, type Address } from '../domain/address';

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
  /**
   * `address` carries whatever the OS geocoder could resolve — often the street
   * and city as well as the ZIP. The trip screen fills the whole form from it;
   * callers that only want the ZIP can keep reading `zip`.
   */
  | { status: 'ok'; zip: string; address: Address }
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

    // ZIP+4 sometimes comes back as "94110-1234"; normaliseAddress keeps the five.
    const place = places.find((p) => {
      const code = p.postalCode?.split('-')[0]?.trim();
      return code && US_ZIP.test(code);
    });

    if (!place) return { status: 'unavailable', reason: 'no postal code for this location' };

    const address = normaliseAddress({
      // `name` is the street number and `street` the road; together they are the
      // line a person would write. Either can be absent, and the join drops blanks.
      line1: [place.streetNumber ?? place.name, place.street].filter(Boolean).join(' '),
      city: place.city ?? '',
      state: place.region ?? '',
      postalCode: place.postalCode ?? '',
    });
    return { status: 'ok', zip: address.postalCode, address };
  } catch (error) {
    // reverseGeocodeAsync throws outright on web, and getCurrentPositionAsync
    // throws when Location Services are switched off device-wide.
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'location lookup failed',
    };
  }
}
