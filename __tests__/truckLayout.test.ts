import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  elevationRects,
  planLoad,
  poseFootprint,
  TRUCK_BED,
  type ElevationRect,
} from '../src/truckmap/layout';
import { poseForItem } from '../src/domain/itemGuidance';
import { TRUCK_SIZES } from '../src/domain/types';
import { buildRecommendation } from '../src/domain/truck';
import { allItems, rawVolumeCuFt } from '../src/domain/volume';
import { buildDemoMove, DEMO_SCENARIOS } from '../src/demo/scenarios';
import { makeItem, resetIds } from './helpers';

/** Do two rectangles share any area? Touching edges do not count. */
function overlaps(a: ElevationRect, b: ElevationRect): boolean {
  const e = 1e-9;
  return (
    a.x < b.x + b.width - e &&
    b.x < a.x + a.width - e &&
    a.y < b.y + b.height - e &&
    b.y < a.y + a.height - e
  );
}

test('a pose reorders the dimensions rather than inventing them', () => {
  const mattress = { lengthIn: 80, widthIn: 60, heightIn: 12, isEstimated: true };

  // Flat: 80 x 60 on the deck, a foot high. It eats the floor and holds nothing up.
  assert.deepEqual(poseFootprint(mattress, 'flat'), { alongIn: 60, acrossIn: 80, tallIn: 12 });
  // On its long edge: 80 x 12 on the deck, five feet tall. The bed frame now fits beside it.
  assert.deepEqual(poseFootprint(mattress, 'onEdge'), { alongIn: 80, acrossIn: 12, tallIn: 60 });
  // On end: standing on its smallest face.
  assert.deepEqual(poseFootprint(mattress, 'onEnd'), { alongIn: 60, acrossIn: 12, tallIn: 80 });

  // Whatever the pose, it is the same object: the product is invariant.
  for (const pose of ['flat', 'upright', 'onEdge', 'onEnd'] as const) {
    const f = poseFootprint(mattress, pose);
    assert.equal(f.alongIn * f.acrossIn * f.tallIn, 80 * 60 * 12, `${pose} changed the volume`);
  }
});

test('a drawn rectangle is exactly proportional to the volume it represents', () => {
  // The property the whole picture rests on. If it holds, a block's area IS its
  // share of the truck, and the drawn load fills as much of the outline as the
  // real load fills of the truck — which is what makes the diagram worth reading
  // rather than merely worth looking at.
  for (const scenario of DEMO_SCENARIOS) {
    const move = buildDemoMove(scenario);
    const size = buildRecommendation(move).size;
    const bed = TRUCK_BED[size];
    const plan = planLoad(allItems(move), size);
    assert.deepEqual(plan.overflow, [], `${scenario.id} failed to place something`);

    const drawn = elevationRects(plan).reduce((sum, rect) => sum + rect.width * rect.height, 0);
    const actual = (rawVolumeCuFt(move) * 1728) / (bed.lengthIn * bed.widthIn * bed.heightIn);
    assert.ok(
      Math.abs(drawn - actual) < 0.005,
      `${scenario.id}: drew ${(drawn * 100).toFixed(1)}% of the truck for a ${(actual * 100).toFixed(1)}% load`,
    );
  }
});

test('nothing is drawn on top of anything else, or outside the truck', () => {
  for (const scenario of DEMO_SCENARIOS) {
    const move = buildDemoMove(scenario);
    const size = buildRecommendation(move).size;
    const rects = elevationRects(planLoad(allItems(move), size));

    for (const rect of rects) {
      assert.ok(rect.x >= -1e-9 && rect.x + rect.width <= 1 + 1e-6, `${rect.name} runs off the end`);
      assert.ok(rect.y >= -1e-9 && rect.y + rect.height <= 1 + 1e-6, `${rect.name} runs through the roof`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        assert.ok(
          !overlaps(rects[i]!, rects[j]!),
          `${scenario.id}: ${rects[i]!.name} overlaps ${rects[j]!.name}`,
        );
      }
    }
  }
});

test('every demo inventory fits in the truck it was recommended', () => {
  // Not a guarantee about real loads — the packer is worse than a person. But a
  // demo that draws the recommended truck failing to hold the demo inventory
  // would undercut the one number the app most wants believed.
  for (const scenario of DEMO_SCENARIOS) {
    const move = buildDemoMove(scenario);
    const plan = planLoad(allItems(move), buildRecommendation(move).size);
    assert.equal(plan.overflow.length, 0, `${scenario.id}: ${plan.overflow.map((o) => o.name)}`);
  }
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

  const plan = planLoad([rug], '15ft');
  assert.deepEqual(plan.overflow, []);
  const placed = plan.placements[0]!;
  assert.notEqual(placed.pose, 'onEnd', 'a 96in roll cannot stand under an 86in roof');
  assert.equal(placed.posedDownFrom, 'onEnd', 'and the drawing should admit why');
  assert.ok(placed.heightIn <= TRUCK_BED['15ft'].heightIn);
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
});

test('something genuinely oversized is reported, not silently dropped', () => {
  // A mis-measured piece is a plausibility problem the inventory screen flags.
  // Removing it from the drawing would hide the one place somebody might notice.
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

test('the drawing follows the printed load order, cab end first', () => {
  // If it did not, it would be showing a truck nobody was told how to pack. The
  // first group's pieces must all start before the last group's pieces do.
  const move = buildDemoMove(DEMO_SCENARIOS.find((s) => s.id === 'two-bed')!);
  const plan = planLoad(allItems(move), buildRecommendation(move).size);

  const firstStart = Math.min(...plan.placements.filter((p) => p.step === 1).map((p) => p.xIn));
  const lastStart = Math.max(...plan.placements.map((p) => p.xIn));
  assert.equal(firstStart, 0, 'the first piece loaded should sit against the cab wall');
  assert.ok(lastStart > firstStart, 'the load should progress towards the door');
});

test('the plan is deterministic, so Save Plan round-trips', () => {
  const move = buildDemoMove(DEMO_SCENARIOS.find((s) => s.id === 'one-bed')!);
  const items = allItems(move);
  const size = buildRecommendation(move).size;
  assert.deepEqual(planLoad(items, size), planLoad(JSON.parse(JSON.stringify(items)), size));
});

test('an empty inventory draws an empty truck rather than dividing by zero', () => {
  for (const size of TRUCK_SIZES) {
    const plan = planLoad([], size);
    assert.deepEqual(plan.placements, []);
    assert.equal(plan.usedLengthIn, 0);
    assert.deepEqual(elevationRects(plan), []);
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
