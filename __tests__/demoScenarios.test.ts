import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDemoMove, DEMO_SCENARIOS, findScenario } from '../src/demo/scenarios';
import { buildRecommendation, usableCapacityCuFt } from '../src/domain/truck';
import { canLeaveInventory, unresolvedCount } from '../src/domain/confidence';
import { allItems, adjustedVolumeCuFt } from '../src/domain/volume';
import { buildPackingPlan } from '../src/domain/packingPlan';
import type { TruckSize } from '../src/domain/types';

/**
 * These scenarios get shown to people. A demo that recommends the wrong truck, or
 * stalls behind the review gate halfway through a walkthrough, fails in the one
 * setting where there is no chance to fix it — so the properties the demo relies
 * on are asserted here rather than trusted.
 */

/**
 * The truck each scenario is meant to land on. Not decoration: the sizes come
 * from published interior volumes and a 15% reserve, and a change to either
 * silently reshuffles what the demo shows. This is the alarm for that.
 */
const EXPECTED: Record<string, TruckSize> = {
  studio: '10ft',
  'one-bed': '15ft',
  'two-bed': '20ft',
  'three-bed-house': '26ft',
};

test('every scenario recommends the truck it was built to recommend', () => {
  for (const scenario of DEMO_SCENARIOS) {
    const recommendation = buildRecommendation(buildDemoMove(scenario));
    assert.equal(
      recommendation.size,
      EXPECTED[scenario.id],
      `${scenario.id} recommended ${recommendation.size}`,
    );
  }
});

test('the four scenarios span four different trucks', () => {
  // The whole reason there are four. If two collapse onto the same size, the set
  // stops demonstrating the range and nobody notices from the screen.
  const sizes = DEMO_SCENARIOS.map((s) => buildRecommendation(buildDemoMove(s)).size);
  assert.equal(new Set(sizes).size, DEMO_SCENARIOS.length);
});

test('no scenario is loaded past about 92 percent of the truck it picks', () => {
  // Comfortably inside its band, on purpose. A scenario sitting at 99% is one
  // capacity revision away from jumping a size mid-demo.
  for (const scenario of DEMO_SCENARIOS) {
    const move = buildDemoMove(scenario);
    const fill = adjustedVolumeCuFt(move) / usableCapacityCuFt(buildRecommendation(move).size);
    assert.ok(fill <= 0.92, `${scenario.id} fills ${(fill * 100).toFixed(0)}% of its truck`);
    // And not so empty that the recommendation looks careless.
    assert.ok(fill >= 0.7, `${scenario.id} only fills ${(fill * 100).toFixed(0)}%`);
  }
});

test('no scenario stalls behind the confidence gate', () => {
  for (const scenario of DEMO_SCENARIOS) {
    const move = buildDemoMove(scenario);
    assert.equal(unresolvedCount(move), 0, `${scenario.id} has items needing review`);
    assert.ok(canLeaveInventory(move), `${scenario.id} cannot leave the inventory screen`);
  }
});

test('every scenario produces a packing plan with load steps and a truck map', () => {
  for (const scenario of DEMO_SCENARIOS) {
    const move = buildDemoMove(scenario);
    const plan = buildPackingPlan(move.id, allItems(move), buildRecommendation(move).size);
    assert.ok(plan, `${scenario.id} produced no plan`);
    assert.ok(plan.loadSteps.length > 0, `${scenario.id} produced no load steps`);
    assert.ok(plan.truckMapSVG, `${scenario.id} produced no truck map`);
  }
});

test('item ids are unique within a scenario', () => {
  // Duplicated ids make React drop rows and make removeItem delete two things.
  for (const scenario of DEMO_SCENARIOS) {
    const ids = allItems(buildDemoMove(scenario)).map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, `${scenario.id} has duplicate item ids`);
  }
});

test('loading a scenario twice produces identical state', () => {
  // Nothing here may read a clock or a random source: tapping the same scenario
  // again must restore the demo, not start a second move that resembles it.
  for (const scenario of DEMO_SCENARIOS) {
    assert.deepEqual(buildDemoMove(scenario), buildDemoMove(scenario));
  }
});

test('every scenario starts on the first step', () => {
  // A scenario supplies the inventory and stops. Walking forward is the demo.
  for (const scenario of DEMO_SCENARIOS) {
    assert.equal(buildDemoMove(scenario).status, 'inventory');
  }
});

test('scenario ids are unique and findable', () => {
  const ids = DEMO_SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(findScenario(id)?.id, id);
  assert.equal(findScenario('no-such-scenario'), null);
});

test('every room carries at least one photo and at least one item', () => {
  for (const scenario of DEMO_SCENARIOS) {
    for (const room of buildDemoMove(scenario).rooms) {
      assert.ok(room.photoIds.length > 0, `${scenario.id}/${room.name} has no photos`);
      assert.ok(room.items.length > 0, `${scenario.id}/${room.name} has no items`);
      assert.equal(new Set(room.photoIds).size, room.photoIds.length);
    }
  }
});
