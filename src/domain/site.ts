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
export const PRIVACY_UPDATED = '23 September 2026';

/**
 * Where a person can write to. Null until one is chosen – a made-up address on a
 * privacy policy is worse than none, and the Chairman has not picked one yet. Set
 * `EXPO_PUBLIC_SUPPORT_EMAIL` for the build; the pages say so when it is absent.
 */
export const SUPPORT_EMAIL: string | null = (() => {
  const value = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
  return value ? value : null;
})();

/**
 * The tagline, as phrases so the dashboard can set one per line. Defined once because
 * it was typed out in five places – the dashboard, the sign-in screen, both page
 * titles and the README – and "Right price." outlived v1's prices in all of them.
 * Decided 25 September: it promises only what the app does. `__tests__/site.test.ts`
 * refuses a copy of it anywhere under `app/`, and a price claim in it.
 */
export const TAGLINE_PHRASES = ['Right size truck.', 'Right plan.'] as const;
export const TAGLINE = TAGLINE_PHRASES.join(' ');

/** Anthropic's published privacy policy, linked from the privacy page. */
export const ANTHROPIC_PRIVACY_URL = 'https://www.anthropic.com/legal/privacy';
