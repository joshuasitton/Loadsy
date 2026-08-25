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
  // Nightstands, end tables and side tables share one band — they are the same
  // object at different names — so the reason names the shared category.
  assert.match(verdict.reason ?? '', /side table/i);

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

test('every item at its published typical size passes without a flag', () => {
  // The nag budget is the constraint that makes this gate work at all: it blocks
  // the primary CTA, so a user flagged on correct detections learns to clear the
  // banner without reading it, and then it catches nothing real either.
  //
  // These are the sourced typical dimensions the bands were derived from. If a
  // band is ever tightened past its own typical value, this fails loudly.
  const typical: [string, number, number, number][] = [
    ['3-Seat Sofa', 84, 36, 34],
    ['Loveseat', 62, 36, 34],
    ['Sectional', 110, 85, 34],
    ['Sleeper Sofa', 86, 38, 36],
    ['Armchair', 34, 34, 34],
    ['Recliner', 36, 38, 42],
    ['Ottoman', 24, 24, 18],
    ['Coffee Table', 48, 24, 18],
    ['End Table', 22, 22, 24],
    ['Console Table', 52, 16, 30],
    ['TV Stand', 58, 16, 22],
    ['Bookcase', 32, 12, 72],
    ['Floor Lamp', 16, 16, 60],
    ['Table Lamp', 12, 12, 26],
    ['Area Rug', 12, 12, 96],
    ['TV (75")', 66, 4, 38],
    ['Wall Mirror', 32, 3, 66],
    ['Queen Mattress', 80, 60, 12],
    ['King Mattress', 80, 76, 12],
    ['Box Spring', 80, 60, 9],
    ['Bed Frame', 84, 64, 14],
    ['Headboard', 62, 3, 50],
    ['Dresser', 60, 18, 34],
    ['Nightstand', 22, 18, 26],
    ['Wardrobe', 42, 22, 72],
    ['Dining Table', 84, 42, 30],
    ['Dining Chair', 18, 20, 36],
    ['Bar Stool', 16, 16, 42],
    ['China Cabinet', 50, 18, 72],
    ['Sideboard', 60, 18, 34],
    ['Refrigerator', 36, 35, 70],
    ['Chest Freezer', 48, 26, 34],
    ['Washer', 27, 30, 43],
    ['Dryer', 27, 32, 39],
    ['Dishwasher', 24, 24, 35],
    ['Range', 30, 27, 36],
    ['Microwave', 21, 16, 12],
    ['Window AC Unit', 24, 22, 16],
    ['Desk', 50, 28, 30],
    ['Office Chair', 26, 26, 42],
    ['Filing Cabinet', 15, 25, 52],
    ['Bicycle', 68, 24, 42],
    ['Treadmill', 75, 34, 62],
    ['Exercise Bike', 45, 24, 50],
    ['Gas Grill', 52, 26, 46],
    ['Lawn Mower', 60, 22, 40],
    ['Patio Table', 48, 48, 29],
    ['Vacuum', 14, 14, 44],
    ['Step Ladder', 20, 6, 72],
    ['Storage Tote', 27, 17, 15],
    ['Moving Box', 18, 18, 24],
    ['Wardrobe Box', 24, 20, 46],
    ['Picture Box', 40, 4, 60],
  ];

  const flagged = typical
    .map(([name, l, w, h]) => [name, assessDimensions(name, dims(l, w, h))] as const)
    .filter(([, verdict]) => !verdict.plausible)
    .map(([name, verdict]) => `${name}: ${verdict.reason}`);

  assert.deepEqual(flagged, [], `correct detections were flagged:\n  ${flagged.join('\n  ')}`);
});

test('the bands still catch a gross error in every covered category', () => {
  // The other half of the trade: wide enough not to nag, tight enough to bite.
  // 10x on one axis is the canonical unit/decimal slip.
  const grossErrors: [string, number, number, number][] = [
    ['3-Seat Sofa', 840, 36, 34],
    ['Queen Mattress', 800, 60, 12],
    ['Refrigerator', 360, 35, 70],
    ['Dining Chair', 180, 20, 36],
    ['Nightstand', 220, 18, 26],
    ['TV (55")', 490, 4, 29],
  ];
  for (const [name, l, w, h] of grossErrors) {
    const verdict = assessDimensions(name, dims(l, w, h));
    assert.equal(verdict.plausible, false, `${name} at ${l}x${w}x${h} slipped through`);
  }
});

test('a more specific rule always wins over the general one it lives inside', () => {
  // volumePriorFor returns the FIRST match, so a general pattern placed above a
  // specific one silently swallows it. That is how "Wardrobe Box" was measured
  // against an armoire and flagged as impossibly small.
  const overlaps: [string, string][] = [
    ['Wardrobe Box', 'a wardrobe box'],
    ['Sleeper Sofa', 'a sleeper sofa'],
    ['Dining Table', 'a dining table'],
    ['Coffee Table', 'a coffee table'],
    ['Office Chair', 'an office chair'],
    ['Bar Stool', 'a bar stool'],
    ['TV Stand', 'a media console'],
    ['Exercise Bike', 'an exercise bike'],
  ];
  for (const [name, expected] of overlaps) {
    assert.equal(
      volumePriorFor(name)?.label,
      expected,
      `"${name}" matched the wrong rule — check ordering`,
    );
  }
});
