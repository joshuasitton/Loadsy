/**
 * POST /v1/vehicle-request – counts one "Mine isn't listed" (decided 23 September).
 *
 * The only thing Loadsy's server keeps, and all of it is one log line per request: the
 * body type, model year, make and model the person picked, from fixed lists – see
 * src/domain/vehicleRequest.ts. The address a request comes from is used, in memory, to
 * stop one person being counted many times, and is never written. The counts are read
 * from the deployment's logs, which is why there is no database: a table would be a
 * second thing to secure and pay for, holding four words per row.
 *
 * PRIVACY: this is what moved the App Store answer off "Data Not Collected" – see
 * APP_STORE.md. Adding a field here changes the label again.
 */

import { clientKey, SlidingWindow } from '../../src/vision/rateLimit';
import {
  parseVehicleRequest,
  VEHICLE_REQUEST_PER_CLIENT,
  VEHICLE_REQUEST_PER_INSTANCE,
  vehicleRequestLogLine,
} from '../../src/domain/vehicleRequest';

const perClient = new SlidingWindow(VEHICLE_REQUEST_PER_CLIENT);
const perInstance = new SlidingWindow(VEHICLE_REQUEST_PER_INSTANCE);

export async function POST(request: Request): Promise<Response> {
  const now = Date.now();
  const verdict = [perClient.take(clientKey(request.headers), now), perInstance.take('*', now)].find(
    (result) => !result.ok,
  );
  if (verdict && !verdict.ok) {
    // Answered as if counted. The person has nothing to retry and nothing to be told:
    // being counted once already is the whole point of the limit.
    return new Response(null, { status: 204 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Malformed request body' }, { status: 400 });
  }

  const vehicle = parseVehicleRequest(payload);
  if (vehicle === null) return Response.json({ error: 'Unknown vehicle' }, { status: 400 });

  console.log(vehicleRequestLogLine(vehicle));
  return new Response(null, { status: 204 });
}
