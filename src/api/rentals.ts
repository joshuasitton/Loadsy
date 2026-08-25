import type { RentalQuote, TruckSize } from '../domain/types';
import { totalMatchesLineItems } from '../domain/quotes';
import { apiFetch, mockDelay, USE_MOCKS } from './client';
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
  const quotes = USE_MOCKS
    ? await mockDelay(mockQuotes(truckSize, originZip, isoDate))
    : (
        await apiFetch<QuotesResponse>(
          `/v1/quotes?truckSize=${encodeURIComponent(truckSize)}&originZip=${encodeURIComponent(originZip)}&date=${encodeURIComponent(isoDate)}`,
        )
      ).quotes;

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
