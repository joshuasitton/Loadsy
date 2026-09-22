import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PRIVACY_URL, SITE_ORIGIN, SUPPORT_URL } from '../src/domain/site';

/**
 * The two URLs that go into App Store Connect by hand, pinned so the app's footer,
 * the privacy page and the listing cannot name different hosts.
 */

test('the site is the production deployment the app already calls', () => {
  // Same host as /v1/detect: one deployment, one URL to keep alive. If production
  // ever moves, the listing's privacy URL moves with it – and this test says so.
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')) as {
    build: { production: { env: Record<string, string> } };
  };
  assert.equal(SITE_ORIGIN, eas.build.production.env.EXPO_PUBLIC_API_BASE_URL);
});

test('the policy and support pages are routes on that site', () => {
  assert.equal(PRIVACY_URL, 'https://loadsy.expo.app/privacy');
  assert.equal(SUPPORT_URL, 'https://loadsy.expo.app/support');
});
