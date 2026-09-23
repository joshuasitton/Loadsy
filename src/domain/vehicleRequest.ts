/**
 * "Mine isn't listed" – what is counted when a person's vehicle is missing from
 * `OWN_VEHICLES`. Decided 23 September: count it, because it is the number that says which
 * vehicles to research next, and accept that the App Store privacy answer changes with it.
 *
 * Three fields, all picked from fixed lists: the body type, the make and the model year.
 * Nothing typed, so nothing a person writes can end up in a log – a free-text "model" box
 * is where a name or a phone number would arrive. No model, inventory, address or
 * identifier is sent. The year is there because one make's SUV is several generations
 * with different cargo floors: "forty 2019–2022 Honda SUVs" says which CR-V figures to
 * find, where "forty Honda SUVs" does not.
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

/** How many model years are offered, counting back from the newest. */
export const MODEL_YEAR_SPAN = 20;

/** For a vehicle older than the list, and for someone who does not know. */
export const OTHER_YEARS = ['Older', 'Not sure'] as const;

/**
 * The model years offered, newest first, then `OTHER_YEARS`. Computed from the date rather
 * than written out, so the list does not quietly stop a year short every January. The
 * newest is next year's: a model year goes on sale the autumn before it is named for.
 */
export function modelYears(now: Date): string[] {
  const newest = now.getUTCFullYear() + 1;
  const years = Array.from({ length: MODEL_YEAR_SPAN + 1 }, (_, i) => String(newest - i));
  return [...years, ...OTHER_YEARS];
}

export interface VehicleRequest {
  body: BodyType;
  make: VehicleMake;
  /** A model year from `modelYears`, "Older" or "Not sure". */
  year: string;
}

const FIELDS = ['body', 'make', 'year'];

/**
 * A request as the route may count it, or null. Anything but exactly the three known
 * fields with known values is refused – an extra field is refused rather than dropped, so
 * a client that starts sending more is noticed instead of silently trimmed.
 *
 * `now` is the server's clock. A phone whose clock is a year ahead offers a year the
 * server has not reached and is refused; that costs one count, never the person anything.
 */
export function parseVehicleRequest(value: unknown, now: Date = new Date()): VehicleRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== FIELDS.length || !FIELDS.every((field) => keys.includes(field))) return null;
  const { body, make, year } = record;
  if (!(BODY_TYPES as readonly unknown[]).includes(body)) return null;
  if (!(VEHICLE_MAKES as readonly unknown[]).includes(make)) return null;
  if (typeof year !== 'string' || !modelYears(now).includes(year)) return null;
  return { body: body as BodyType, make: make as VehicleMake, year };
}

/**
 * The one line the route writes, and all it writes. A fixed event name and the three picks:
 * no time (the log has its own), no address, no request id.
 */
export function vehicleRequestLogLine(request: VehicleRequest): string {
  return JSON.stringify({ event: 'vehicle_not_listed', body: request.body, make: request.make, year: request.year });
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
