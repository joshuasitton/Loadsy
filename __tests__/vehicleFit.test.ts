import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assessSmallVehicles, assessVehicle, itemFits, usableCuFtOf, type SmallVehicle } from '../src/domain/vehicleFit';
import type { InventoryItem } from '../src/domain/types';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

/*
 * A pickup or trailer is checked piece by piece as well as by volume, because a bed
 * shorter than the sofa is a second trip however empty it is. Fixture vehicles here, so
 * the rules are pinned independently of the sourced specs in src/domain/smallVehicles.ts.
 */

const BED: SmallVehicle = {
  id: 'test-pickup', kind: 'pickup', label: 'Test Pickup',
  lengthIn: 78, widthIn: 50, loadHeightIn: 40, enclosed: false, needsTow: false, maxLoadLb: 2000, source: 'fixture',
};
const TRAILER: SmallVehicle = {
  id: 'test-trailer', kind: 'cargoTrailer', label: 'Test Trailer',
  lengthIn: 144, widthIn: 72, loadHeightIn: 66, enclosed: true, needsTow: true, maxLoadLb: 2500, source: 'fixture',
};

function item(name: string, l: number, w: number, h: number): InventoryItem {
  return makeItem({ name, dimensions: { lengthIn: l, widthIn: w, heightIn: h, isEstimated: true }, cubicFeet: (l * w * h) / 1728 });
}

test('a piece fits if some square-on turn of it fits – standing a bookcase up counts', () => {
  assert.equal(itemFits(item('Bookcase', 32, 12, 72), BED), true, '72 in tall lies along a 78 in bed');
  assert.equal(itemFits(item('Sofa', 84, 36, 34), BED), false, '84 in is longer than the bed however it turns');
  assert.equal(itemFits(item('Queen Bed Frame', 72, 64, 14), BED), false, 'short enough, too wide for the wheel wells');
  assert.equal(itemFits(item('Sofa', 84, 36, 34), TRAILER), true);
});

test('an enclosed trailer takes only what passes its door', () => {
  const narrowDoor: SmallVehicle = { ...TRAILER, door: { widthIn: 47, heightIn: 58 } };
  // Inside is 144 × 72 × 66, but a 60 × 30 face will not pass a 47 × 58 opening…
  assert.equal(itemFits(item('Wide Dresser', 60, 60, 30), narrowDoor), false);
  // …while a long piece goes in end-first.
  assert.equal(itemFits(item('Sofa', 84, 36, 34), narrowDoor), true);
});

test('usable space keeps the same reserve a truck keeps', () => {
  // 78 × 50 × 40 in = 90.3 ft³, less 15%.
  assert.equal(usableCuFtOf(BED), 76.7);
});

test('the reason names the piece that does not fit, with both sizes', () => {
  resetIds();
  const move = makeMove([makeRoom([item('Sofa', 84, 36, 34), item('Side Table', 20, 20, 24)])]);
  const fit = assessVehicle(move, BED);
  assert.equal(fit.fits, false);
  assert.deepEqual(fit.tooBig.map((i) => i.name), ['Sofa']);
  assert.equal(fit.reason, "The Sofa won't fit – 84 × 36 × 34 in against 78 × 50 × 40 in of space");
});

test('too much volume is its own reason, after every piece has fitted', () => {
  resetIds();
  const boxes = Array.from({ length: 30 }, () => item('Medium Box', 18, 18, 16));
  const fit = assessVehicle(makeMove([makeRoom(boxes)]), BED);
  assert.equal(fit.fits, false);
  assert.match(fit.reason!, /^Too much – your load needs about \d+ ft³, and this takes about 77 ft³$/);
});

test('a load that fits piece by piece and by volume fits, and vehicles come smallest first', () => {
  resetIds();
  const move = makeMove([makeRoom([item('Armchair', 36, 34, 34), item('Medium Box', 18, 18, 16), item('Medium Box', 18, 18, 16)])]);
  const fits = assessSmallVehicles(move, [TRAILER, BED]);
  assert.deepEqual(fits.map((f) => [f.vehicle.id, f.fits]), [['test-pickup', true], ['test-trailer', true]]);
  assert.equal(fits[0]!.reason, null);
});

test('an empty inventory fits nothing, so nothing is offered', () => {
  resetIds();
  assert.equal(assessVehicle(makeMove([makeRoom([])]), BED).fits, false);
});
