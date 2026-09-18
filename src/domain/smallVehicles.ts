/**
 * The pickups and trailers Loadsy offers beside a truck, with where every number comes from.
 *
 * Researched 18 September from published specifications only – no quotes requested, no
 * forms submitted. Where sources disagreed, the smaller figure is used, because a space
 * overstated is a load that does not fit on the day. Volumes are computed from the
 * dimensions rather than taken from the published cubic feet, which run 8–10% above
 * length × width × height.
 *
 * `loadHeightIn` for an open bed is Loadsy's rule, not a specification: 42 in above the
 * floor of the bed, which on a pickup is about the top of the cab. A load may ride above
 * the rails when strapped, but not above that – the rule is conservative on purpose.
 */

import type { SmallVehicle } from './vehicleFit';

/** How high a strapped load may ride above the floor of an open bed. Loadsy's rule – see above. */
export const OPEN_BED_LOAD_HEIGHT_IN = 42;

export const SMALL_VEHICLES: readonly SmallVehicle[] = [
  {
    id: 'pickup-8ft',
    kind: 'pickup',
    label: '8 ft Pickup Truck',
    // U-Haul's 8 ft bed is 96 in long (Ford's is 97.6); 50 in is the width between the
    // wheel wells (Ford 50.6, Chevrolet 50.63) – the width furniture actually has.
    lengthIn: 96,
    widthIn: 50,
    loadHeightIn: OPEN_BED_LOAD_HEIGHT_IN,
    enclosed: false,
    needsTow: false,
    // Enterprise's "up to 2,000 lb" – the lowest of the rental figures (U-Haul 2,280).
    maxLoadLb: 2000,
    source:
      'https://www.uhaul.com/Truck-Rentals/Pickup-Truck/ · https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2026/specs/2026_Ford_F150_Specs.pdf · https://www.enterprise.com/en/rental-cars/us/trucks/1-2-ton-pickup-ppar.html',
  },
  {
    id: 'open-trailer-5x8',
    kind: 'openTrailer',
    label: '5×8 Open Trailer',
    // Deck 108 × 50 in, rails 25 in (U-Haul 5x8 utility trailer).
    lengthIn: 108,
    widthIn: 50,
    loadHeightIn: OPEN_BED_LOAD_HEIGHT_IN,
    enclosed: false,
    needsTow: true,
    maxLoadLb: 1890,
    source: 'https://www.uhaul.com/Trailers/5x8-Utility-Trailer-Rental/AO/',
  },
  {
    id: 'cargo-trailer-5x8',
    kind: 'cargoTrailer',
    label: '5×8 Cargo Trailer',
    // Inside 97 × 56 × 60 in; door 47 × 58 in (U-Haul 5x8 cargo trailer).
    lengthIn: 97,
    widthIn: 56,
    loadHeightIn: 60,
    enclosed: true,
    needsTow: true,
    door: { widthIn: 47, heightIn: 58 },
    maxLoadLb: 1800,
    source: 'https://www.uhaul.com/Trailers/5x8-Cargo-Trailer-Rental/AV/',
  },
  {
    id: 'cargo-trailer-6x12',
    kind: 'cargoTrailer',
    label: '6×12 Cargo Trailer',
    // Inside 139 × 72 × 63 in; door 64 × 61 in (U-Haul 6x12 cargo trailer).
    lengthIn: 139,
    widthIn: 72,
    loadHeightIn: 63,
    enclosed: true,
    needsTow: true,
    door: { widthIn: 64, heightIn: 61 },
    maxLoadLb: 2480,
    source: 'https://www.uhaul.com/Trailers/6x12-Cargo-Trailer-Rental/RV/',
  },
];
