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
 * Reserve kept between the buffered load and the truck's published interior.
 *
 * Without it, selection sits on a knife edge: `adjusted <= capacity.max` hands a
 * load computed at exactly 402.0 ft³ a 10ft truck with ZERO slack, so any error at
 * all — a missed footstool, a sofa measured 6 inches short — under-sizes it.
 *
 * The two failures are not symmetric and must not be traded off as if they were.
 * An over-sized truck costs roughly thirty dollars. An under-sized one means
 * furniture standing on the driveway, a second trip, and a moving day that does
 * not finish. So the boundary is deliberately biased one way.
 *
 * SIZED FOR 3 SIGMA, one-sided: under-sizing must be a ≤0.135% event.
 *
 * The figure is measured, not chosen. Under-sizing happens exactly when the true
 * load exceeds the estimate by more than 1/(1 - reserve), so the reserve needed is
 * the 99.865th percentile of the true/estimated ratio. Simulated over a realistic
 * volume-weighted inventory, where a handful of large items carry most of the load
 * and therefore average far less than the raw item count suggests:
 *
 *   dimensional error only, clean classification ......  8.4%
 *   + 3% sub-type confusion (loveseat vs sectional) ... 10.3%
 *   + 5% stacked-box undercount ....................... 10.5%
 *   looser dimensions (σ=0.15) + classification error .. 15.3%
 *   raw VLM-quality dimensions (σ=0.25) ............... 20.2%
 *
 * 15% holds 3σ across the realistic operating range — including a detector whose
 * dimensions are looser than the prior table's best case, which is where any real
 * deployment starts. A reserve tuned to the 8.4% best case would silently stop
 * being 3σ the moment classification got harder.
 *
 * Not higher, because conservatism is already stacked twice upstream:
 *   - item volumes are BOUNDING BOXES, which exceed what a load actually occupies
 *     once pieces nest (moving-industry packed figures run 11-50% lower)
 *   - the 20% packing buffer sits on top of that
 * Those alone imply filling a truck to ~60-69% of its interior; this reserve takes
 * it to roughly 51-59%. Past that the recommendation stops being useful — every
 * move gets a truck it plainly does not need, and the user stops believing any of it.
 *
 * The 3σ claim is asserted by simulation in __tests__/truck.test.ts, not just
 * asserted here. If the error model changes, that test is what fails.
 */
export const SAFETY_HEADROOM_PCT = 0.15;

/**
 * What a truck may be asked to carry: its published interior, less the reserve.
 * This, not `capacity.max`, is the number selection is allowed to fill.
 */
export function usableCapacityCuFt(size: TruckSize): number {
  return Math.round(TRUCK_CAPACITY[size].max * (1 - SAFETY_HEADROOM_PCT) * 100) / 100;
}

/**
 * Smallest truck that can hold the buffered volume WITH the safety reserve intact.
 *
 * A load that would exactly fill a truck is given the next size up. That is the
 * intended behaviour, not an off-by-one: filling a truck to its geometric ceiling
 * is not achievable with rigid irregular objects, and being wrong here costs the
 * user their moving day rather than a rental upgrade.
 */
export function recommendTruckSize(adjustedCuFt: number): TruckSize {
  // A load we cannot measure must not silently select the smallest truck.
  if (!Number.isFinite(adjustedCuFt)) return '26ft';
  for (const size of TRUCK_SIZES) {
    if (adjustedCuFt <= usableCapacityCuFt(size)) return size;
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
    // Measured against the same usable figure selection uses, so the second-trip
    // warning fires while there is still time to plan one — not once the load has
    // already passed the point a single truck could take it.
    exceedsLargest: adjustedCuFt > usableCapacityCuFt('26ft'),
    headroomCuFt: Math.round((capacity.max - adjustedCuFt) * 100) / 100,
  };
}
