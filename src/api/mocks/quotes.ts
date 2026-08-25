import type { RentalQuote, RentalVendor, TruckSize } from '../../domain/types';
import { VENDOR_SEARCH_URL } from '../../domain/quotes';

/**
 * Deterministic mock quotes standing in for the Rental Data Agent (spec §4.2).
 *
 * Totals are computed from the line items rather than hand-written, so the mocks
 * satisfy the §4.2 invariant by construction and can never drift out of it.
 */

interface VendorProfile {
  vendor: RentalVendor;
  /** daily base rate by truck size */
  baseRate: Record<TruckSize, number>;
  perMile: number;
  insurance: number;
  oneWayFee: number;
  taxRate: number;
  /** days from the requested date until this vendor can supply the truck */
  leadDays: number;
}

const MPG_BY_SIZE: Record<TruckSize, number> = {
  van: 18,
  '10ft': 12,
  '15ft': 10,
  '20ft': 9,
  '26ft': 8,
};

const FUEL_PRICE_PER_GALLON = 3.65;

const VENDOR_PROFILES: VendorProfile[] = [
  {
    vendor: 'uhaul',
    baseRate: { van: 19.95, '10ft': 19.95, '15ft': 29.95, '20ft': 39.95, '26ft': 39.95 },
    perMile: 0.99,
    insurance: 28,
    oneWayFee: 0,
    taxRate: 0.06,
    leadDays: 0,
  },
  {
    vendor: 'penske',
    baseRate: { van: 29.99, '10ft': 39.99, '15ft': 59.99, '20ft': 79.99, '26ft': 99.99 },
    perMile: 0.89,
    insurance: 35,
    oneWayFee: 0,
    taxRate: 0.06,
    leadDays: 1,
  },
  {
    vendor: 'budget',
    baseRate: { van: 24.99, '10ft': 34.99, '15ft': 49.99, '20ft': 64.99, '26ft': 84.99 },
    perMile: 0.94,
    insurance: 30,
    oneWayFee: 45,
    taxRate: 0.06,
    leadDays: 2,
  },
  {
    vendor: 'homeDepot',
    baseRate: { van: 19, '10ft': 29, '15ft': 39, '20ft': 59, '26ft': 79 },
    perMile: 1.19,
    insurance: 22,
    oneWayFee: 0,
    taxRate: 0.06,
    leadDays: 3,
  },
  {
    vendor: 'enterprise',
    baseRate: { van: 34.99, '10ft': 44.99, '15ft': 64.99, '20ft': 84.99, '26ft': 104.99 },
    perMile: 0.79,
    insurance: 32,
    oneWayFee: 60,
    taxRate: 0.06,
    leadDays: 4,
  },
];

export function mockQuotes(
  truckSize: TruckSize,
  originZip: string,
  isoDate: string,
  distanceMiles = estimateDistance(originZip),
): RentalQuote[] {
  const requested = Date.parse(`${isoDate.slice(0, 10)}T09:00:00.000Z`);

  return VENDOR_PROFILES.map((profile) => {
    const baseRate = round2(profile.baseRate[truckSize]);
    const estimatedMileageFee = round2(distanceMiles * profile.perMile);
    const estimatedFuelFee = round2((distanceMiles / MPG_BY_SIZE[truckSize]) * FUEL_PRICE_PER_GALLON);
    const estimatedInsuranceFee = round2(profile.insurance);
    const oneWayFee = round2(profile.oneWayFee);
    const taxable = baseRate + estimatedMileageFee + estimatedInsuranceFee + oneWayFee;
    const taxesAndFees = round2(taxable * profile.taxRate);

    // Total is derived, never asserted — this is what keeps the §4.2 invariant true.
    const estimatedTotal = round2(
      baseRate + estimatedMileageFee + estimatedFuelFee + estimatedInsuranceFee + oneWayFee + taxesAndFees,
    );

    return {
      id: `${profile.vendor}-${truckSize}`,
      vendor: profile.vendor,
      truckSize,
      baseRate,
      estimatedMileageFee,
      estimatedFuelFee,
      estimatedInsuranceFee,
      oneWayFee,
      taxesAndFees,
      estimatedTotal,
      distanceMiles,
      earliestAvailability: new Date(requested + profile.leadDays * 86_400_000).toISOString(),
      deepLinkURL: VENDOR_SEARCH_URL[profile.vendor],
      lastUpdated: new Date(requested).toISOString(),
      // Spec §2.4: always true for MVP.
      isEstimate: true,
    } satisfies RentalQuote;
  });
}

/** Stand-in for a real distance lookup; stable per zip so mocks stay deterministic. */
function estimateDistance(originZip: string): number {
  const digits = originZip.replace(/\D/g, '').slice(-3);
  return 40 + (Number(digits || '0') % 120);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
