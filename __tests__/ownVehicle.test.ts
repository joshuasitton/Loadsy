import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assessOwnVehicle,
  BODY_TYPES,
  findOwnVehicle,
  isTight,
  ownVehicleSummary,
  planTrips,
  PRACTICAL_TRIPS,
  TIGHT_MARGIN_PCT,
  tripLine,
  type OwnVehicle,
} from '../src/domain/ownVehicle';
import { OWN_VEHICLES } from '../src/domain/ownVehicles';
import { SMALL_VEHICLES } from '../src/domain/smallVehicles';
import { parseStoredState } from '../src/state/persistence';
import type { InventoryItem } from '../src/domain/types';
import { makeItem, makeMove, makeRoom, resetIds } from './helpers';

/*
 * Your own vehicle is answered in trips, not yes or no: it is already in the driveway, so
 * the questions are how many runs and which pieces never go in it. Fixture vehicles here,
 * so the rules are pinned independently of the sourced figures in ownVehicles.ts.
 */

const SUV: OwnVehicle = {
  id: 'test-suv', label: 'Test SUV', years: '2026', body: 'suv', seats: '2nd row folded',
  lengthIn: 72, widthIn: 40, loadHeightIn: 30, door: { widthIn: 44, heightIn: 30 }, source: 'fixture',
};

function item(name: string, l: number, w: number, h: number, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return makeItem({
    name,
    dimensions: { lengthIn: l, widthIn: w, heightIn: h, isEstimated: true },
    cubicFeet: Math.round(((l * w * h) / 1728) * 100) / 100,
    ...overrides,
  });
}

test('a piece too big for the space is named as not fitting, and every other piece is carried', () => {
  resetIds();
  const sofa = item('Sofa', 84, 36, 34);
  const lamp = item('Lamp', 12, 12, 24);
  const fit = assessOwnVehicle(makeMove([makeRoom([sofa, lamp])]), SUV);
  assert.deepEqual(fit.wontFit.map((i) => i.name), ['Sofa']);
  assert.deepEqual(fit.trips.flatMap((t) => t.items.map((i) => i.name)), ['Lamp']);
  assert.equal(fit.summary, "The Sofa won't fit – the rest goes in one trip.");
});

test('trips are counted from the buffered volume against the usable space', () => {
  resetIds();
  // 72 × 40 × 30 in = 50 ft³, 42.5 usable. A medium box is 3 ft³, 3.6 buffered: 11 a trip.
  const boxes = Array.from({ length: 30 }, () => item('Medium Box', 18, 18, 16, { category: 'box' }));
  const fit = assessOwnVehicle(makeMove([makeRoom(boxes)]), SUV);
  assert.equal(fit.usableCuFt, 42.5);
  assert.equal(fit.trips.length, 3);
  assert.ok(fit.trips.every((t) => t.cuFt <= fit.usableCuFt), 'no trip is loaded past the reserve');
  assert.equal(fit.summary, 'Everything fits, in about 3 trips.');
});

test('the biggest pieces go first, and small ones fill the gaps they leave', () => {
  resetIds();
  const big = item('Armchair', 34, 32, 30); // 18.9 ft³, 22.7 buffered
  const pieces = [item('Box A', 18, 18, 16), big, item('Box B', 18, 18, 16)];
  const [trip] = planTrips(pieces, 42.5, 0.2);
  assert.equal(trip!.items[0]!.name, 'Armchair');
  assert.equal(planTrips(pieces, 42.5, 0.2).length, 1);
});

test('a piece bigger than one load but inside the space is a trip on its own', () => {
  resetIds();
  // Fits 72 × 40 × 30 dimensionally; 45 ft³ buffered is past the 42.5 usable.
  const trips = planTrips([item('Loveseat', 64, 36, 28), item('Box', 12, 12, 12)], 42.5, 0.2);
  assert.equal(trips.length, 2);
  assert.deepEqual(trips[0]!.items.map((i) => i.name), ['Loveseat']);
});

test('past the practical number of trips, the truck is the better day', () => {
  resetIds();
  const boxes = Array.from({ length: 12 * (PRACTICAL_TRIPS + 1) }, () => item('Medium Box', 18, 18, 16));
  assert.equal(assessOwnVehicle(makeMove([makeRoom(boxes)]), SUV).truckIsBetter, true);
  assert.equal(assessOwnVehicle(makeMove([makeRoom(boxes.slice(0, 11))]), SUV).truckIsBetter, false);
});

test('an estimated piece that clears the space by less than the margin is tight', () => {
  resetIds();
  // 70 in against 72: fits, but 10% larger would not.
  const snug = item('Bookcase', 70, 12, 28);
  assert.equal(isTight(snug, SUV), true);
  // Plenty of room every way.
  assert.equal(isTight(item('Side Table', 20, 20, 20), SUV), false);
  // The same snug piece, measured by the person, is not an estimate and is not tight.
  const measured = { ...snug, dimensions: { ...snug.dimensions, isEstimated: false } };
  assert.equal(isTight(measured, SUV), false);
  // A piece that does not fit is not tight – it is not in the car at all.
  assert.equal(isTight(item('Sofa', 84, 36, 34), SUV), false);
  assert.equal(TIGHT_MARGIN_PCT, 0.1);
});

