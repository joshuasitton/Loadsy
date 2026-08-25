import { TRUCK_SIZES, type RentalQuote, type TruckSize } from '../domain/types';
import { totalMatchesLineItems, VENDOR_LABEL } from '../domain/quotes';
import {
  isoDateString,
  isRecord,
  nonEmptyString,
  nonNegativeNumber,
  oneOf,
} from '../lib/guards';
import { ApiError, apiFetch, mockDelay, USE_MOCKS } from './client';
import { cacheQuotes } from './quoteCache';
import { mockQuotes } from './mocks/quotes';

/** Spec §4.2 — Rental Data Agent. */
export interface QuotesResponse {
  quotes: RentalQuote[];
  generatedAt: string;
}

export async function fetchQuotes(
  truckSize: TruckSize,
  originZip: string,
  isoDate: string,
): Promise<RentalQuote[]> {
  let quotes: RentalQuote[];
  if (USE_MOCKS) {
    quotes = await mockDelay(mockQuotes(truckSize, originZip, isoDate));
  } else {
    const response = await apiFetch<unknown>(
      `/v1/quotes?truckSize=${encodeURIComponent(truckSize)}&originZip=${encodeURIComponent(originZip)}&date=${encodeURIComponent(isoDate)}`,
    );
    // A 200 shaped {"error":"rate limited"} made .quotes undefined and threw on
    // .filter below; the screen then reported it as "no rates for your ZIP".
    const raw = isRecord(response) && Array.isArray(response.quotes) ? response.quotes : null;
    if (raw === null) throw new ApiError('/v1/quotes returned no quote list', 502);
    quotes = raw.flatMap((quote) => parseQuote(quote, truckSize));
  }

  // Contract §4.2 is checked at the boundary. A quote whose total does not
  // reconcile with its own line items would make the breakdown sheet lie to the
  // user, so it is dropped rather than displayed.
  const valid = quotes.filter((quote) => {
    if (totalMatchesLineItems(quote)) return true;
    if (__DEV__) {
      console.warn(
        `[loadsy] dropped ${quote.vendor} quote: total ${quote.estimatedTotal} does not reconcile with its line items`,
      );
    }
    return false;
  });

  cacheQuotes(valid);
  return valid;
}

/**
 * Validates one quote from the live service. Returns [] for anything unusable.
 *
 * The §4.2 filter below only ever checked that the money reconciled, so a quote
 * could pass with no distanceMiles and an unparseable date — and the list rendered
 * "NaN mi" and "Available Invalid Date" as statements of fact, with the breakdown
 * sheet repeating "NaN miles at their per-mile rate".
 */
function parseQuote(value: unknown, truckSize: TruckSize): RentalQuote[] {
  if (!isRecord(value)) return [];

  const id = nonEmptyString(value.id);
  const vendor = oneOf(value.vendor, Object.keys(VENDOR_LABEL) as RentalQuote['vendor'][]);
  const estimatedTotal = nonNegativeNumber(value.estimatedTotal);
  const distanceMiles = nonNegativeNumber(value.distanceMiles);
  const earliestAvailability = isoDateString(value.earliestAvailability);
  const deepLinkURL = nonEmptyString(value.deepLinkURL);

  if (
    id === null ||
    vendor === null ||
    estimatedTotal === null ||
    distanceMiles === null ||
    earliestAvailability === null ||
    deepLinkURL === null
  ) {
    return [];
  }

  // Optional line items stay null when absent — never 0, which the breakdown
  // sheet would render as a vendor-confirmed "no charge".
  return [
    {
      id,
      vendor,
      truckSize: oneOf(value.truckSize, TRUCK_SIZES) ?? truckSize,
      baseRate: nonNegativeNumber(value.baseRate) ?? 0,
      estimatedMileageFee: nonNegativeNumber(value.estimatedMileageFee),
      estimatedFuelFee: nonNegativeNumber(value.estimatedFuelFee),
      estimatedInsuranceFee: nonNegativeNumber(value.estimatedInsuranceFee),
      oneWayFee: nonNegativeNumber(value.oneWayFee),
      taxesAndFees: nonNegativeNumber(value.taxesAndFees),
      estimatedTotal,
      distanceMiles,
      earliestAvailability,
      deepLinkURL,
      lastUpdated: isoDateString(value.lastUpdated) ?? new Date().toISOString(),
      // Spec §2.4: always true for MVP — no vendor API confirms a price.
      isEstimate: true,
    },
  ];
}
