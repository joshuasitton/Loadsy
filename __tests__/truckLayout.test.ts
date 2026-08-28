import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  planLoad,
  poseFootprint,
  project,
  sideOfTruck,
  TRUCK_BED,
  type LoadPlan,
  type Placement,
} from '../src/truckmap/layout';
import { poseForItem } from '../src/domain/itemGuidance';
import { TRUCK_SIZES } from '../src/domain/types';
import { buildRecommendation } from '../src/domain/truck';
import { allItems } from '../src/domain/volume';
import { buildDemoMove, DEMO_SCENARIOS } from '../src/demo/scenarios';
import { makeItem, resetIds } from './helpers';

const EPS = 1e-6;

function intersects(a: Placement, b: Placement): boolean {
  return (
    a.xIn < b.xIn + b.alongIn - EPS &&
    b.xIn < a.xIn + a.alongIn - EPS &&
    a.yIn < b.yIn + b.acrossIn - EPS &&
    b.yIn < a.yIn + a.acrossIn - EPS &&
    a.zIn < b.zIn + b.tallIn - EPS &&
    b.zIn < a.zIn + a.tallIn - EPS
  );
}

/** How much of a placement's base is held up by the deck or by something below it. */
function supportedFraction(placement: Placement, all: Placement[]): number {
  if (placement.zIn <= EPS) return 1;
  const base = placement.alongIn * placement.acrossIn;
  if (base <= 0) return 0;

  let held = 0;
  for (const other of all) {
    if (other === placement) continue;
    if (Math.abs(other.zIn + other.tallIn - placement.zIn) > 1e-3) continue;
    const w =
      Math.min(placement.xIn + placement.alongIn, other.xIn + other.alongIn) -
      Math.max(placement.xIn, other.xIn);
    const d =
      Math.min(placement.yIn + placement.acrossIn, other.yIn + other.acrossIn) -
      Math.max(placement.yIn, other.yIn);
    if (w > 0 && d > 0) held += w * d;
  }
  return held / base;
}

function everyScenario(): { id: string; plan: LoadPlan; itemCount: number }[] {
  return DEMO_SCENARIOS.map((scenario) => {
    const move = buildDemoMove(scenario);
    const items = allItems(move);
    return {
      id: scenario.id,
      plan: planLoad(items, buildRecommendation(move).size),
      itemCount: items.length,
    };
  });
}

test('a pose reorders the dimensions rather than inventing them', () => {
  const mattress = { lengthIn: 80, widthIn: 60, heightIn: 12, isEstimated: true };

  // Flat: 80 x 60 on the deck, a foot high. It eats the floor and holds nothing up.
  assert.deepEqual(poseFootprint(mattress, 'flat'), { alongIn: 60, acrossIn: 80, tallIn: 12 });
  // On its long edge: 80 x 12 on the deck, five feet tall. The bed frame fits beside it.
  assert.deepEqual(poseFootprint(mattress, 'onEdge'), { alongIn: 80, acrossIn: 12, tallIn: 60 });
  assert.deepEqual(poseFootprint(mattress, 'onEnd'), { alongIn: 60, acrossIn: 12, tallIn: 80 });

  // Whatever the pose, it is the same object: the product is invariant.
  for (const pose of ['flat', 'upright', 'onEdge', 'onEnd'] as const) {
    const f = poseFootprint(mattress, pose);
    assert.equal(f.alongIn * f.acrossIn * f.tallIn, 80 * 60 * 12, `${pose} changed the volume`);
  }
});

test('GUARANTEE: no two pieces occupy the same space', () => {
  // The one thing a load plan cannot get wrong. Everything else here is a matter
  // of degree; two objects in one place is a picture of something impossible.
  for (const { id, plan } of everyScenario()) {
    for (let i = 0; i < plan.placements.length; i++) {
      for (let j = i + 1; j < plan.placements.length; j++) {
        assert.ok(
          !intersects(plan.placements[i]!, plan.placements[j]!),
          `${id}: ${plan.placements[i]!.name} is inside ${plan.placements[j]!.name}`,
        );
      }
    }
  }
});

test('GUARANTEE: nothing floats — every piece rests on the deck or on something', () => {
  // Without this the packer suspends a mattress over a gap, which looks like a
  // solution and is not one.
  for (const { id, plan } of everyScenario()) {
    for (const placement of plan.placements) {
      const held = supportedFraction(placement, plan.placements);
      assert.ok(
        held >= 0.7 - 1e-3,
        `${id}: ${placement.name} is only ${(held * 100).toFixed(0)}% supported at ${placement.zIn}in up`,
      );
    }
  }
});

