/**
 * Whether the load fits the person's own vehicle, and in how many trips. Decided
 * 23 September: in v1, and "it fits in your own car" is a good outcome even though
 * nobody rents anything.
 *
 * The same fit rule as a pickup or trailer (`itemFits` in `vehicleFit.ts`): every piece
 * must fit the space in some square-on turn, and pass the opening on the way in. What
 * differs is the answer. A rental is yes or no – you rent the one that fits. Your own car
 * is already in the driveway, so the useful answer is how many trips, and which pieces
 * never go in it at all:
 *
 *   - wontFit  too big for the space, however it turns – usually the sofa or the bed
 *   - tight    fits, but by less than the detector's error, and the size is an estimate
 *   - trips    everything else, split into car-loads, biggest pieces first
 *
 * Pure, so `npm test` pins every rule with nothing installed.
 */

import { itemFits, usableCuFtOf, type CargoSpace } from './vehicleFit';
import type { InventoryItem, Move } from './types';
import { allItems, clampBuffer } from './volume';

export type BodyType = 'pickup' | 'minivan' | 'suv' | 'car';

export const BODY_TYPE_LABEL: Record<BodyType, string> = {
  pickup: 'Pickups',
  minivan: 'Minivans',
  suv: 'SUVs and crossovers',
  car: 'Cars and hatchbacks',
};

/** One of a kind, for a choice: "Pickup", not "Pickups". */
export const BODY_TYPE_SINGULAR: Record<BodyType, string> = {
  pickup: 'Pickup',
  minivan: 'Minivan',
  suv: 'SUV or crossover',
  car: 'Car or hatchback',
};

export const BODY_TYPES: readonly BodyType[] = ['pickup', 'minivan', 'suv', 'car'];

export interface OwnVehicle extends CargoSpace {
  id: string;
  /** "Ford F-150, 5.5 ft bed" */
  label: string;
  /** The model years the figures were published for – "2021–2026". */
  years: string;
  body: BodyType;
  /** The seat arrangement the space assumes – "2nd and 3rd rows stowed". Null for a bed. */
  seats: string | null;
  /** Where the dimensions come from – a URL or a stated rule. */
  source: string;
}

/**
 * How much room a piece must have to spare before an estimated size is trusted.
 *
 * The truck reserve (`SAFETY_HEADROOM_PCT`) can be small because a truck's error is the
 * sum of many pieces' errors, and those mostly cancel. In a car one dresser is the whole
 * answer, and nothing cancels: `truck.ts` puts the detector's per-dimension error around
 * σ = 0.15. No margin a car could afford covers three of those, so this does not try.
 * It marks the pieces where the estimate decides the answer and asks for a tape
 * measure – one measurement, and the answer for that piece is exact. A piece whose size
 * the person has entered is never tight: its size is not an estimate.
 */
export const TIGHT_MARGIN_PCT = 0.1;

/**
 * Past this many trips a truck is the better day, and the screen says so. Not a verdict
 * on the car: four trips is still a yes for someone moving across town for free.
 */
export const PRACTICAL_TRIPS = 3;

export interface Trip {
  items: InventoryItem[];
  /** The buffered volume this trip carries, in ft³. */
  cuFt: number;
}

export interface OwnVehicleFit {
  vehicle: OwnVehicle;
  /** What one car-load may carry, after the same reserve a truck keeps, in ft³. */
  usableCuFt: number;
  trips: Trip[];
  wontFit: InventoryItem[];
  /** Pieces in `trips` whose fit depends on an estimate – measure these first. */
  tight: InventoryItem[];
  /** More trips than `PRACTICAL_TRIPS`: a truck does it in one. */
  truckIsBetter: boolean;
  /** One sentence for the screen – see `ownVehicleSummary`. */
  summary: string;
}

/**
 * A piece fits comfortably when it would still fit at `TIGHT_MARGIN_PCT` larger every
 * way. It is tight when it fits only as detected, and only an estimate can be tight.
 */
