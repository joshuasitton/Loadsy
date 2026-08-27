/**
 * Where the move starts and where it ends, and what that costs.
 *
 * Loadsy previously knew only the origin ZIP, and derived a mileage figure from
 * it alone. Two things were wrong with that, and both changed the number the user
 * was comparing vendors on:
 *
 * 1. **Every quote carried a one-way fee.** Penske, Budget and Enterprise charge
 *    one only when the truck is dropped off somewhere else. Most moves are local
 *    — same town, truck comes back — and those were being quoted $50-75 of fee
 *    that would never be charged. Worse, the fee is not uniform across vendors,
 *    so it moved the ranking, not just the totals.
 * 2. **Mileage came from the origin ZIP alone**, which cannot know whether the
 *    trip is four miles or four hundred. Mileage and fuel are the two line items
 *    that grow with distance, and on a long move they dominate the base rate
 *    entirely — a vendor that is cheapest across town can be the most expensive
 *    across a state.
 *
 * So a trip is now origin, destination, and a distance the user can correct.
 *
 * ## On the distance estimate
 *
 * Turning two ZIPs into real road miles needs a geocoder and a routing service.
 * Loadsy has neither yet, so `estimateTripMiles` is an openly-labelled stand-in:
 * good enough to seed the field, not good enough to quote on. That is exactly why
 * the number is editable, and why the screen asks the user to check it. An
 * estimate the user can see and correct beats a confident one they cannot.
 */

import type { Move } from './types';

export type TripKind = 'local' | 'oneWay';

/**
 * Miles assumed for a local move when nothing better is known.
 *
 * A local move is a round trip — depot to old place to new place to depot — and
 * vendors meter every one of those miles. Forty is a common industry planning
 * figure for an in-town move, and it is a starting point the user can change,
 * not a claim.
 */
export const LOCAL_ROUND_TRIP_MILES = 40;

/** Above this, the trip screen suggests checking the mileage before comparing. */
export const LONG_HAUL_MILES = 400;

export interface Trip {
  originZip: string;
  destinationZip: string | null;
  kind: TripKind;
  /** What the vendors will meter. Never negative, never NaN. */
  distanceMiles: number;
  /** True when `distanceMiles` came from the estimate rather than from the user. */
  isEstimated: boolean;
}

export function isValidZip(zip: string | null | undefined): boolean {
  return typeof zip === 'string' && /^\d{5}$/.test(zip.trim());
}

/**
 * A move is local when it ends where it started, or when no destination is given.
 *
 * "No destination" resolves to local deliberately. A user who has not told us
 * where they are going has not told us they are going far, and quoting a one-way
 * fee on silence overstates every total. Under-charging an unknown is the
 * recoverable error here; the screen asks for the destination either way.
 */
export function tripKind(originZip: string, destinationZip: string | null): TripKind {
  if (!isValidZip(destinationZip)) return 'local';
  if (!isValidZip(originZip)) return 'oneWay';
  return originZip.trim() === destinationZip!.trim() ? 'local' : 'oneWay';
}

/**
 * A first guess at the miles between two ZIPs.
 *
 * US ZIP codes are allocated in rough geographic order — 0 in New England
 * climbing to 9 on the Pacific — so the numeric gap between two of them
 * correlates with distance at a national scale, and not much below that. This
 * exploits only that: the leading digits set the order of magnitude, and nothing
 * here should be mistaken for routing.
 *
 * It is deliberately conservative in the direction that matters. Under-stating
 * distance under-states mileage and fuel, which are the line items that decide a
 * long-haul comparison, so the shape leans long rather than short.
 *
 * Replace with a real lookup and delete the surrounding apology.
 */
export function estimateTripMiles(originZip: string, destinationZip: string | null): number {
  if (tripKind(originZip, destinationZip) === 'local') return LOCAL_ROUND_TRIP_MILES;

  const from = Number(originZip.trim());
  const to = Number(destinationZip!.trim());
  if (!Number.isFinite(from) || !Number.isFinite(to)) return LOCAL_ROUND_TRIP_MILES;

  const gap = Math.abs(from - to);

  // Same sectional centre (first three digits): a cross-town or next-town move.
  if (gap < 100) return 25;
  // Same region: within a metro area or its neighbours.
  if (gap < 1_000) return 60 + Math.round(gap / 10);
  // Across the country, 00501 to 99950 is roughly 2,800 road miles. That span
  // over ~99,000 of ZIP range gives about 0.028 miles per unit; rounded up to
  // 0.03 so the estimate errs long.
  return Math.round(160 + gap * 0.03);
}

/** Clamps a user-entered mileage to something a quote can be built from. */
export function normaliseMiles(miles: number | null | undefined): number | null {
  if (typeof miles !== 'number' || !Number.isFinite(miles)) return null;
  if (miles <= 0) return null;
  // A four-digit cap: the longest drive in the contiguous US is around 3,000
  // miles, and a fat-fingered 90000 would silently produce a five-figure quote.
  return Math.min(9_999, Math.round(miles));
}

/**
 * The trip a move describes, with the user's mileage if they gave one.
 *
 * Kept as a pure function of the move so no screen has to remember the rules —
 * the prices screen, the quote request and the comparison all read the same trip.
 */
export function buildTrip(move: Move): Trip {
  const originZip = move.originZip.trim();
  const destinationZip = isValidZip(move.destinationZip) ? move.destinationZip!.trim() : null;
  const entered = normaliseMiles(move.tripMiles);
  return {
    originZip,
    destinationZip,
    kind: tripKind(originZip, destinationZip),
    distanceMiles: entered ?? estimateTripMiles(originZip, destinationZip),
    isEstimated: entered === null,
  };
}

/** Plain-language summary for the top of the prices screen and the quote sheet. */
export function describeTrip(trip: Trip): string {
  const miles = `${trip.distanceMiles} mi`;
  if (trip.kind === 'local') {
    return trip.destinationZip
      ? `Local move within ${trip.originZip} · ${miles} round trip`
      : `Local move from ${trip.originZip} · ${miles} round trip`;
  }
  return `${trip.originZip} → ${trip.destinationZip} · ${miles} one way`;
}
