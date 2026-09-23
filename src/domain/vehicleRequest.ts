/**
 * "Mine isn't listed" – what is counted when a person's vehicle is missing from
 * `OWN_VEHICLES`. Decided 23 September: count it, because it is the number that says which
 * vehicles to research next, and accept that the App Store privacy answer changes with it.
 *
 * Four fields, asked in this order and all picked from fixed lists: the body type, the
 * model year, the make and the model. Nothing typed, so nothing a person writes can end up
 * in a log – a free-text box is where a name or a phone number would arrive. No inventory,
 * address or identifier is sent. Each field narrows the research: the model says which
 * vehicle, and the year says which generation of it – one CR-V is several cargo floors.
 *
 * Shared by the screen that sends it and the route that receives it
 * (`app/v1/vehicle-request+api.ts`), so the two cannot disagree about what is valid.
 * Pure, so `npm test` pins it with nothing installed.
 */

import { BODY_TYPES, type BodyType } from './ownVehicle';

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

/** Every model list ends with this, for a model the list does not name. */
export const OTHER_MODEL = 'Other';

/**
 * The models offered for each make and body type – US models of the last twenty years,
 * current names first. Names only, never figures, so this list needs no sources: it says
 * what people drive, and `ownVehicles.ts` says what is known about the space inside.
 *
 * Kept to the models that matter for a move. Vans that are not minivans (Transit Connect,
 * ProMaster City, Metris) are left out on purpose: a cargo van is a truck-sized question
 * the truck screen already answers. A model missing here is "Other", and a run of "Other"
 * counts for one make is the sign to add it.
 */
export const VEHICLE_MODELS: Record<Exclude<VehicleMake, 'Other'>, Partial<Record<BodyType, readonly string[]>>> = {
  Toyota: {
    pickup: ['Tacoma', 'Tundra'],
    minivan: ['Sienna'],
    suv: ['RAV4', 'Highlander', 'Grand Highlander', '4Runner', 'Corolla Cross', 'Sequoia', 'Venza', 'Land Cruiser', 'bZ4X'],
    car: ['Camry', 'Corolla', 'Prius', 'Crown'],
  },
  Ford: {
    pickup: ['F-150', 'Ranger', 'Maverick', 'F-250 Super Duty', 'F-150 Lightning'],
    suv: ['Explorer', 'Escape', 'Bronco', 'Bronco Sport', 'Expedition', 'Edge', 'Mustang Mach-E'],
    car: ['Mustang', 'Fusion', 'Focus'],
  },
  Chevrolet: {
    pickup: ['Silverado 1500', 'Colorado', 'Silverado HD'],
    suv: ['Equinox', 'Tahoe', 'Suburban', 'Traverse', 'Trax', 'Blazer', 'Trailblazer'],
    car: ['Malibu', 'Cruze', 'Bolt EV', 'Camaro'],
  },
  Honda: {
    pickup: ['Ridgeline'],
    minivan: ['Odyssey'],
    suv: ['CR-V', 'HR-V', 'Pilot', 'Passport', 'Prologue'],
    car: ['Civic', 'Accord', 'Fit', 'Insight'],
  },
  Nissan: {
    pickup: ['Frontier', 'Titan'],
    minivan: ['Quest'],
    suv: ['Rogue', 'Murano', 'Pathfinder', 'Kicks', 'Armada', 'Ariya'],
    car: ['Altima', 'Sentra', 'Versa', 'Leaf', 'Maxima'],
  },
  Hyundai: {
    pickup: ['Santa Cruz'],
    suv: ['Tucson', 'Santa Fe', 'Palisade', 'Kona', 'Venue', 'Ioniq 5'],
    car: ['Elantra', 'Sonata', 'Accent', 'Ioniq 6'],
  },
  Kia: {
    minivan: ['Carnival', 'Sedona'],
    suv: ['Telluride', 'Sorento', 'Sportage', 'Seltos', 'Soul', 'Niro', 'EV9', 'EV6'],
    car: ['Forte', 'K5', 'Optima', 'Rio'],
  },
  Subaru: {
    suv: ['Outback', 'Forester', 'Crosstrek', 'Ascent', 'Solterra'],
    car: ['Impreza', 'Legacy', 'WRX'],
  },
  Jeep: {
    pickup: ['Gladiator'],
    suv: ['Grand Cherokee', 'Wrangler', 'Cherokee', 'Compass', 'Renegade', 'Wagoneer', 'Grand Wagoneer'],
  },
  Ram: {
    pickup: ['1500', '2500', '3500'],
  },
  GMC: {
    pickup: ['Sierra 1500', 'Canyon', 'Sierra HD'],
    suv: ['Acadia', 'Terrain', 'Yukon', 'Yukon XL'],
  },
  Tesla: {
    pickup: ['Cybertruck'],
    suv: ['Model Y', 'Model X'],
    car: ['Model 3', 'Model S'],
  },
  Mazda: {
    suv: ['CX-5', 'CX-30', 'CX-50', 'CX-9', 'CX-90', 'CX-70'],
    car: ['Mazda3', 'Mazda6', 'MX-5 Miata'],
  },
  Volkswagen: {
    minivan: ['ID. Buzz'],
    suv: ['Tiguan', 'Atlas', 'Atlas Cross Sport', 'Taos', 'ID.4'],
    car: ['Jetta', 'Golf', 'GTI', 'Passat'],
  },
  Lexus: {
    suv: ['RX', 'NX', 'GX', 'UX', 'TX', 'LX'],
    car: ['ES', 'IS'],
  },
  BMW: {
    suv: ['X3', 'X5', 'X1', 'X7'],
    car: ['3 Series', '5 Series'],
  },
  'Mercedes-Benz': {
    suv: ['GLC', 'GLE', 'GLA', 'GLB', 'GLS'],
    car: ['C-Class', 'E-Class'],
  },
  Dodge: {
    minivan: ['Grand Caravan'],
    suv: ['Durango', 'Journey', 'Hornet'],
    car: ['Charger', 'Challenger'],
  },
  Chrysler: {
    minivan: ['Pacifica', 'Voyager', 'Town & Country'],
    car: ['300'],
  },
  Buick: {
    suv: ['Enclave', 'Encore', 'Encore GX', 'Envision', 'Envista'],
  },
  Audi: {
    suv: ['Q5', 'Q7', 'Q3', 'Q8'],
    car: ['A4', 'A6', 'A3'],
  },
  Volvo: {
    suv: ['XC90', 'XC60', 'XC40'],
    car: ['S60', 'V60', 'V90'],
  },
};

