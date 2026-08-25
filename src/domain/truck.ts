import type { Move, TruckSize } from './types';
import { TRUCK_SIZES } from './types';
import { adjustedVolumeCuFt, clampBuffer, rawVolumeCuFt } from './volume';

export interface CapacityRange {
  /** inclusive lower bound, cubic feet */
  min: number;
  /** inclusive upper bound, cubic feet */
  max: number;
}

/** Swift: `TruckSize.capacityCuFt` (ClosedRange) */
export const TRUCK_CAPACITY: Record<TruckSize, CapacityRange> = {
  van: { min: 150, max: 300 },
  '10ft': { min: 300, max: 550 },
  '15ft': { min: 550, max: 800 },
  '20ft': { min: 800, max: 1100 },
  '26ft': { min: 1100, max: 1600 },
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
