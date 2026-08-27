import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The two module-level switches in src/api/client.ts, which decide where every
 * request goes and whether it is made at all.
 *
 * Both are read once at import, so each case sets its environment and then
 * imports — and every import here is dynamic for that reason. This file runs in
 * its own process, so the env it sets cannot leak into another test file.
 *
 * The `?case=` suffix is what forces a fresh module for each case; Node keys its
 * registry on the full URL. It has to be a complete file URL rather than the
 * relative specifier used elsewhere, because the extension-guessing resolver in
 * scripts/ts-resolve.mjs would otherwise append `.ts` after the query string.
 */

const CLIENT = new URL('../src/api/client.ts', import.meta.url).href;

function load(testCase: string) {
  return import(`${CLIENT}?case=${testCase}`);
}

(globalThis as Record<string, unknown>).__DEV__ = false;

test('an explicit base URL is used verbatim', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://loadsy--abc.expo.app';
  const { resolveUrl } = await load('explicit-base');
  assert.equal(resolveUrl('/v1/detect'), 'https://loadsy--abc.expo.app/v1/detect');
});

test('with no base URL and no page origin, the failure says what to set', async () => {
  // This is the native case. It used to surface as a bare "Network request
  // failed", which reads as bad Wi-Fi and sends you debugging the wrong thing.
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  delete (globalThis as Record<string, unknown>).location;

  const { resolveUrl } = await load('no-host');

  assert.throws(
    () => resolveUrl('/v1/detect'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, 'ApiError');
      assert.match(error.message, /EXPO_PUBLIC_API_BASE_URL/);
      return true;
    },
  );
});

test('with a page origin and no base URL, the path stays relative', async () => {
  // The web case, and the reason the default is empty: /v1/detect is served by
  // this same app, so the page's own origin is the right host by construction.
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  (globalThis as Record<string, unknown>).location = { origin: 'https://loadsy.expo.app' };

  const { resolveUrl } = await load('same-origin');
  assert.equal(resolveUrl('/v1/detect'), '/v1/detect');
});

test('mocks default on in development and off everywhere else', async () => {
  // The default used to be "mocks unless someone remembered to say false", so a
  // release build that simply omitted the variable shipped fixture furniture to
  // real users and sized a truck around somebody else's sofa.
  delete process.env.EXPO_PUBLIC_USE_MOCKS;

  (globalThis as Record<string, unknown>).__DEV__ = true;
  const dev = await load('dev');
  assert.equal(dev.USE_MOCKS, true);

  (globalThis as Record<string, unknown>).__DEV__ = false;
  const release = await load('release');
  assert.equal(release.USE_MOCKS, false);
});

test('an explicit flag beats the environment in both directions', async () => {
  (globalThis as Record<string, unknown>).__DEV__ = true;
  process.env.EXPO_PUBLIC_USE_MOCKS = 'false';
  const liveInDev = await load('live-in-dev');
  assert.equal(liveInDev.USE_MOCKS, false);

  (globalThis as Record<string, unknown>).__DEV__ = false;
  process.env.EXPO_PUBLIC_USE_MOCKS = 'true';
  const mockInRelease = await load('mock-in-release');
  assert.equal(mockInRelease.USE_MOCKS, true);
});
