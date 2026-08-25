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
  assert.equal(recommendTruckSize(300), 'van');
  assert.equal(recommendTruckSize(301), '10ft');
  assert.equal(recommendTruckSize(550), '10ft');
  assert.equal(recommendTruckSize(551), '15ft');
  assert.equal(recommendTruckSize(800), '15ft');
  assert.equal(recommendTruckSize(1100), '20ft');
  assert.equal(recommendTruckSize(1101), '26ft');
});

test('anything past the largest truck still returns 26ft', () => {
  assert.equal(recommendTruckSize(5000), '26ft');
  assert.equal(buildRecommendation(moveOf(5000)).exceedsLargest, true);
});

test('capacity ranges match the spec exactly', () => {
  assert.deepEqual(TRUCK_CAPACITY.van, { min: 150, max: 300 });
  assert.deepEqual(TRUCK_CAPACITY['10ft'], { min: 300, max: 550 });
  assert.deepEqual(TRUCK_CAPACITY['15ft'], { min: 550, max: 800 });
  assert.deepEqual(TRUCK_CAPACITY['20ft'], { min: 800, max: 1100 });
  assert.deepEqual(TRUCK_CAPACITY['26ft'], { min: 1100, max: 1600 });
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
  assert.deepEqual(rec.capacity, { min: 800, max: 1100 });
  assert.equal(rec.headroomCuFt, 260);
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
