import type { Move, TruckSize } from './types';
import { TRUCK_SIZES } from './types';
import { adjustedVolumeCuFt, clampBuffer, rawVolumeCuFt } from './volume';

export interface CapacityRange {
  /** inclusive lower bound, cubic feet */
  min: number;
  /** inclusive upper bound, cubic feet */
  max: number;
}

/**
 * Swift: `TruckSize.capacityCuFt` (ClosedRange)
 *
 * `max` is the vendor's PUBLISHED interior volume, verified against U-Haul's own
 * rental page (uhaul.com/Truck-Rentals): cargo van 246, 10ft 402, 15ft 764,
 * 20ft 1,016, 26ft 1,682 cubic feet.
 *
 * The previous figures were not conservative estimates — they exceeded the trucks.
 * A 10ft truck was listed at 550 ft³ against a real interior of 402, a claim that
 * 137% of the box could be filled. Because recommendTruckSize returns the SMALLEST
 * truck whose max clears the load, overstating capacity under-sizes the truck, and
 * an under-sized truck means furniture left on the driveway and a second trip.
 *
 * Comparing buffered volume against geometric interior is self-consistent here
 * because item volumes are bounding boxes: the sum of bounding boxes already
 * exceeds what the load actually occupies once pieces nest, and the 20% buffer
 * sits on top of that. Do NOT import "cube sheet" figures from moving-industry
 * inventories into these items — those are packed volumes, and mixing the two
 * conventions would introduce exactly the systematic bias this table just removed.
 */
export const TRUCK_CAPACITY: Record<TruckSize, CapacityRange> = {
  van: { min: 150, max: 246 },
  '10ft': { min: 246, max: 402 },
  '15ft': { min: 402, max: 764 },
  '20ft': { min: 764, max: 1016 },
  '26ft': { min: 1016, max: 1682 },
};

export const TRUCK_LABEL: Record<TruckSize, string> = {
  van: 'Cargo Van',
  '10ft': "10' Truck",
  '15ft': "15' Truck",
  '20ft': "20' Truck",
  '26ft': "26' Truck",
};

export const TRUCK_CHIP_LABEL: Record<TruckSize, string> = {
  van: 'VAN',
  '10ft': '10 FT',
  '15ft': '15 FT',
  '20ft': '20 FT',
  '26ft': '26 FT',
};

/**
 * Spec §3 Screen 3: room-count equivalence copy comes from a static lookup table,
 * it is NOT computed from volume.
 */
export const TRUCK_ROOM_EQUIVALENCE: Record<TruckSize, string> = {
  van: 'Fits a dorm room or studio',
  '10ft': 'Fits a studio or small 1BR',
  '15ft': 'Fits a 1–2BR apartment',
  '20ft': 'Fits a 2–3BR home',
  '26ft': 'Fits a 4BR+ home',
};

export interface TruckRecommendation {
  size: TruckSize;
  rawCuFt: number;
  bufferPct: number;
  adjustedCuFt: number;
  capacity: CapacityRange;
  /** true when the load exceeds even a 26ft truck and a second trip is implied */
  exceedsLargest: boolean;
  /** headroom in cubic feet against the top of the recommended truck's range */
  headroomCuFt: number;
}

/**
 * Smallest truck whose capacity range can hold the buffered volume.
 * Deliberately compares against `capacity.max`: the range's upper bound is what the
 * truck actually holds, the lower bound is the point below which it is over-sized.
 */
export function recommendTruckSize(adjustedCuFt: number): TruckSize {
  for (const size of TRUCK_SIZES) {
    const cap = TRUCK_CAPACITY[size];
    if (adjustedCuFt <= cap.max) return size;
  }
  return '26ft';
}

/** Full "why" breakdown for Screen 3: raw ft³ → buffered ft³ → truck capacity. */
export function buildRecommendation(move: Move): TruckRecommendation {
  const rawCuFt = rawVolumeCuFt(move);
  const adjustedCuFt = adjustedVolumeCuFt(move);
  const size = recommendTruckSize(adjustedCuFt);
  const capacity = TRUCK_CAPACITY[size];
  return {
    size,
    rawCuFt,
    // Clamped, not raw: adjustedCuFt is computed from the clamped buffer, so
    // reporting the unclamped value here would let the struct contradict itself.
    bufferPct: clampBuffer(move.packingBufferPct),
    adjustedCuFt,
    capacity,
    exceedsLargest: adjustedCuFt > TRUCK_CAPACITY['26ft'].max,
    headroomCuFt: Math.round((capacity.max - adjustedCuFt) * 100) / 100,
  };
}
