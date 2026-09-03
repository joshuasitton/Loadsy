import { DEMO_MODE } from '../demo/mode';
import type { Tier } from '../domain/tier';

/**
 * Whether Premium can be bought in this build.
 *
 * Hard false by default, in every environment including development. The other
 * two switches in this app (`USE_MOCKS`, `DEMO_MODE`) default on in dev because
 * a developer wants the convenient thing; this one defaults off because a
 * developer wants the HONEST thing. Premium is not shipping with the MVP, so the
 * wall that says "coming after launch" is the real screen — turning it into an
 * upgrade path locally would mean nobody ever looks at what users will see.
 *
 * Setting the flag does not make a purchase work. There is no billing in this
 * app: no product ids, no receipts, no server. The flag only changes the wall's
 * copy, and the wall says so out loud when it is on.
 */
export const PREMIUM_FOR_SALE = process.env.EXPO_PUBLIC_PREMIUM_FOR_SALE === 'true';

/**
 * Whether this build may hold Premium at all, for any reason.
 *
 * Two, and only two: something to sell, or a demo showing what there will be to
 * sell. A store build of the MVP has neither.
 */
export const PREMIUM_REACHABLE = PREMIUM_FOR_SALE || DEMO_MODE;

/**
 * The tier this build is willing to honour, given what storage claims.
 *
 * Kept out of the React store and out of the screens because it is the one rule
 * that must not be re-implemented anywhere: `{"tier":"premium"}` in AsyncStorage
 * is a line of devtools away, and a build with nothing to sell has to answer
 * "free" to it. Everything that resolves a tier goes through here.
 */
export function honour(stored: Tier): Tier {
  return stored === 'premium' && PREMIUM_REACHABLE ? 'premium' : 'free';
}
