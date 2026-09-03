/**
 * Where the Free tier ends and Premium begins.
 *
 * One definition, expressed in terms of `MoveStatus`, because the two places
 * that draw the line — the dashboard's five rows and the setup flow's five
 * screens — already agree on status and nothing else. Deriving the routes from
 * the statuses is what stops the dashboard offering a row the flow refuses to
 * open, or the reverse.
 *
 * The line itself: Free takes you from a pile of photographs to a truck size and
 * five real prices. That is a whole, useful product — somebody who never pays
 * still leaves with the answer they came for. Premium is the work that happens
 * after the truck is booked: what order to load it in, and where each piece
 * goes. Charging for the answer and giving away the setup would be the same
 * product with the value inverted.
 *
 * Nothing here knows about builds, flags or purchases. Whether a given person
 * HAS Premium is `src/billing/entitlementStore.tsx`; whether Premium can be
 * bought at all is `src/billing/tier.ts`. This module only says what it is.
 */

import { FLOW, type FlowRoute } from './flow';
import type { MoveStatus } from './types';

export type Tier = 'free' | 'premium';

/**
 * The stages Free covers, and the only list that decides it.
 *
 * `as const satisfies` rather than a plain annotation: it keeps the literal
 * types for exhaustiveness while still failing the build if a status is
 * misspelled or removed from the model.
 */
export const FREE_STATUSES = ['inventory', 'truckAndPrice'] as const satisfies readonly MoveStatus[];

export function isFreeStatus(status: MoveStatus): boolean {
  return (FREE_STATUSES as readonly MoveStatus[]).includes(status);
}

/**
 * Screens that belong to a Premium stage without appearing in `FLOW`.
 *
 * Truck Layout is a detour off the Packing Plan rather than a step of its own,
 * so the derivation below cannot find it. Listing it here is what keeps the
 * solver behind the same wall as the plan that leads to it — otherwise the most
 * expensive thing Loadsy computes would be reachable by URL for nothing.
 */
const PREMIUM_DETOURS = ['/layout-view'] as const;

export type GatedRoute = FlowRoute | (typeof PREMIUM_DETOURS)[number];

export function isPremiumRoute(route: GatedRoute): boolean {
  if ((PREMIUM_DETOURS as readonly string[]).includes(route)) return true;
  const step = FLOW.find((candidate) => candidate.route === route);
  // An unknown route is not something we sell. Defaulting the other way would
  // put a paywall in front of any screen somebody forgot to add to FLOW.
  if (!step) return false;
  return !isFreeStatus(step.status);
}

/** Whether this tier may open this route. */
export function unlocks(tier: Tier, route: GatedRoute): boolean {
  return tier === 'premium' || !isPremiumRoute(route);
}

/**
 * What each tier actually contains, in the words the wall uses.
 *
 * `built` separates the two kinds of Premium honestly. Packing Plan and Truck
 * Layout work today and are being withheld; Reservations and Moving Day are not
 * written yet. A wall that presented all four the same way would be selling one
 * pair of them on the strength of the other.
 */
export interface TierFeature {
  title: string;
  body: string;
  built: boolean;
}

export const FREE_FEATURES: readonly TierFeature[] = [
  {
    title: 'Inventory from photos',
    body: 'Photograph each room. Loadsy finds the furniture, sizes it, and totals the cubic feet.',
    built: true,
  },
  {
    title: 'Truck size',
    body: 'The size that actually fits, with the 15% reserve that keeps a tight load from becoming two trips.',
    built: true,
  },
  {
    title: 'Local prices',
    body: 'Five vendors priced on your dates and your mileage, compared like for like.',
    built: true,
  },
] as const;

export const PREMIUM_FEATURES: readonly TierFeature[] = [
  {
    title: 'Packing Plan',
    body: 'Every item in the order it goes in — front to back, bottom to top — with how to set each one down.',
    built: true,
  },
  {
    title: 'Truck Layout',
    body: 'The solved load, drawn from the side and from above, animated piece by piece with the orientation for each.',
    built: true,
  },
  {
    title: 'Reservations',
    body: 'Hold the truck you picked and keep the confirmation with the move.',
    built: false,
  },
  {
    title: 'Moving Day',
    body: 'The day-of checklist, built from your own load order.',
    built: false,
  },
] as const;

/** One line for the lock, wherever a lock appears. */
export const PREMIUM_TAGLINE = 'Loading, solved — the order, the orientation, the layout.';
