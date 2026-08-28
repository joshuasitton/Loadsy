import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The switch that decides whether the sign-in screen, the sign-out control and
 * the prepared-inventory bar exist at all.
 *
 * Read once at import, so each case sets its environment and then imports. The
 * `?case=` suffix forces a fresh module — see __tests__/apiUrl.test.ts for why
 * it has to be a full file URL.
 */

const MODE = new URL('../src/demo/mode.ts', import.meta.url).href;

function load(testCase: string) {
  return import(`${MODE}?case=${testCase}`);
}

test('demo mode is on in development and off in a release', () => {
  // The bug this closes: it used to be "off unless the flag is exactly true", so
  // `npx expo start --web` — which sets no flags — ran with demo mode off. With
  // it off nothing ever signs in, so the sign-out control correctly rendered
  // nothing, and the app looked like it had lost a feature. Two dev servers
  // behaving differently for a reason that appears nowhere on screen.
  delete process.env.EXPO_PUBLIC_DEMO_MODE;

  return (async () => {
    (globalThis as Record<string, unknown>).__DEV__ = true;
    assert.equal((await load('dev')).DEMO_MODE, true);

    (globalThis as Record<string, unknown>).__DEV__ = false;
    assert.equal((await load('release')).DEMO_MODE, false);
  })();
});

test('SAFETY: a release build cannot carry the bundled sign-in by accident', async () => {
  // The only thing the old strict check was protecting, and it still holds: the
  // demo credentials are compiled into the bundle every visitor downloads, so a
  // store build must never present them as a login.
  (globalThis as Record<string, unknown>).__DEV__ = false;
  delete process.env.EXPO_PUBLIC_DEMO_MODE;
  assert.equal((await load('release-unset')).DEMO_MODE, false);

  // Nor by a near-miss value. Only the exact string turns it on.
  for (const almost of ['TRUE', 'True', '1', 'yes', '']) {
    process.env.EXPO_PUBLIC_DEMO_MODE = almost;
    assert.equal(
      (await load(`release-${almost || 'blank'}`)).DEMO_MODE,
      false,
      `"${almost}" enabled demo mode in a release build`,
    );
  }
});

test('an explicit flag beats the environment in both directions', async () => {
  (globalThis as Record<string, unknown>).__DEV__ = false;
  process.env.EXPO_PUBLIC_DEMO_MODE = 'true';
  assert.equal((await load('on-in-release')).DEMO_MODE, true);

  (globalThis as Record<string, unknown>).__DEV__ = true;
  process.env.EXPO_PUBLIC_DEMO_MODE = 'false';
  assert.equal((await load('off-in-dev')).DEMO_MODE, false);
});
