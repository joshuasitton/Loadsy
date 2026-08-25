import type { InventoryItem, PackingPlan, TruckSize } from '../domain/types';
import { buildLoadSteps } from '../domain/packing';
import { renderTruckMapSVG } from '../truckmap/renderSvg';
import { finiteNumber, isRecord, nonEmptyString } from '../lib/guards';
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

  const response = await apiFetch<unknown>('/v1/packing-plan', {
    method: 'POST',
    body: JSON.stringify({ moveId, items, truckSize }),
  });

  // A plan without loadSteps used to be accepted, persisted to AsyncStorage, and
  // then dereferenced unguarded by the dashboard — so a merely INCOMPLETE 200
  // response, not even an error, crashed the app on every launch thereafter.
  // Falling back to the local build is strictly better than storing a broken plan.
  const loadSteps = parseLoadSteps(isRecord(response) ? response.loadSteps : null);

  return {
    id: `plan-${moveId}`,
    moveId,
    loadSteps: loadSteps ?? buildLoadSteps(items),
    // Fall back to the client-side schematic if the service omits one.
    truckMapSVG:
      (isRecord(response) ? nonEmptyString(response.truckMapSVG) : null) ??
      renderTruckMapSVG(items, truckSize, 'top'),
  };
}

/** Returns null when the response cannot supply a usable plan at all. */
function parseLoadSteps(value: unknown): PackingPlan['loadSteps'] | null {
  if (!Array.isArray(value)) return null;
  const steps = value.flatMap((step) => {
    if (!isRecord(step)) return [];
    const id = nonEmptyString(step.id);
    const title = nonEmptyString(step.title);
    const order = finiteNumber(step.order);
    if (id === null || title === null || order === null) return [];
    return [
      {
        id,
        order,
        title,
        instruction: typeof step.instruction === 'string' ? step.instruction : '',
        itemIds: Array.isArray(step.itemIds)
          ? step.itemIds.filter((itemId): itemId is string => typeof itemId === 'string')
          : [],
      },
    ];
  });
  return steps.length > 0 ? steps : null;
}
