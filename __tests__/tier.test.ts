import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FLOW } from '../src/domain/flow';
import {
  FREE_FEATURES,
  FREE_STATUSES,
  isFreeStatus,
  isPremiumRoute,
  PREMIUM_FEATURES,
  unlocks,
  type GatedRoute,
} from '../src/domain/tier';
import { MOVE_STATUS_ORDER } from '../src/domain/types';

/**
 * Where the paywall falls, and what a build is allowed to do about it.
 *
 * The flag half uses the `?case=` fresh-import trick — see
 * __tests__/apiUrl.test.ts for why it has to be a full file URL.
 */

const BILLING = new URL('../src/billing/tier.ts', import.meta.url).href;

function loadBilling(testCase: string) {
  return import(`${BILLING}?case=${testCase}`);
}

test('Free covers the whole of getting a truck and a price, and stops there', () => {
  // The product claim, asserted rather than described: a free account gets from
  // photographs to a size to five quotes. If somebody moves a status across this
  // line, they have changed what Loadsy gives away, and that should not be
  // possible to do quietly.
  assert.deepEqual([...FREE_STATUSES], ['inventory', 'truckAndPrice']);

  assert.equal(isFreeStatus('inventory'), true);
  assert.equal(isFreeStatus('truckAndPrice'), true);
  assert.equal(isFreeStatus('packingPlan'), false);
  assert.equal(isFreeStatus('reservations'), false);
  assert.equal(isFreeStatus('movingDay'), false);
});

test('every status is on exactly one side of the line', () => {
  // Guards the case where a sixth status is added and silently lands in Premium
  // because that is what the negation does.
  for (const status of MOVE_STATUS_ORDER) {
    assert.equal(typeof isFreeStatus(status), 'boolean', status);
  }
  const free = MOVE_STATUS_ORDER.filter(isFreeStatus);
  assert.equal(free.length, FREE_STATUSES.length);
});

test('the setup flow is free until the Packing Plan', () => {
  const gated = FLOW.filter((step) => isPremiumRoute(step.route)).map((step) => step.route);
  assert.deepEqual(gated, ['/packing']);

  for (const route of ['/inventory', '/trip', '/truck', '/prices'] as const) {
    assert.equal(isPremiumRoute(route), false, `${route} should be free`);
  }
});

test('Truck Layout is behind the same wall as the plan that leads to it', () => {
  // It is a detour off /packing rather than a step in FLOW, so nothing derives
  // it. The most expensive computation in the app being reachable by URL for
  // free is exactly the bug this pins.
  assert.equal(isPremiumRoute('/layout-view'), true);
});

test('a free tier opens the free routes and no others', () => {
  const routes: GatedRoute[] = ['/inventory', '/trip', '/truck', '/prices', '/packing', '/layout-view'];
  assert.deepEqual(
    routes.filter((route) => unlocks('free', route)),
    ['/inventory', '/trip', '/truck', '/prices'],
  );
  // Premium opens everything, including the free routes — it is a superset, not
  // a different product.
  assert.deepEqual(routes.filter((route) => unlocks('premium', route)), routes);
});

test('the wall separates what is built from what is only planned', () => {
  // Packing Plan and Truck Layout are finished software behind a lock;
  // Reservations and Moving Day are not written. A wall that presented all four
  // the same way would be selling one pair on the strength of the other.
  const built = PREMIUM_FEATURES.filter((feature) => feature.built).map((f) => f.title);
  assert.deepEqual(built, ['Packing Plan', 'Truck Layout']);
  assert.equal(PREMIUM_FEATURES.some((feature) => !feature.built), true);

  // Everything offered as free has to actually exist — there is no "later" in
  // the tier somebody is using today.
  assert.equal(FREE_FEATURES.every((feature) => feature.built), true);
});

test('SAFETY: a shipped MVP build cannot hold Premium, whatever storage says', async () => {
  // `{"tier":"premium"}` in AsyncStorage is one line of devtools away. A build
  // with nothing to sell and no demo has to answer "free" to it — otherwise the
  // paywall is a suggestion.
  delete process.env.EXPO_PUBLIC_PREMIUM_FOR_SALE;
  delete process.env.EXPO_PUBLIC_DEMO_MODE;
  (globalThis as Record<string, unknown>).__DEV__ = false;

  const billing = await loadBilling('release');
  assert.equal(billing.PREMIUM_FOR_SALE, false);
  assert.equal(billing.PREMIUM_REACHABLE, false);
  assert.equal(billing.honour('premium'), 'free');
  assert.equal(billing.honour('free'), 'free');
});

test('SAFETY: only the exact string sells Premium', async () => {
  delete process.env.EXPO_PUBLIC_DEMO_MODE;
  (globalThis as Record<string, unknown>).__DEV__ = false;

  for (const almost of ['TRUE', 'True', '1', 'yes', '']) {
    process.env.EXPO_PUBLIC_PREMIUM_FOR_SALE = almost;
    const billing = await loadBilling(`almost-${almost || 'blank'}`);
    assert.equal(billing.PREMIUM_FOR_SALE, false, `"${almost}" put Premium on sale`);
    assert.equal(billing.honour('premium'), 'free', `"${almost}" granted Premium`);
  }
});

test('a demo build can preview Premium without anything being for sale', async () => {
  // The whole point of the preview: the solver is the most convincing thing
  // Loadsy does and it is now behind a wall, so a walkthrough has to be able to
  // show both sides. It must not require a purchase to exist.
  delete process.env.EXPO_PUBLIC_PREMIUM_FOR_SALE;
  process.env.EXPO_PUBLIC_DEMO_MODE = 'true';
  (globalThis as Record<string, unknown>).__DEV__ = false;

  const billing = await loadBilling('demo');
  assert.equal(billing.PREMIUM_FOR_SALE, false);
  assert.equal(billing.PREMIUM_REACHABLE, true);
  assert.equal(billing.honour('premium'), 'premium');
  // And back down, which matters more — the free experience is the one shipping.
  assert.equal(billing.honour('free'), 'free');
});
