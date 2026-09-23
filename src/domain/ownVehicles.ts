/**
 * The personal vehicles a person can pick, with where every number comes from.
 *
 * The same rule as `smallVehicles.ts`: published specifications only, the smaller figure
 * where sources disagree, and the source cited on the entry. A car's cargo space is
 * described by four figures a maker may or may not publish – floor length with the rear
 * seats folded, width between the wheelhouses, height at the opening, and the opening
 * itself. "Cargo volume" in cubic feet is not enough and is never used here: it is
 * measured with luggage-sized blocks (SAE J1100), so it says nothing about whether a
 * dresser passes the tailgate.
 *
 * How a car becomes a box, so the rule errs towards "won't fit":
 *   - length    floor length behind the front seats, rear rows folded, as published
 *   - width     between the wheelhouses – the width a flat piece actually gets
 *   - height    the lower of the interior height and the opening height, because the
 *               roof slopes down to the opening and a piece has to pass under it
 *   - door      the liftgate or hatch opening, which `itemFits` checks a piece passes
 * A pickup is its bed, held to the same 42 in load-height rule a rented pickup is.
 *
 * Deliberately short. An entry is added only when its figures have been read on a
 * published page – a vehicle missing from this list gets "not listed yet" and the
 * truck, never a guess. Research for the next entries is listed in
 * `docs/own-vehicle-research.md`, and `__tests__/ownVehicle.test.ts` refuses an entry
 * without a source.
 */

import type { OwnVehicle } from './ownVehicle';
import { SMALL_VEHICLES } from './smallVehicles';

/** The 8 ft pickup's bed, taken from the rental entry so the two cannot disagree. */
const RENTAL_PICKUP = SMALL_VEHICLES.find((v) => v.id === 'pickup-8ft')!;

export const OWN_VEHICLES: readonly OwnVehicle[] = [
  {
    id: 'own-pickup-8ft',
    label: 'Full-size pickup, 8 ft bed',
    years: 'Current full-size',
    body: 'pickup',
    seats: null,
    lengthIn: RENTAL_PICKUP.lengthIn,
    widthIn: RENTAL_PICKUP.widthIn,
    loadHeightIn: RENTAL_PICKUP.loadHeightIn,
    source: RENTAL_PICKUP.source,
  },
];
