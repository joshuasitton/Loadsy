/**
 * "Near me" without asking where the person is.
 *
 * The app gave up the location permission with prices (15 September), and taking it back
 * to find the nearest depot would put the permission prompt and the privacy label back
 * with it. A maps search does the job instead: the maps app already knows where the phone
 * is, under its own permission, and Loadsy only hands it the words to search for. Nothing
 * about the person's location reaches Loadsy.
 *
 * Apple Maps on iOS, because it is always installed; Google Maps everywhere else – its
 * search URL opens the app when there is one and the website when there is not.
 */

export type MapsPlatform = 'ios' | 'other';

export function nearMeUrl(query: string, platform: MapsPlatform): string {
  const q = encodeURIComponent(query);
  return platform === 'ios' ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
}
