/**
 * Whether the demo affordances are present: the sign-in screen, the sign-out
 * control in every header, and the prepared-inventory bar.
 *
 * The rule is the same one `USE_MOCKS` follows, and for the same reason —
 * **on in development, off in a release, an explicit value winning either way.**
 *
 * It used to be "off unless the flag is exactly true", which was wrong in a way
 * that was easy to miss: `npx expo start --web` sets no flags, so the ordinary
 * dev server had demo mode off, and with it off nothing ever signs in — which
 * meant SignOutButton correctly rendered nothing and the app looked like it had
 * simply lost its sign-out. Two dev servers behaving differently for a reason
 * that appears nowhere on screen is a trap, and it caught exactly the person it
 * was going to catch.
 *
 * The safety property that mattered is unchanged: a release build has no
 * `__DEV__`, so a store build still cannot carry a bundled password by accident.
 * That is the only thing the strict check was protecting, and it still holds.
 */
export const DEMO_MODE = (() => {
  const flag = process.env.EXPO_PUBLIC_DEMO_MODE;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  // Not destructured: react-native injects __DEV__ as a global, and it is absent
  // under the plain-node test runner.
  return typeof __DEV__ !== 'undefined' && __DEV__;
})();