export function isTight(item: InventoryItem, space: CargoSpace): boolean {
  if (!item.dimensions.isEstimated || !itemFits(item, space)) return false;
  const grow = 1 + TIGHT_MARGIN_PCT;
  const larger = {
    dimensions: {
      ...item.dimensions,
      lengthIn: item.dimensions.lengthIn * grow,
      widthIn: item.dimensions.widthIn * grow,
      heightIn: item.dimensions.heightIn * grow,
    },
  };
  return !itemFits(larger, space);
}

/**
 * Car-loads, biggest first: each piece goes in the first trip with room for it, and a
 * new trip starts when none has. Biggest first because that is how a car is loaded and
 * because it keeps the count honest – small pieces fill the gaps the big ones leave.
 * A piece larger than one car-load's usable volume but inside the space goes alone: it
 * fits, it is simply the whole trip.
 *
 * The count is a volume count. A trip that fits by volume can still fail to stack, and
 * the reserve kept off the usable space is what absorbs that, as it does for a truck.
 */
export function planTrips(items: readonly InventoryItem[], usableCuFt: number, bufferPct: number): Trip[] {
  const buffer = 1 + clampBuffer(bufferPct);
  const volumeOf = (item: InventoryItem) => item.cubicFeet * buffer;
  const sorted = [...items].sort((a, b) => volumeOf(b) - volumeOf(a) || a.id.localeCompare(b.id));
  const trips: Trip[] = [];
  for (const item of sorted) {
    const volume = volumeOf(item);
    const trip = trips.find((t) => t.cuFt + volume <= usableCuFt);
    if (trip) {
      trip.items.push(item);
      trip.cuFt += volume;
    } else {
      trips.push({ items: [item], cuFt: volume });
    }
  }
  return trips.map((t) => ({ ...t, cuFt: Math.round(t.cuFt * 10) / 10 }));
}

export function assessOwnVehicle(move: Move, vehicle: OwnVehicle): OwnVehicleFit {
  const usableCuFt = usableCuFtOf(vehicle);
  const items = allItems(move);
  const wontFit = items.filter((item) => !itemFits(item, vehicle));
  const fitting = items.filter((item) => itemFits(item, vehicle));
  const tight = fitting.filter((item) => isTight(item, vehicle));
  const trips = planTrips(fitting, usableCuFt, move.packingBufferPct);
  const truckIsBetter = trips.length > PRACTICAL_TRIPS;
  return {
    vehicle,
    usableCuFt,
    trips,
    wontFit,
    tight,
    truckIsBetter,
    summary: ownVehicleSummary(items.length, trips.length, wontFit),
  };
}

/**
 * The sentence for the result, owned here beside the numbers it describes so the two
 * cannot drift – the same rule `packing.ts` follows for a piece's placement.
 */
export function ownVehicleSummary(itemCount: number, tripCount: number, wontFit: readonly InventoryItem[]): string {
  if (itemCount === 0) return 'Nothing in the inventory yet';
  const trips = tripCount === 1 ? 'one trip' : `about ${tripCount} trips`;
  if (wontFit.length === 0) return `Everything fits, in ${trips}.`;
  const named = wontFit.length === 1 ? `The ${wontFit[0]!.name} won't fit` : `${wontFit.length} pieces won't fit`;
  if (tripCount === 0) return 'None of it fits.';
  return `${named} – the rest goes in ${trips}.`;
}

/** The vehicle a move names, or null when it names none or one no longer listed. */
export function findOwnVehicle(id: string | null, catalog: readonly OwnVehicle[]): OwnVehicle | null {
  if (id === null) return null;
  return catalog.find((v) => v.id === id) ?? null;
}

/**
 * What one trip carries, in words: pieces named, repeats counted, biggest first –
 * "Armchair, Medium Box ×4". Eleven lines of "Medium Box" is a list nobody reads.
 */
export function tripLine(trip: Trip): string {
  const counts = new Map<string, number>();
  for (const item of trip.items) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ');
}