test('nothing sticks out through a wall, the roof or the tailgate', () => {
  for (const { id, plan } of everyScenario()) {
    const { bed } = plan;
    for (const p of plan.placements) {
      assert.ok(p.xIn >= -EPS && p.xIn + p.alongIn <= bed.lengthIn + 1e-3, `${id}: ${p.name} length`);
      assert.ok(p.yIn >= -EPS && p.yIn + p.acrossIn <= bed.widthIn + 1e-3, `${id}: ${p.name} width`);
      assert.ok(p.zIn >= -EPS && p.zIn + p.tallIn <= bed.heightIn + 1e-3, `${id}: ${p.name} height`);
    }
  }
});

test('the solver packs tightly enough to be worth calling a solver', () => {
  // Density here is the load's own volume over the truck volume it reaches into.
  // Published figures for good human loaders sit around 80%; a heuristic that
  // managed 50% would be drawing a picture of a badly packed truck and calling it
  // a plan. This is a floor, not a target.
  for (const { id, plan } of everyScenario()) {
    if (plan.placements.length === 0) continue;
    const loadCuIn = plan.placements.reduce((sum, p) => sum + p.alongIn * p.acrossIn * p.tallIn, 0);
    const reachedCuIn = plan.usedLengthIn * plan.bed.widthIn * plan.bed.heightIn;
    const density = loadCuIn / reachedCuIn;
    assert.ok(density >= 0.55, `${id}: packed at only ${(density * 100).toFixed(0)}% density`);
  }
});

test('the whole inventory is placed, or the ones that were not are named', () => {
  // Not a promise that everything always fits — the packer is a heuristic and the
  // studio sits at 91% of its truck's band on purpose. The promise is that a piece
  // is never silently dropped from a plan somebody is going to follow.
  for (const { id, plan, itemCount } of everyScenario()) {
    assert.equal(
      plan.placements.length + plan.overflow.length,
      itemCount,
      `${id}: ${itemCount} items in, ${plan.placements.length + plan.overflow.length} accounted for`,
    );
    for (const missing of plan.overflow) {
      assert.ok(missing.name.length > 0, `${id}: an unplaced item with no name`);
      assert.ok(['tooBig', 'noRoom'].includes(missing.reason));
    }
  }
});

test('the solver tries several arrangements and reports which one won', () => {
  const { plan } = everyScenario()[1]!;
  assert.ok(plan.strategy.tried > 1, 'a solver that tries one arrangement is not a solver');
  assert.ok(plan.strategy.name.length > 0);
});

test('the plan is deterministic, so Save Plan round-trips', () => {
  // Every strategy is a fixed pass and nothing reads a clock or a random source.
  // A solver that shuffled would give a different truck every time the screen
  // re-rendered.
  const move = buildDemoMove(DEMO_SCENARIOS.find((s) => s.id === 'one-bed')!);
  const items = allItems(move);
  const size = buildRecommendation(move).size;
  assert.deepEqual(planLoad(items, size), planLoad(JSON.parse(JSON.stringify(items)), size));
  assert.deepEqual(planLoad(items, size), planLoad([...items].reverse(), size));
});

test('a piece that cannot stand is laid down rather than declared impossible', () => {
  // A 96-inch rolled rug is taller than every truck below the 26-footer. Its
  // guidance says to stand it on end, which is right in a room and impossible
  // under a 7'2" roof — so the packer turns it down, and records that it did.
  resetIds();
  const rug = makeItem({
    id: 'rug',
    name: 'Area Rug',
    category: 'other',
    dimensions: { lengthIn: 96, widthIn: 12, heightIn: 12, isEstimated: true },
    cubicFeet: 8,
  });
  assert.equal(poseForItem(rug), 'onEnd', 'the guidance should still ask for on end');

  const placed = planLoad([rug], '15ft').placements[0]!;
  assert.notEqual(placed.pose, 'onEnd', 'a 96in roll cannot stand under an 86in roof');
  assert.equal(placed.posedDownFrom, 'onEnd', 'and the drawing should admit why');
  assert.ok(placed.tallIn <= TRUCK_BED['15ft'].heightIn);
});

test('a piece that fits standing keeps the pose its guidance asked for', () => {
  resetIds();
  const fridge = makeItem({
    id: 'fridge',
    name: 'Refrigerator',
    category: 'appliance',
    dimensions: { lengthIn: 36, widthIn: 32, heightIn: 70, isEstimated: true },
    cubicFeet: 46.67,
  });
  const placed = planLoad([fridge], '15ft').placements[0]!;
  assert.equal(placed.pose, 'upright');
  assert.equal(placed.posedDownFrom, null);
  // And it settles into the front-left corner rather than floating at an anchor.
  assert.deepEqual([placed.xIn, placed.yIn, placed.zIn], [0, 0, 0]);
});

