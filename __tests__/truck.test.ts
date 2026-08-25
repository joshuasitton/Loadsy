import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecommendation,
  recommendTruckSize,
  TRUCK_CAPACITY,
  TRUCK_ROOM_EQUIVALENCE,
} from '../src/domain/truck';
import { TRUCK_SIZES } from '../src/domain/types';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

test('recommends the smallest truck that holds the buffered volume', () => {
  assert.equal(recommendTruckSize(200), 'van');
  assert.equal(recommendTruckSize(246), 'van');
  assert.equal(recommendTruckSize(247), '10ft');
  assert.equal(recommendTruckSize(402), '10ft');
  assert.equal(recommendTruckSize(403), '15ft');
  assert.equal(recommendTruckSize(764), '15ft');
  assert.equal(recommendTruckSize(1016), '20ft');
  assert.equal(recommendTruckSize(1017), '26ft');
});

test('anything past the largest truck still returns 26ft', () => {
  assert.equal(recommendTruckSize(5000), '26ft');
  assert.equal(buildRecommendation(moveOf(5000)).exceedsLargest, true);
});

test('capacity maxima match the vendor published interior volumes', () => {
  // Deliberately NOT the figures in the spec. The spec listed capacities larger
  // than the trucks: a 10ft truck at 550 ft³ against a real interior of 402 is a
  // claim that 137% of the box can be filled. Verified on uhaul.com/Truck-Rentals.
  assert.equal(TRUCK_CAPACITY.van.max, 246);
  assert.equal(TRUCK_CAPACITY['10ft'].max, 402);
  assert.equal(TRUCK_CAPACITY['15ft'].max, 764);
  assert.equal(TRUCK_CAPACITY['20ft'].max, 1016);
  assert.equal(TRUCK_CAPACITY['26ft'].max, 1682);
});

test('no truck is ever asked to hold more than it physically can', () => {
  // The invariant the old numbers broke. recommendTruckSize returns the smallest
  // truck whose max clears the load, so a max above the real interior silently
  // recommends a truck the load cannot fit into.
  const PUBLISHED_INTERIOR: Record<string, number> = {
    van: 246,
    '10ft': 402,
    '15ft': 764,
    '20ft': 1016,
    '26ft': 1682,
  };
  for (const size of TRUCK_SIZES) {
    assert.ok(
      TRUCK_CAPACITY[size].max <= PUBLISHED_INTERIOR[size]!,
      `${size} claims ${TRUCK_CAPACITY[size].max} ft³ of a ${PUBLISHED_INTERIOR[size]} ft³ truck`,
    );
  }
});

test('capacity ranges are contiguous with no gaps', () => {
  for (let i = 1; i < TRUCK_SIZES.length; i++) {
    const prev = TRUCK_CAPACITY[TRUCK_SIZES[i - 1]!];
    const cur = TRUCK_CAPACITY[TRUCK_SIZES[i]!];
    assert.equal(cur.min, prev.max, `gap between ${TRUCK_SIZES[i - 1]} and ${TRUCK_SIZES[i]}`);
  }
});

test('every truck size has static room-equivalence copy (spec forbids computing it)', () => {
  for (const size of TRUCK_SIZES) {
    assert.ok(TRUCK_ROOM_EQUIVALENCE[size].length > 0, `${size} missing equivalence copy`);
  }
});

test('the recommendation carries the full raw to buffered to capacity breakdown', () => {
  const rec = buildRecommendation(moveOf(700));
  assert.equal(rec.rawCuFt, 700);
  assert.equal(rec.bufferPct, 0.2);
  assert.equal(rec.adjustedCuFt, 840);
  assert.equal(rec.size, '20ft');
  assert.deepEqual(rec.capacity, { min: 764, max: 1016 });
  assert.equal(rec.headroomCuFt, 176);
  assert.equal(rec.exceedsLargest, false);
});

test('the reported buffer is the one actually applied, even out of band', () => {
  // A move can carry any number (hydrated storage, a future settings UI). The
  // breakdown must never show a percentage that its own arithmetic did not use.
  for (const pct of [0.05, 0.2, 0.9]) {
    const rec = buildRecommendation(makeMove([makeRoom([makeItem({ cubicFeet: 100 })])], { packingBufferPct: pct }));
    assert.equal(
      rec.adjustedCuFt,
      Math.round(rec.rawCuFt * (1 + rec.bufferPct) * 100) / 100,
      `buffer ${pct} does not reconcile`,
    );
  }
});

function moveOf(cuFt: number) {
  resetIds();
  return makeMove([makeRoom([makeItem({ cubicFeet: cuFt })])]);
}
