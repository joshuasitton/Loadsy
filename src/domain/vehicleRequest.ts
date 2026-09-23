/**
 * "Mine isn't listed" – what is counted when a person's vehicle is missing from
 * `OWN_VEHICLES`. Decided 23 September: count it, because it is the number that says which
 * vehicles to research next, and accept that the App Store privacy answer changes with it.
 *
 * Two fields, both picked from fixed lists: the body type and the make. Nothing typed, so
 * nothing a person writes can end up in a log – a free-text "model" box is where a name or
 * a phone number would arrive. No model, year, inventory, address or identifier is sent.
 * Two picks are enough to order the research: "forty Honda SUVs" says to find the CR-V
 * and Pilot figures next.
 *
 * Shared by the screen that sends it and the route that receives it
 * (`app/v1/vehicle-request+api.ts`), so the two cannot disagree about what is valid.
 * Pure, so `npm test` pins it with nothing installed.
 */

import { BODY_TYPES, type BodyType } from './ownVehicle';

/** The makes offered, most-sold first, and "Other" for the rest. */
export const VEHICLE_MAKES = [
  'Toyota',
  'Ford',
  'Chevrolet',
  'Honda',
  'Nissan',
  'Hyundai',
  'Kia',
  'Subaru',
  'Jeep',
  'Ram',
  'GMC',
  'Tesla',
  'Mazda',
  'Volkswagen',
  'Lexus',
  'BMW',
  'Mercedes-Benz',
  'Dodge',
  'Chrysler',
  'Buick',
  'Audi',
  'Volvo',
  'Other',
] as const;

export type VehicleMake = (typeof VEHICLE_MAKES)[number];

export interface VehicleRequest {
  body: BodyType;
  make: VehicleMake;
}

/**
 * A request as the route may count it, or null. Anything but exactly the two known fields
 * with known values is refused – an extra field is refused rather than dropped, so a
 * client that starts sending more is noticed instead of silently trimmed.
 */
export function parseVehicleRequest(value: unknown): VehicleRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('body') || !keys.includes('make')) return null;
  const { body, make } = record;
  if (!(BODY_TYPES as readonly unknown[]).includes(body)) return null;
  if (!(VEHICLE_MAKES as readonly unknown[]).includes(make)) return null;
  return { body: body as BodyType, make: make as VehicleMake };
}

/**
 * The one line the route writes, and all it writes. A fixed event name and the two picks:
 * no time (the log has its own), no address, no request id.
 */
export function vehicleRequestLogLine(request: VehicleRequest): string {
  return JSON.stringify({ event: 'vehicle_not_listed', body: request.body, make: request.make });
}

/**
 * How often one client is counted. A person sends this once; three an hour allows for a
 * second car in the household and a change of mind. The limit is not there to protect
 * money, as the detection limit is – nothing here costs anything – but to keep one
 * person's taps from outvoting everyone else's in the count.
 */
export const VEHICLE_REQUEST_PER_CLIENT = { limit: 3, windowMs: 60 * 60_000 };

/** The backstop for many addresses at once, as for detection. */
export const VEHICLE_REQUEST_PER_INSTANCE = { limit: 200, windowMs: 15 * 60_000 };
