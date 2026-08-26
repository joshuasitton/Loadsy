/**
 * Building the packing plan, locally.
 *
 * This used to be a network call. It should never have been: buildLoadSteps and
 * renderTruckMapSVG are both pure functions of the inventory, already in the
 * bundle, and a server cannot compute them better — only later, and sometimes
 * wrongly. The endpoint bought nothing and cost a round trip, a spinner, a retry
 * path, and a class of failure where a returned plan did not cover the inventory
 * and left the screen waiting forever.
 *
 * Because the plan is derived rather than fetched, it also cannot go stale. The
 * whole category of "the stored plan describes a different inventory" disappears
 * when the plan is a function of the inventory rather than a copy of a past one.
 */

import type { InventoryItem, PackingPlan, TruckSize } from './types';
import { buildLoadSteps } from './packing';
import { renderTruckMapSVG } from '../truckmap/renderSvg';

/** Null when there is nothing to load — an empty plan is not a plan. */
export function buildPackingPlan(
  moveId: string,
  items: InventoryItem[],
  truckSize: TruckSize,
): PackingPlan | null {
  if (items.length === 0) return null;
  return {
    id: `plan-${moveId}`,
    moveId,
    loadSteps: buildLoadSteps(items),
    truckMapSVG: renderTruckMapSVG(items, truckSize, 'top'),
  };
}
