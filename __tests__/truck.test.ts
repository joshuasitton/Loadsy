import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecommendation,
  recommendTruckSize,
  TRUCK_CAPACITY,
  TRUCK_ROOM_EQUIVALENCE,
  usableCapacityCuFt,
} from '../src/domain/truck';
import { TRUCK_SIZES } from '../src/domain/types';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

test('recommends the smallest truck that holds the load with its reserve intact', () => {
  // Boundaries are the USABLE capacity — published interior less the 10% reserve —
  // not the interior itself. A load that would exactly fill a truck gets the next
  // size up, on purpose.
  assert.equal(recommendTruckSize(200), 'van');
  assert.equal(recommendTruckSize(221.4), 'van');
  assert.equal(recommendTruckSize(221.5), '10ft');
  assert.equal(recommendTruckSize(361.8), '10ft');
  assert.equal(recommendTruckSize(361.9), '15ft');
  assert.equal(recommendTruckSize(687.6), '15ft');
  assert.equal(recommendTruckSize(687.7), '20ft');
  assert.equal(recommendTruckSize(914.4), '20ft');
  assert.equal(recommendTruckSize(914.5), '26ft');
});

test('GUARANTEE: the recommended truck is never smaller than the load', () => {
  // The invariant the whole reserve exists to make true. Swept at 0.5 ft³ across
  // the entire usable range: the buffered load must always fit inside the
  // recommended truck's PUBLISHED interior, with the reserve still unspent.
  for (let load = 0; load <= usableCapacityCuFt('26ft'); load += 0.5) {
    const size = recommendTruckSize(load);
    const interior = TRUCK_CAPACITY[size].max;
    assert.ok(
      load <= usableCapacityCuFt(size),
      `${load} ft³ was given a ${size} whose usable capacity is ${usableCapacityCuFt(size)}`,
    );
    assert.ok(
      load <= interior * 0.91,
      `${load} ft³ in a ${size} leaves under 9% of its ${interior} ft³ interior spare`,
    );
  }
});

test('GUARANTEE: more volume never yields a smaller truck', () => {
  // Monotonicity. Without it a rounding seam could let extra furniture select a
  // SMALLER truck, which no amount of headroom would catch.
  let previous = 0;
  for (let load = 0; load <= 1800; load += 0.25) {
    const index = TRUCK_SIZES.indexOf(recommendTruckSize(load));
    assert.ok(index >= previous, `${load} ft³ stepped down to ${TRUCK_SIZES[index]}`);
    previous = index;
  }
});

test('GUARANTEE: an unmeasurable load never selects the smallest truck', () => {
  // NaN fails every comparison, so the old loop fell through to its final return.
  // Falling through to '26ft' is safe; falling through to 'van' would not be.
  assert.equal(recommendTruckSize(NaN), '26ft');
  assert.equal(recommendTruckSize(Infinity), '26ft');
  assert.equal(recommendTruckSize(50000), '26ft');
});

test('the second-trip warning fires before a single truck stops being enough', () => {
  // 1200 raw -> 1440 buffered, inside the 26ft usable ceiling of 1513.8.
  assert.equal(buildRecommendation(moveOf(1200)).exceedsLargest, false);
  // 1300 raw -> 1560 buffered, past it. The warning fires here rather than at the
  // 1682 interior, so the user learns a second trip is coming with time to plan.
  assert.equal(buildRecommendation(moveOf(1300)).exceedsLargest, true);
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
