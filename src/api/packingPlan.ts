import type { InventoryItem, PackingPlan, TruckSize } from '../domain/types';
import { buildLoadSteps } from '../domain/packing';
import { renderTruckMapSVG } from '../truckmap/renderSvg';
import { apiFetch, mockDelay, USE_MOCKS } from './client';

/** Spec §4.3 — Packing Logic Agent. */
export async function fetchPackingPlan(
  moveId: string,
  items: InventoryItem[],
  truckSize: TruckSize,
): Promise<PackingPlan> {
  if (USE_MOCKS) {
    const loadSteps = buildLoadSteps(items);
    return mockDelay({
      id: `plan-${moveId}`,
      moveId,
      loadSteps,
      truckMapSVG: renderTruckMapSVG(items, truckSize, 'top'),
    });
  }

  const response = await apiFetch<Pick<PackingPlan, 'loadSteps' | 'truckMapSVG'>>('/v1/packing-plan', {
    method: 'POST',
    body: JSON.stringify({ moveId, items }),
  });

  return {
    id: `plan-${moveId}`,
    moveId,
    loadSteps: response.loadSteps,
    // Fall back to the client-side schematic if the service omits one.
    truckMapSVG: response.truckMapSVG ?? renderTruckMapSVG(items, truckSize, 'top'),
  };
}
