import type { RentalQuote, RentalVendor } from './types';

export type QuoteFilter = 'bestMatch' | 'cheapest' | 'earliest';

export const QUOTE_FILTER_LABEL: Record<QuoteFilter, string> = {
  bestMatch: 'Best Match',
  cheapest: 'Cheapest',
  earliest: 'Earliest',
};

export const VENDOR_LABEL: Record<RentalVendor, string> = {
  uhaul: 'U-Haul',
  penske: 'Penske',
  budget: 'Budget',
  homeDepot: 'Home Depot',
  enterprise: 'Enterprise',
  local: 'Local Rental',
};

/**
 * Spec §6 Q2 (resolved): U-Haul and Penske ship with real deep links in v1 —
 * widest coverage. The rest render a vendor search link instead, which is also
 * what the Screen 4 empty state falls back to.
 */
export const V1_DEEP_LINK_VENDORS: readonly RentalVendor[] = ['uhaul', 'penske'] as const;

export const VENDOR_SEARCH_URL: Record<RentalVendor, string> = {
  uhaul: 'https://www.uhaul.com/Truck-Rentals/',
  penske: 'https://www.pensketruckrental.com/',
  budget: 'https://www.budgettruck.com/',
  homeDepot: 'https://www.homedepot.com/c/Truck_Rental',
  enterprise: 'https://www.enterprisetrucks.com/',
  local: 'https://www.google.com/search?q=local+moving+truck+rental',
};

export function hasV1DeepLink(vendor: RentalVendor): boolean {
  return V1_DEEP_LINK_VENDORS.includes(vendor);
}

export const QUOTE_LINE_ITEM_KEYS = [
  'baseRate',
  'estimatedMileageFee',
  'estimatedFuelFee',
  'estimatedInsuranceFee',
  'oneWayFee',
  'taxesAndFees',
] as const;

export type QuoteLineItemKey = (typeof QUOTE_LINE_ITEM_KEYS)[number];

export const LINE_ITEM_LABEL: Record<QuoteLineItemKey, string> = {
  baseRate: 'Base rate',
  estimatedMileageFee: 'Mileage',
  estimatedFuelFee: 'Fuel',
  estimatedInsuranceFee: 'Damage coverage',
  oneWayFee: 'One-way fee',
  taxesAndFees: 'Taxes & fees',
};

/** Line items the vendor states outright; the rest are Loadsy estimates (amber). */
const CONFIRMED_LINE_ITEMS: readonly QuoteLineItemKey[] = ['baseRate', 'oneWayFee'] as const;

export function isEstimatedLineItem(key: QuoteLineItemKey): boolean {
  return !CONFIRMED_LINE_ITEMS.includes(key);
}

export function sumLineItems(quote: RentalQuote): number {
  const total = QUOTE_LINE_ITEM_KEYS.reduce((sum, key) => sum + (quote[key] ?? 0), 0);
  return round2(total);
}

/**
 * Spec §4.2 contract: `estimatedTotal` must be reconstructable from its own line
 * items. A cent of tolerance absorbs float noise; anything wider is a data bug.
 */
export function totalMatchesLineItems(quote: RentalQuote, toleranceCents = 1): boolean {
  return Math.abs(sumLineItems(quote) - quote.estimatedTotal) <= toleranceCents / 100;
}

/**
 * Best Match balances price against how soon the truck is available.
 *
 * Deliberately NOT a min-max normalisation of the two axes: normalising erases
 * magnitude, so a $15 price gap and a three-week wait both collapse to the same
 * 0..1 span and whichever axis carries more weight simply always wins. Instead each
 * day of waiting is priced in dollars, which keeps the trade-off interpretable and
 * lets us explain the ranking to the user in plain language.
 *
 * Pure and stable — ties break on id so the list never reshuffles between renders.
 */
export const DAILY_WAIT_PENALTY_USD = 12;

/** Lower is better. Effective cost = price + the dollar cost of waiting for it. */
export function bestMatchScore(quote: RentalQuote, quotes: RentalQuote[]): number {
  const soonest = Math.min(...quotes.map((q) => Date.parse(q.earliestAvailability)));
  const waitMs = Date.parse(quote.earliestAvailability) - soonest;
  const waitDays = Number.isFinite(waitMs) ? Math.max(0, waitMs) / 86_400_000 : 0;
  return round2(quote.estimatedTotal + waitDays * DAILY_WAIT_PENALTY_USD);
}

/** Client-side sort only — spec §3 Screen 4 forbids a fresh API call per filter. */
export function sortQuotes(quotes: RentalQuote[], filter: QuoteFilter): RentalQuote[] {
  const copy = [...quotes];
  switch (filter) {
    case 'cheapest':
      return copy.sort((a, b) => a.estimatedTotal - b.estimatedTotal || cmpId(a, b));
    case 'earliest':
      return copy.sort(
        (a, b) =>
          Date.parse(a.earliestAvailability) - Date.parse(b.earliestAvailability) || cmpId(a, b),
      );
    case 'bestMatch':
      return copy.sort(
        (a, b) => bestMatchScore(a, quotes) - bestMatchScore(b, quotes) || cmpId(a, b),
      );
  }
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function cmpId(a: RentalQuote, b: RentalQuote): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
