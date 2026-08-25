import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  finiteNumber,
  isoDateString,
  isRecord,
  nonEmptyString,
  nonNegativeNumber,
  oneOf,
} from '../src/lib/guards';

test('finiteNumber refuses numeric strings rather than coercing them', () => {
  // The whole point. A stored/returned "10" summed with + against "20"
  // concatenates to "01020" — 30 ft³ reported as 1020, sizing a one-room move
  // as a 26ft truck. Coercion would hide the source bug, not fix it.
  assert.equal(finiteNumber('10'), null);
  assert.equal(finiteNumber(''), null);
  assert.equal(finiteNumber(null), null);
  assert.equal(finiteNumber(undefined), null);
  assert.equal(finiteNumber(NaN), null);
  assert.equal(finiteNumber(Infinity), null);
  assert.equal(finiteNumber(-Infinity), null);
  assert.equal(finiteNumber({}), null);
  assert.equal(finiteNumber([]), null);
  assert.equal(finiteNumber(true), null);
  assert.equal(finiteNumber(0), 0);
  assert.equal(finiteNumber(-4.5), -4.5);
});

test('nonNegativeNumber rejects negatives, which money and volume cannot be', () => {
  assert.equal(nonNegativeNumber(-0.01), null);
  assert.equal(nonNegativeNumber(-1), null);
  assert.equal(nonNegativeNumber(0), 0);
  assert.equal(nonNegativeNumber(19.95), 19.95);
});

test('isoDateString rejects anything Date.parse cannot read', () => {
  // One unparseable date poisons Math.min across the whole quote list, zeroing
  // the wait penalty for every quote and degrading Best Match into Cheapest.
  assert.equal(isoDateString('next week'), null);
  assert.equal(isoDateString(''), null);
  assert.equal(isoDateString('   '), null);
  assert.equal(isoDateString(null), null);
  assert.equal(isoDateString(1234567890), null);
  assert.equal(isoDateString('2026-09-12T00:00:00.000Z'), '2026-09-12T00:00:00.000Z');
  assert.ok(Number.isFinite(Date.parse(isoDateString('2026-09-12') ?? '')));
});

test('oneOf is the only safe way to trust an enum off the wire', () => {
  const allowed = ['high', 'low'] as const;
  // 'medium' is the real case: it makes isUnresolved false for every item, so the
  // Screen 2 confidence gate silently passes an inventory nobody reviewed.
  assert.equal(oneOf('medium', allowed), null);
  assert.equal(oneOf('HIGH', allowed), null);
  assert.equal(oneOf(undefined, allowed), null);
  assert.equal(oneOf('low', allowed), 'low');
});

test('isRecord separates objects from arrays and null', () => {
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('x'), false);
  assert.equal(isRecord({}), true);
});

test('nonEmptyString rejects whitespace-only values', () => {
  assert.equal(nonEmptyString('   '), null);
  assert.equal(nonEmptyString(''), null);
  assert.equal(nonEmptyString(0), null);
  assert.equal(nonEmptyString('Sofa'), 'Sofa');
});