test('the opening is checked, not only the space – a piece must get in', () => {
  resetIds();
  const narrow: OwnVehicle = { ...SUV, door: { widthIn: 30, heightIn: 26 } };
  const dresser = item('Dresser', 40, 18, 32);
  assert.equal(assessOwnVehicle(makeMove([makeRoom([dresser])]), SUV).wontFit.length, 0);
  assert.equal(assessOwnVehicle(makeMove([makeRoom([dresser])]), narrow).wontFit.length, 1);
});

test('the summary covers an empty move, nothing fitting, and more than one piece left out', () => {
  resetIds();
  const a = item('Sofa', 84, 36, 34);
  const b = item('Bed Frame', 80, 60, 14);
  assert.equal(ownVehicleSummary(0, 0, []), 'Nothing in the inventory yet');
  assert.equal(ownVehicleSummary(2, 0, [a, b]), 'None of it fits.');
  assert.equal(ownVehicleSummary(5, 2, [a, b]), "2 pieces won't fit – the rest goes in about 2 trips.");
  assert.equal(ownVehicleSummary(1, 1, []), 'Everything fits, in one trip.');
});

test('a vehicle id no longer listed reads as none chosen', () => {
  assert.equal(findOwnVehicle(null, [SUV]), null);
  assert.equal(findOwnVehicle('gone', [SUV]), null);
  assert.equal(findOwnVehicle('test-suv', [SUV]), SUV);
});

test('a stored vehicle survives a reload, and one no longer listed is dropped', () => {
  const stored = (ownVehicleId: unknown) =>
    JSON.stringify({
      move: { id: 'm', rooms: [], packingBufferPct: 0.2, recommendedTruckSize: 'van', originZip: '', status: 'inventory', ownVehicleId },
    });
  const listed = OWN_VEHICLES[0]!.id;
  assert.equal(parseStoredState(stored(listed))?.move.ownVehicleId, listed);
  assert.equal(parseStoredState(stored('discontinued-car'))?.move.ownVehicleId, null);
  assert.equal(parseStoredState(stored(42))?.move.ownVehicleId, null);
  // A payload from before the question existed.
  assert.equal(parseStoredState(stored(undefined))?.move.ownVehicleId, null);
});

/*
 * The catalog. Every entry is a claim about a real vehicle a person will load on the day,
 * so it must say where its numbers come from and they must describe a cargo space that
 * exists. An unsourced entry is refused here rather than caught in review.
 */

test('every listed vehicle cites a source and describes a plausible space', () => {
  const ids = new Set<string>();
  for (const v of OWN_VEHICLES) {
    assert.ok(!ids.has(v.id), `${v.id} is listed twice`);
    ids.add(v.id);
    assert.ok(BODY_TYPES.includes(v.body), `${v.id} has an unknown body type`);
    assert.match(v.source, /https:\/\//, `${v.id} cites no published source`);
    assert.ok(v.lengthIn >= 36 && v.lengthIn <= 120, `${v.id} length ${v.lengthIn} in`);
    assert.ok(v.widthIn >= 30 && v.widthIn <= 60, `${v.id} width ${v.widthIn} in`);
    assert.ok(v.loadHeightIn >= 18 && v.loadHeightIn <= 60, `${v.id} height ${v.loadHeightIn} in`);
    if (v.body === 'pickup') {
      assert.equal(v.door, undefined, 'a bed loads from above');
      assert.equal(v.seats, null);
    } else {
      assert.ok(v.door, `${v.id} has no opening – a car's is smaller than its inside`);
      assert.ok(v.seats, `${v.id} does not say which seats are folded`);
      assert.ok(v.door!.heightIn >= v.loadHeightIn, `${v.id} is taller inside than its opening – use the opening`);
    }
  }
});

test('the own 8 ft pickup is the rental 8 ft pickup, not a second copy of its figures', () => {
  const own = OWN_VEHICLES.find((v) => v.id === 'own-pickup-8ft')!;
  const rental = SMALL_VEHICLES.find((v) => v.id === 'pickup-8ft')!;
  assert.deepEqual(
    [own.lengthIn, own.widthIn, own.loadHeightIn, own.source],
    [rental.lengthIn, rental.widthIn, rental.loadHeightIn, rental.source],
  );
});

test('a trip is described by its pieces, with repeats counted', () => {
  resetIds();
  const trip = planTrips(
    [item('Medium Box', 18, 18, 16), item('Armchair', 34, 32, 30), item('Medium Box', 18, 18, 16)],
    42.5,
    0.2,
  )[0]!;
  assert.equal(tripLine(trip), 'Armchair, Medium Box ×2');
});
