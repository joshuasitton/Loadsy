/**
 * Where Loadsy lives on the web, and the two pages Apple requires a link to.
 *
 * One place, because these strings go into App Store Connect by hand, into the app's
 * own footer, and into the privacy page's wording – and a policy URL that differs
 * from the one the listing carries is a rejection. `__tests__/site.test.ts` pins the
 * origin to the production API host in `eas.json`, since they are the same deployment.
 */

export const SITE_ORIGIN = 'https://loadsy.expo.app';

export const PRIVACY_PATH = '/privacy';
export const SUPPORT_PATH = '/support';

export const PRIVACY_URL = `${SITE_ORIGIN}${PRIVACY_PATH}`;
export const SUPPORT_URL = `${SITE_ORIGIN}${SUPPORT_PATH}`;

/** Moves whenever the privacy page's wording changes. The page shows it. */
export const PRIVACY_UPDATED = '25 September 2026';

/**
 * Where a person can write to – on the support page, the privacy page and the listing.
 * Decided 25 September. Written here rather than read from an `EXPO_PUBLIC_` variable,
 * as it first was: the variable was one more thing to set in EAS before every deploy,
 * and a build made without it told App Review that an address was still coming. It is
 * public by design, so it has no reason to live outside the code.
 */
export const SUPPORT_EMAIL = 'loadsysupport@gmail.com';

/**
 * The tagline, as phrases so the dashboard can set one per line. Defined once because
 * it was typed out in five places – the dashboard, the sign-in screen, both page
 * titles and the README – and "Right price." outlived v1's prices in all of them.
 * Decided 25 September: "Take pics. Know it fits." – the method and the answer, which
 * holds for the truck, a trailer and the person's own car alike. `__tests__/site.test.ts`
 * refuses a copy of it anywhere under `app/`, and a price claim in it.
 */
export const TAGLINE_PHRASES = ['Take pics.', 'Know it fits.'] as const;
export const TAGLINE = TAGLINE_PHRASES.join(' ');

/** Anthropic's published privacy policy, linked from the privacy page. */
export const ANTHROPIC_PRIVACY_URL = 'https://www.anthropic.com/legal/privacy';
