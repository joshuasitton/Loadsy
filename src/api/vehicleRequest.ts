/**
 * Sends one "Mine isn't listed" count to `/v1/vehicle-request` – see
 * src/domain/vehicleRequest.ts for what is in it and why that is all.
 *
 * Never throws. The person has already been told their vehicle is not listed and pointed
 * at the truck; a failed count changes nothing they do, so it must not show them an
 * error. In a mock build it sends nothing: a demo tap is not a person's vehicle, and
 * counting testers would put the wrong cars at the top of the research list.
 */

import type { VehicleRequest } from '../domain/vehicleRequest';
import { mockDelay, resolveUrl, USE_MOCKS } from './client';

export async function sendVehicleRequest(request: VehicleRequest): Promise<void> {
  if (USE_MOCKS) {
    await mockDelay(undefined, 300);
    return;
  }
  try {
    await fetch(resolveUrl('/v1/vehicle-request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: request.body, make: request.make }),
    });
  } catch {
    // Deliberately silent – see above.
  }
}
