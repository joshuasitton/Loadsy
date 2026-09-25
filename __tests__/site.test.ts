import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { PRIVACY_URL, SITE_ORIGIN, SUPPORT_URL, TAGLINE } from '../src/domain/site';

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

/*
 * The tagline lived as five hand-typed copies until 25 September, and "Right price."
 * outlived v1's prices in every one of them. One constant now; these keep it that way.
 */

test('the tagline makes no price claim – v1 shows no prices', () => {
  assert.equal(TAGLINE, 'Take pics. Know it fits.');
  assert.doesNotMatch(TAGLINE, /price|cheap|save|\$/i);
});

test('no screen types the tagline out – they all read TAGLINE', () => {
  const dir = new URL('../app/', import.meta.url);
  const offenders = readdirSync(dir)
    .filter((name) => name.endsWith('.tsx'))
    .filter((name) => /Take pics\. Know it fits|Right size truck|Right price/.test(readFileSync(new URL(name, dir), 'utf8')));
  assert.deepEqual(offenders, []);
});
