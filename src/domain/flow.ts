/**
 * The order the four working screens come in, as one list.
 *
 * Every screen used to end in a single forward button, with the only way back
 * being the header chevron or the dashboard. That is fine the first time through
 * and wrong every time after: the common act in this app is going back to fix an
 * item and returning to see what it did to the truck, and there was no return.
 *
 * Back and forward are both derived from this array, so they cannot disagree
 * about what follows what — the class of bug where a "Next" leads somewhere its
 * own "Back" does not come from.
 *
 * The dashboard is not in the list. It is where the flow starts and what "back"
 * means from the first step, not a step of its own.
 */

import type { MoveStatus } from './types';

/** Kept in sync with expo-router's typed routes. */
export type FlowRoute = '/inventory' | '/trip' | '/truck' | '/prices' | '/packing';

export interface FlowStep {
  route: FlowRoute;
  /** Matches the navigation header, so the button names the screen it opens. */
  title: string;
  /**
   * The status this screen represents, or null where it has none.
   *
   * Prices is a detour off Truck & Price rather than a step of its own in the
   * spec's five-status model, so it deliberately maps to the same status.
   */
  status: MoveStatus;
}

export const FLOW: readonly FlowStep[] = [
  { route: '/inventory', title: 'Inventory', status: 'inventory' },
  // Where from and where to, before anything is priced. It shares a status with
  // Truck Size for the same reason Prices does — the spec's five-status model has
  // one stage for "truck and price", and this is the front of it.
  { route: '/trip', title: 'Your Trip', status: 'truckAndPrice' },
  { route: '/truck', title: 'Truck Size', status: 'truckAndPrice' },
  { route: '/prices', title: 'Local Prices', status: 'truckAndPrice' },
  { route: '/packing', title: 'Packing Plan', status: 'packingPlan' },
] as const;

export function stepIndex(route: FlowRoute): number {
  return FLOW.findIndex((step) => step.route === route);
}

/** The step after this one, or null at the end of the flow. */
export function nextStep(route: FlowRoute): FlowStep | null {
  const index = stepIndex(route);
  if (index < 0) return null;
  return FLOW[index + 1] ?? null;
}

/**
 * The step before this one, or null at the start.
 *
 * Null means "back goes to the dashboard" — the caller decides how to say that,
 * because the wording differs between a button and a screen-reader label.
 */
export function previousStep(route: FlowRoute): FlowStep | null {
  const index = stepIndex(route);
  if (index <= 0) return null;
  return FLOW[index - 1] ?? null;
}

/** Human position in the flow, 1-based, for "Step 2 of 4". */
export function stepPosition(route: FlowRoute): { position: number; total: number } | null {
  const index = stepIndex(route);
  if (index < 0) return null;
  return { position: index + 1, total: FLOW.length };
}