/**
 * The models to offer once a type and a make are picked: that make's models of that type,
 * then "Other". A make with none of that type – a Chevrolet minivan – offers "Other" alone,
 * as does the make "Other".
 */
export function modelsFor(make: VehicleMake, body: BodyType): string[] {
  const named = make === 'Other' ? [] : (VEHICLE_MODELS[make][body] ?? []);
  return [...named, OTHER_MODEL];
}

export interface VehicleRequest {
  body: BodyType;
  /** A model year from `modelYears`, "Older" or "Not sure". */
  year: string;
  make: VehicleMake;
  /** A model from `modelsFor(make, body)` – "Other" included. */
  model: string;
}

const FIELDS = ['body', 'year', 'make', 'model'];

/**
 * A request as the route may count it, or null. Anything but exactly the four known
 * fields with known values is refused – an extra field is refused rather than dropped, so
 * a client that starts sending more is noticed instead of silently trimmed. The model has
 * to belong to the make and type sent with it, so a count can never name a Honda Tacoma.
 *
 * `now` is the server's clock. A phone whose clock is a year ahead offers a year the
 * server has not reached and is refused; that costs one count, never the person anything.
 */
export function parseVehicleRequest(value: unknown, now: Date = new Date()): VehicleRequest | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== FIELDS.length || !FIELDS.every((field) => keys.includes(field))) return null;
  const { body, year, make, model } = record;
  if (!(BODY_TYPES as readonly unknown[]).includes(body)) return null;
  if (typeof year !== 'string' || !modelYears(now).includes(year)) return null;
  if (!(VEHICLE_MAKES as readonly unknown[]).includes(make)) return null;
  if (typeof model !== 'string' || !modelsFor(make as VehicleMake, body as BodyType).includes(model)) return null;
  return { body: body as BodyType, year, make: make as VehicleMake, model };
}

/**
 * The one line the route writes, and all it writes. A fixed event name and the four picks,
 * in the order they are asked: no time (the log has its own), no address, no request id.
 */
export function vehicleRequestLogLine(request: VehicleRequest): string {
  return JSON.stringify({
    event: 'vehicle_not_listed',
    body: request.body,
    year: request.year,
    make: request.make,
    model: request.model,
  });
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
