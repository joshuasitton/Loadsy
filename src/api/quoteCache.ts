import type { RentalQuote } from '../domain/types';

/**
 * Last-fetched quotes, keyed by id.
 *
 * The price breakdown sheet is a separate route from the list, and re-fetching a
 * whole quote set to render one modal would be both slow and a second chance for
 * the numbers to disagree with what the user just tapped. The sheet reads exactly
 * the quote the list showed.
 */
const cache = new Map<string, RentalQuote>();

export function cacheQuotes(quotes: RentalQuote[]): void {
  cache.clear();
  for (const quote of quotes) cache.set(quote.id, quote);
}

export function getCachedQuote(id: string): RentalQuote | null {
  return cache.get(id) ?? null;
}
