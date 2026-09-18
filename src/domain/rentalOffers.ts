/**
 * Which companies rent what, and where to send someone to check.
 *
 * One table for the Where to Rent screen: for a box truck, a pickup or a trailer, the
 * companies that rent one, a page on each company's own site to check the price, and the
 * words for a "near me" maps search (see nearMe.ts). Listing a company for a vehicle it
 * does not rent would send the person on a wasted trip, so every entry here is sourced –
 * see `source` – and a company is left out rather than guessed in.
 */

import { VENDOR_LABEL, VENDOR_SEARCH_URL } from './quotes';
import type { RentalVendor } from './types';
import type { SmallVehicleKind } from './vehicleFit';

export type RentableKind = 'truck' | SmallVehicleKind;

export interface RentalOffer {
  vendor: RentalVendor;
  /** A page on the company's site for this kind of vehicle. */
  url: string;
  /** What to search for nearby: "U-Haul pickup truck rental". */
  nearMeQuery: string;
  /** Something to know before going – "ask for an 8 ft bed". */
  note?: string;
  /** Where the claim that this company rents this vehicle comes from. */
  source: string;
}

const TRUCK_VENDORS: readonly RentalVendor[] = ['uhaul', 'penske', 'budget', 'homeDepot', 'enterprise'];

const TRUCK_OFFERS: readonly RentalOffer[] = TRUCK_VENDORS.map((vendor) => ({
  vendor,
  url: VENDOR_SEARCH_URL[vendor],
  nearMeQuery: `${VENDOR_LABEL[vendor]} truck rental`,
  source: VENDOR_SEARCH_URL[vendor],
}));

/*
 * Researched 18 September from each company's public pages. Penske and Budget Truck
 * Rental rent neither pickups nor trailers (Penske: "does not rent moving trailers";
 * Budget Truck lists vans and box trucks), so they are absent below rather than listed
 * and wrong. Home Depot's pages refuse automated reads, so its links are the ones search
 * results showed – marked in `source`.
 */
const OFFERS: Record<RentableKind, readonly RentalOffer[]> = {
  truck: TRUCK_OFFERS,
  pickup: [
    {
      vendor: 'uhaul',
      url: 'https://www.uhaul.com/Truck-Rentals/Pickup-Truck/',
      nearMeQuery: 'U-Haul pickup truck rental',
      source: 'https://www.uhaul.com/Truck-Rentals/Pickup-Truck/',
    },
    {
      vendor: 'homeDepot',
      url: 'https://www.homedepot.com/p/rental/Pickup-Truck-Rental/316821459',
      nearMeQuery: 'Home Depot truck rental',
      source: 'search results – homedepot.com blocks automated reads',
    },
    {
      vendor: 'enterprise',
      url: 'https://www.enterprisetrucks.com/truckrental/en_US/vehicles/pickup-trucks/HalfTon4WDPickupTruck-personal.html',
      nearMeQuery: 'Enterprise Truck Rental',
      // Enterprise lists 6–8 ft beds; the fit above is for an 8 ft bed.
      note: 'Beds are 6–8 ft – ask for an 8 ft bed',
      source: 'https://www.enterprisetrucks.com/truckrental/en_US/vehicles/pickup-trucks/HalfTon4WDPickupTruck-personal.html',
    },
  ],
  openTrailer: [
    {
      vendor: 'uhaul',
      url: 'https://www.uhaul.com/Trailers/5x8-Utility-Trailer-Rental/AO/',
      nearMeQuery: 'U-Haul trailer rental',
      source: 'https://www.uhaul.com/Trailers/5x8-Utility-Trailer-Rental/AO/',
    },
    {
      vendor: 'homeDepot',
      url: 'https://www.homedepot.com/c/trailer-rental',
      nearMeQuery: 'Home Depot trailer rental',
      source: 'search results – homedepot.com blocks automated reads',
    },
  ],
  cargoTrailer: [
    {
      vendor: 'uhaul',
      url: 'https://www.uhaul.com/Trailers/',
      nearMeQuery: 'U-Haul trailer rental',
      source: 'https://www.uhaul.com/Trailers/5x8-Cargo-Trailer-Rental/AV/ · https://www.uhaul.com/Trailers/6x12-Cargo-Trailer-Rental/RV/',
    },
  ],
};

export function offersFor(kind: RentableKind): readonly RentalOffer[] {
  return OFFERS[kind];
}
