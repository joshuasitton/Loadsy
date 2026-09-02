import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCuFt, formatDate, formatDateTime } from '../src/ui/format';

test('volumes are whole cubic feet, because that is all the input supports', () => {
  // Every volume in the app is three estimated dimensions multiplied together,
  // often estimated by a model from a photograph. "460.75 ft³" claims a precision
  // of about a fifth of a shoebox that nothing behind it can support — and reads
  // as a measurement, which is the opposite of what every other line on those
  // screens carefully says.
  assert.equal(formatCuFt(460.75), '461');
  assert.equal(formatCuFt(92.15), '92');
  assert.equal(formatCuFt(552.9), '553');
  assert.equal(formatCuFt(13.33), '13');
});

test('small items keep a decimal, where the difference is real', () => {
  // A list where every box says "3 ft³" is less useful, not more honest.
  assert.equal(formatCuFt(3.29), '3.3');
  assert.equal(formatCuFt(9.96), '10');
  assert.equal(formatCuFt(0), '0');
});

test('an unusable number renders as a dash rather than NaN', () => {
  // These sit beside prices the user is being asked to trust.
  assert.equal(formatCuFt(NaN), '—');
  assert.equal(formatCuFt(Infinity), '—');
  assert.equal(formatCuFt(null), '—');
  assert.equal(formatCuFt(undefined), '—');
});

test('dates survive junk without printing "Invalid Date"', () => {
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate('not a date'), '—');
  assert.equal(formatDateTime(''), '—');
  assert.match(formatDate('2026-08-27T15:04:05.000Z'), /2026/);
});
