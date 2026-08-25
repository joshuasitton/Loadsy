import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessDimensions,
  MAX_EDGE_IN,
  MAX_ITEM_CUBIC_FEET,
  volumePriorFor,
} from '../src/domain/plausibility';
import { cubicFeetFor } from '../src/domain/volume';
import { recommendTruckSize } from '../src/domain/truck';

const dims = (lengthIn: number, widthIn: number, heightIn: number) => ({
  lengthIn,
  widthIn,
  heightIn,
  isEstimated: true,
});

test('ordinary furniture passes without being nagged about', () => {
  // The gate blocks the primary CTA, so a false positive costs more than it
  // saves: users who are flagged constantly learn to click straight through.
  const ordinary: [string, ReturnType<typeof dims>][] = [
    ['3-Seat Sofa', dims(84, 36, 34)],
    ['Queen Mattress', dims(80, 60, 12)],
    ['Refrigerator', dims(36, 32, 70)],
    ['Dining Table', dims(60, 36, 30)],
    ['Dining Chair', dims(18, 20, 36)],
    ['Nightstand', dims(22, 18, 26)],
    ['Floor Lamp', dims(14, 14, 60)],
    ['TV (55")', dims(49, 4, 29)],
    ['Bookshelf', dims(32, 12, 72)],
    ['Kitchen Boxes', dims(18, 18, 18)],
    ['Dresser', dims(60, 20, 34)],
    ['Something Unrecognised', dims(30, 30, 30)],
  ];
  for (const [name, d] of ordinary) {
    const verdict = assessDimensions(name, d);
    assert.equal(verdict.plausible, true, `${name} was wrongly flagged: ${verdict.reason}`);
  }
});

test('an order-of-magnitude scale error is caught before it becomes a truck size', () => {
  // The failure this module exists for. 84in -> 840in is a plausible model slip
  // and adds a truck's worth of volume with no other symptom.
  const wrong = assessDimensions('3-Seat Sofa', dims(840, 36, 34));
  assert.equal(wrong.plausible, false);
  assert.ok(wrong.reason && wrong.reason.length > 0);

  // Confirm the harm it prevents, with the real numbers: 59.5 ft³ becomes 595,
  // and that one item alone jumps the recommendation three sizes — from the van
  // that actually fits it to a 15ft truck.
  const correct = cubicFeetFor(dims(84, 36, 34));
  const runaway = cubicFeetFor(dims(840, 36, 34));
  assert.equal(correct, 59.5);
  assert.equal(runaway, 595);
  assert.ok(runaway > MAX_ITEM_CUBIC_FEET, 'should exceed the single-item ceiling');
  assert.equal(recommendTruckSize(correct), 'van');
  assert.equal(recommendTruckSize(runaway), '15ft');
});

test('generic physical limits apply even to items with no prior', () => {
  assert.equal(assessDimensions('Mystery Object', dims(MAX_EDGE_IN + 1, 10, 10)).plausible, false);
  assert.equal(assessDimensions('Mystery Object', dims(1, 10, 10)).plausible, false);
  assert.equal(assessDimensions('Mystery Object', dims(0, 10, 10)).plausible, false);
  assert.equal(assessDimensions('Mystery Object', dims(NaN, 10, 10)).plausible, false);
  // 100in x 2.4in — a 41.7:1 ratio, a plank rather than furniture. Exactly 40:1
  // is deliberately allowed; the bound is a ceiling, not a target.
  assert.equal(assessDimensions('Mystery Object', dims(100, 2.4, 2.4)).plausible, false);
  assert.equal(assessDimensions('Mystery Object', dims(100, 2.5, 2.5)).plausible, true);
});

test('per-item priors catch what generic limits cannot', () => {
  // Every edge here is individually reasonable and well inside the generic
  // bounds; only knowing what a nightstand is makes it wrong.
  const verdict = assessDimensions('Nightstand', dims(72, 40, 40));
  assert.equal(verdict.plausible, false);
  assert.match(verdict.reason ?? '', /nightstand/i);

  // And the other direction — a sofa the size of a shoebox.
  const tiny = assessDimensions('Sofa', dims(12, 8, 8));
  assert.equal(tiny.plausible, false);
  assert.match(tiny.reason ?? '', /small/i);
});

test('an unrecognised name gets no invented prior', () => {
  // Unknown is not suspicious. Inventing a range for it would flag legitimate
  // items and erode trust in the gate.
  assert.equal(volumePriorFor('Antique Butter Churn'), null);
  assert.equal(assessDimensions('Antique Butter Churn', dims(24, 24, 40)).plausible, true);
});

test('every reason reads as an instruction to a person, not a log line', () => {
  const flagged = [
    assessDimensions('3-Seat Sofa', dims(840, 36, 34)),
    assessDimensions('Nightstand', dims(72, 40, 40)),
    assessDimensions('Mystery Object', dims(200, 10, 10)),
    assessDimensions('Mystery Object', dims(1, 1, 1)),
  ];
  for (const verdict of flagged) {
    assert.equal(verdict.plausible, false);
    const reason = verdict.reason ?? '';
    assert.ok(reason.length > 15, `too terse: "${reason}"`);
    assert.ok(!/[<>{}]|null|undefined|NaN/.test(reason), `leaks internals: "${reason}"`);
    assert.match(reason, /check|confirm/i, `no action for the user: "${reason}"`);
  }
});

test('the mock catalogue is entirely plausible, so dev never sees a false flag', async () => {
  const { mockDetect } = await import('../src/api/mocks/detect');
  for (const room of ['Living Room', 'Bedroom', 'Kitchen', 'Garage']) {
    for (const item of mockDetect('r1', room, 'p1')) {
      const verdict = assessDimensions(item.name, item.dimensions);
      assert.equal(
        verdict.plausible,
        true,
        `mock "${item.name}" in ${room} was flagged: ${verdict.reason}`,
      );
    }
  }
});
