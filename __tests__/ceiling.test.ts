import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CEILING_CHOICES_FT,
  ceilingForDetection,
  formatCeiling,
  normaliseCeilingHeight,
  parseCeilingFeet,
  STANDARD_CEILING_IN,
} from '../src/domain/ceiling';
import { parseStoredState } from '../src/state/persistence';

/*
 * "Are your ceilings the standard 8ft high?" – decided 14 September.
 *
 * The detector sizes furniture against the ceiling and assumes 8 ft, so a wrong
 * ceiling scales every measurement at once, and too low a ceiling under-sizes the
 * truck. These tests pin what counts as a height and what reaches the model.
 */

test('a height is a whole number of inches within what a home can have', () => {
  assert.equal(normaliseCeilingHeight(108), 108);
  assert.equal(normaliseCeilingHeight(113.6), 114);
  assert.equal(normaliseCeilingHeight(72), 72);
  assert.equal(normaliseCeilingHeight(240), 240);
  // Outside the range the answer is a slip – inches typed as feet, a stray digit –
  // and using it would scale every measurement by the mistake.
  assert.equal(normaliseCeilingHeight(71), null);
  assert.equal(normaliseCeilingHeight(1296), null);
  assert.equal(normaliseCeilingHeight(Number.NaN), null);
  assert.equal(normaliseCeilingHeight(null), null);
  assert.equal(normaliseCeilingHeight(undefined), null);
});

test('"Other" reads the ways people write a height, and never guesses', () => {
  assert.equal(parseCeilingFeet('9'), 108);
  assert.equal(parseCeilingFeet('9.5'), 114);
  assert.equal(parseCeilingFeet('9 ft'), 108);
  assert.equal(parseCeilingFeet('9 feet'), 108);
  assert.equal(parseCeilingFeet(`9'6"`), 114);
  assert.equal(parseCeilingFeet('9 ft 6 in'), 114);
  assert.equal(parseCeilingFeet('9 6'), 114);
  assert.equal(parseCeilingFeet('  10  '), 120);

  // 108 is 108 feet, not 108 inches: out of range, so refused rather than reinterpreted.
  assert.equal(parseCeilingFeet('108'), null);
  assert.equal(parseCeilingFeet(`9'12"`), null, 'twelve inches is a foot, not a remainder');
  assert.equal(parseCeilingFeet('5'), null);
  assert.equal(parseCeilingFeet('21'), null);
  assert.equal(parseCeilingFeet('tall'), null);
  assert.equal(parseCeilingFeet(''), null);
});

test('only a non-standard height is told to the model', () => {
  // "Not asked" and "yes, 8 ft" both leave the request exactly as it was.
  assert.equal(ceilingForDetection(null), null);
  assert.equal(ceilingForDetection(undefined), null);
  assert.equal(ceilingForDetection(STANDARD_CEILING_IN), null);
  assert.equal(ceilingForDetection(108), 108);
  assert.equal(ceilingForDetection(84), 84);
  // An implausible value is dropped, not passed on.
  assert.equal(ceilingForDetection(5000), null);
});

test('every quick choice is a real, non-standard height', () => {
  for (const feet of CEILING_CHOICES_FT) {
    const inches = normaliseCeilingHeight(feet * 12);
    assert.notEqual(inches, null, `${feet} ft`);
    assert.notEqual(inches, STANDARD_CEILING_IN, `${feet} ft is the "yes" answer, not a "no" choice`);
  }
});

test('heights read as people say them', () => {
  assert.equal(formatCeiling(96), '8 ft');
  assert.equal(formatCeiling(114), '9 ft 6 in');
});

/* ------------------------------------------------------------ persistence */

function stored(ceilingHeightIn?: unknown): string {
  return JSON.stringify({
    move: {
      id: 'm',
      rooms: [],
      packingBufferPct: 0.2,
      recommendedTruckSize: 'van',
      originZip: '78704',
      destinationZip: null,
      moveDate: null,
      status: 'inventory',
      ...(ceilingHeightIn === undefined ? {} : { ceilingHeightIn }),
    },
  });
}

test('a move saved before the question existed is asked, not assumed', () => {
  // Absent reads as "not asked", so the capture screen asks once – rather than
  // silently treating an old move as 8 ft.
  assert.equal(parseStoredState(stored())?.move.ceilingHeightIn, null);
});

test('an answered height survives storage, and a corrupt one does not', () => {
  assert.equal(parseStoredState(stored(108))?.move.ceilingHeightIn, 108);
  // "Yes" is stored as 96, which is different from "not asked".
  assert.equal(parseStoredState(stored(96))?.move.ceilingHeightIn, 96);
  assert.equal(parseStoredState(stored('tall'))?.move.ceilingHeightIn, null);
  assert.equal(parseStoredState(stored(5000))?.move.ceilingHeightIn, null);
});