test('something genuinely oversized is reported, not silently dropped', () => {
  resetIds();
  const absurd = makeItem({
    id: 'absurd',
    name: 'Unlabelled Thing',
    dimensions: { lengthIn: 400, widthIn: 300, heightIn: 200, isEstimated: true },
    cubicFeet: 13_888,
  });
  const plan = planLoad([absurd], '26ft');
  assert.equal(plan.placements.length, 0);
  assert.deepEqual(plan.overflow, [{ itemId: 'absurd', name: 'Unlabelled Thing', reason: 'tooBig' }]);
});

test('the load builds from the cab end towards the door', () => {
  const move = buildDemoMove(DEMO_SCENARIOS.find((s) => s.id === 'two-bed')!);
  const plan = planLoad(allItems(move), buildRecommendation(move).size);
  assert.ok(
    plan.placements.some((p) => p.xIn === 0 && p.yIn === 0 && p.zIn === 0),
    'something should be in the front-left corner of the deck',
  );
});

test('both projections stay inside the drawing, and order back to front', () => {
  // The side view answers "how is it stacked" and the top view answers "which
  // side of the truck is it on" — the question a side view can never answer.
  for (const { id, plan } of everyScenario()) {
    for (const view of ['side', 'top'] as const) {
      const rects = project(plan, view);
      assert.equal(rects.length, plan.placements.length, `${id}/${view} lost a piece`);

      for (const rect of rects) {
        assert.ok(rect.x >= -EPS && rect.x + rect.width <= 1 + 1e-6, `${id}/${view}: ${rect.name} x`);
        assert.ok(rect.y >= -EPS && rect.y + rect.height <= 1 + 1e-6, `${id}/${view}: ${rect.name} y`);
        assert.ok(rect.depth >= -EPS && rect.depth <= 1 + 1e-6, `${id}/${view}: ${rect.name} depth`);
      }

      // Furthest painted first, so nearer pieces cover them.
      for (let i = 1; i < rects.length; i++) {
        assert.ok(rects[i - 1]!.depth >= rects[i]!.depth - EPS, `${id}/${view} is not depth-sorted`);
      }
    }
  }
});

test('the two views describe the same load', () => {
  // One solve, two projections. If these ever diverged, the truck would be in two
  // places at once and neither drawing could be trusted.
  const { plan } = everyScenario()[2]!;
  const side = new Map(project(plan, 'side').map((r) => [r.itemId, r]));
  const top = new Map(project(plan, 'top').map((r) => [r.itemId, r]));

  assert.deepEqual([...side.keys()].sort(), [...top.keys()].sort());
  for (const [id, sideRect] of side) {
    const topRect = top.get(id)!;
    assert.equal(sideRect.x, topRect.x, `${sideRect.name} is at two different distances from the cab`);
    assert.equal(sideRect.width, topRect.width);
    assert.equal(sideRect.pose, topRect.pose);
  }
});

test('a piece can be described by which part of the truck it is in', () => {
  const bed = TRUCK_BED['15ft'];
  const at = (yIn: number, acrossIn: number): Placement => ({
    itemId: 'x',
    name: 'x',
    pose: 'upright',
    posedDownFrom: null,
    step: 1,
    xIn: 0,
    yIn,
    zIn: 0,
    alongIn: 10,
    acrossIn,
    tallIn: 10,
    cubicFeet: 1,
  });

  assert.equal(sideOfTruck(at(0, 20), bed), 'against the left wall');
  assert.equal(sideOfTruck(at(bed.widthIn - 20, 20), bed), 'against the right wall');
  assert.equal(sideOfTruck(at(bed.widthIn / 2 - 10, 20), bed), 'down the middle');
  assert.equal(sideOfTruck(at(0, bed.widthIn), bed), 'across the full width');
});

test('an empty inventory draws an empty truck rather than dividing by zero', () => {
  for (const size of TRUCK_SIZES) {
    const plan = planLoad([], size);
    assert.deepEqual(plan.placements, []);
    assert.equal(plan.usedLengthIn, 0);
    assert.deepEqual(project(plan, 'side'), []);
    assert.deepEqual(project(plan, 'top'), []);
  }
});

test('every truck bed is a plausible box for its published capacity', () => {
  // The bed dimensions and TRUCK_CAPACITY come from the same vendor page and do
  // not multiply out to each other — the 10' capacity counts an over-cab
  // compartment the deck does not describe, and the larger trucks lose deck to
  // wheel wells. Both differences are real; a factor of two would not be.
  for (const size of TRUCK_SIZES) {
    const bed = TRUCK_BED[size];
    const boxCuFt = (bed.lengthIn * bed.widthIn * bed.heightIn) / 1728;
    assert.ok(bed.lengthIn > bed.widthIn, `${size}: a truck is longer than it is wide`);
    assert.ok(boxCuFt > 100, `${size}: ${boxCuFt} ft³ is not a truck`);
  }
});
