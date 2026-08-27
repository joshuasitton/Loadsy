/**
 * The demo sign-in.
 *
 * READ THIS BEFORE TRUSTING IT WITH ANYTHING.
 *
 * These credentials are compiled into the JavaScript bundle, which is downloaded
 * by every visitor. Anyone can read them out of the page source in about ten
 * seconds, and they are in a public repository besides. This is not
 * authentication and it must never be put in front of anything that matters — no
 * real user data, no payment details, no admin surface.
 *
 * What it IS: a front door for a demo link. It makes the walkthrough start where
 * a real product starts, keeps a URL passed around a room from opening straight
 * into someone else's half-finished move, and gives testers an obvious place to
 * reset. That is the entire job.
 *
 * Real auth means a server that holds the password hash and issues a session the
 * client cannot mint for itself. None of that is here. When it arrives, this file
 * should be deleted rather than extended.
 */

/** Overridable per deployment, so a shared link can be given a different pair. */
export const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL ?? 'demo@loadsy.app';
export const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? 'moveday';

export interface DemoUser {
  email: string;
  displayName: string;
  /** How this session was started, so the UI can say so honestly. */
  provider: 'password' | 'google';
}

export type SignInResult =
  | { ok: true; user: DemoUser }
  | { ok: false; reason: string };

/**
 * Checks a typed email and password against the demo pair.
 *
 * The email match ignores case and surrounding space, because a phone keyboard
 * capitalises the first letter and a demo that rejects "Demo@loadsy.app" in front
 * of an audience is a self-inflicted wound. The password is compared exactly:
 * loosening that would be a habit worth not forming, even here.
 */
export function signInWithPassword(email: string, password: string): SignInResult {
  if (email.trim() === '' || password === '') {
    return { ok: false, reason: 'Enter the demo email and password' };
  }
  const emailMatches = email.trim().toLowerCase() === DEMO_EMAIL.toLowerCase();
  if (!emailMatches || password !== DEMO_PASSWORD) {
    // One message for both failures. Saying which half was wrong tells an
    // attacker which accounts exist — pointless here, but the shape of the
    // answer is the part worth getting right.
    return { ok: false, reason: 'That email and password do not match the demo account' };
  }
  return {
    ok: true,
    user: { email: DEMO_EMAIL, displayName: 'Demo User', provider: 'password' },
  };
}

/**
 * Stands in for Google sign-in.
 *
 * There is no OAuth here and the button does not talk to Google. Wiring the real
 * thing needs a Google Cloud OAuth client ID per platform, a redirect URI
 * registered against each one, and expo-auth-session to carry the exchange — none
 * of which can be invented on this side, so the button completes locally instead
 * and the screen says as much rather than implying a round trip that never
 * happened.
 *
 * Replacing it is a change to this function and the label above the button; every
 * caller already treats the result as a promise that can fail.
 */
export function signInWithGoogle(): SignInResult {
  return {
    ok: true,
    user: { email: DEMO_EMAIL, displayName: 'Demo User', provider: 'google' },
  };
}
