import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nearMeUrl } from '../src/domain/nearMe';
import { offersFor } from '../src/domain/rentalOffers';
import { SMALL_VEHICLES } from '../src/domain/smallVehicles';
import { usableCuFtOf } from '../src/domain/vehicleFit';
import { usableCapacityCuFt } from '../src/domain/truck';

/*
 * Where to rent: every vehicle Loadsy can suggest has somewhere to rent it, and no
 * company is listed for a vehicle it does not rent – a wasted trip is worse than a
 * shorter list. Researched 18 September; see src/domain/rentalOffers.ts.
 */

test('every vehicle Loadsy can suggest has at least one company that rents it', () => {
  assert.ok(offersFor('truck').length >= 5);
  for (const vehicle of SMALL_VEHICLES) {
    assert.ok(offersFor(vehicle.kind).length > 0, vehicle.label);
  }
});

test('Penske and Budget Truck are never offered for a pickup or a trailer – they rent neither', () => {
  for (const kind of ['pickup', 'openTrailer', 'cargoTrailer'] as const) {
    const vendors = offersFor(kind).map((offer) => offer.vendor);
    assert.ok(!vendors.includes('penske') && !vendors.includes('budget'), kind);
  }
});

test('every link goes to the company over https, and every claim has a source', () => {
  for (const kind of ['truck', 'pickup', 'openTrailer', 'cargoTrailer'] as const) {
    for (const offer of offersFor(kind)) {
      assert.match(offer.url, /^https:\/\//, `${kind} ${offer.vendor}`);
      assert.ok(offer.source.length > 0, `${kind} ${offer.vendor}`);
      assert.ok(offer.nearMeQuery.length > 0);
    }
  }
});

test('"near me" is a maps search, never a location Loadsy knows', () => {
  assert.equal(nearMeUrl('U-Haul trailer rental', 'ios'), 'https://maps.apple.com/?q=U-Haul%20trailer%20rental');
  assert.equal(nearMeUrl('Home Depot truck rental', 'other'), 'https://www.google.com/maps/search/?api=1&query=Home%20Depot%20truck%20rental');
});

test('the small vehicles are checked against sourced sizes, smallest to largest', () => {
  // 8 ft pickup 99.1 · 5×8 open 111.6 · 5×8 cargo 160.3 · 6×12 cargo 310.1 ft³ usable.
  const usable = SMALL_VEHICLES.map(usableCuFtOf);
  assert.deepEqual(usable, [...usable].sort((a, b) => a - b));
  // A 6×12 cargo trailer holds more than a cargo van – worth offering even for a studio.
  assert.ok(usableCuFtOf(SMALL_VEHICLES.find((v) => v.id === 'cargo-trailer-6x12')!) > usableCapacityCuFt('van'));
  for (const vehicle of SMALL_VEHICLES) {
    assert.ok(vehicle.source.startsWith('https://'), vehicle.label);
    assert.equal(vehicle.needsTow, vehicle.kind !== 'pickup', vehicle.label);
  }
});
