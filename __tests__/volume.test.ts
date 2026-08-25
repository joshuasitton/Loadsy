import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustedVolumeCuFt,
  clampBuffer,
  cubicFeetFor,
  DEFAULT_PACKING_BUFFER_PCT,
  rawVolumeCuFt,
  roomCubicFeet,
} from '../src/domain/volume';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

test('cubicFeetFor converts inches to cubic feet', () => {
  // A 12x12x12in cube is exactly 1 ft³.
  assert.equal(cubicFeetFor({ lengthIn: 12, widthIn: 12, heightIn: 12, isEstimated: false }), 1);
  // 84 x 36 x 34 in = 102816 in³ / 1728 = 59.5 ft³
  assert.equal(cubicFeetFor({ lengthIn: 84, widthIn: 36, heightIn: 34, isEstimated: true }), 59.5);
});

test('roomCubicFeet sums its items', () => {
  resetIds();
  const room = makeRoom([makeItem({ cubicFeet: 10 }), makeItem({ cubicFeet: 5.25 })]);
  assert.equal(roomCubicFeet(room), 15.25);
});

test('rawVolumeCuFt sums across every room', () => {
  resetIds();
  const move = makeMove([
    makeRoom([makeItem({ cubicFeet: 100 })]),
    makeRoom([makeItem({ cubicFeet: 50 }), makeItem({ cubicFeet: 25 })]),
  ]);
  assert.equal(rawVolumeCuFt(move), 175);
});

test('adjustedVolumeCuFt applies the packing buffer', () => {
  resetIds();
  const move = makeMove([makeRoom([makeItem({ cubicFeet: 500 })])], { packingBufferPct: 0.2 });
  assert.equal(adjustedVolumeCuFt(move), 600);
});

test('the default buffer is locked at 20 percent (spec 6.1)', () => {
  assert.equal(DEFAULT_PACKING_BUFFER_PCT, 0.2);
});

test('buffer is clamped to the 15-30 percent band from the spec', () => {
  assert.equal(clampBuffer(0.05), 0.15);
  assert.equal(clampBuffer(0.9), 0.3);
  assert.equal(clampBuffer(0.22), 0.22);
  assert.equal(clampBuffer(Number.NaN), 0.2);
});

test('an empty move has zero volume rather than NaN', () => {
  resetIds();
  const move = makeMove([]);
  assert.equal(rawVolumeCuFt(move), 0);
  assert.equal(adjustedVolumeCuFt(move), 0);
});
