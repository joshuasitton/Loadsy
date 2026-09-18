/**
 * Whether a load fits something smaller than a truck: a pickup, an open trailer, an
 * enclosed cargo trailer. Decided 18 September: these are offered at launch beside the
 * truck recommendation.
 *
 * A truck is sized by volume alone, because everything in a home fits through its door.
 * These cannot be. A pickup bed is shorter than a sofa; an open trailer has no roof to
 * stop a stack; so three things are checked, and the first to fail is the reason given:
 *
 *   - volume  the buffered load against the space, less the same safety reserve a truck
 *             keeps (`SAFETY_HEADROOM_PCT`) – a small vehicle is no more forgiving
 *   - pieces  every item must fit the space in some upright-or-laid-down orientation;
 *             one sofa that does not is a second trip however little else there is
 *   - height  what may ride above the rails of an open bed is capped – see each spec
 *
 * Payload is NOT checked: the inventory records a weight class, not pounds, and
 * inventing pounds would be a number nobody could defend. The screen says to check the
 * payload for heavy loads instead.
 *
 * Pure, so `npm test` pins every rule with nothing installed.
 */

import { SAFETY_HEADROOM_PCT } from './truck';
import type { InventoryItem, Move } from './types';
import { adjustedVolumeCuFt, allItems } from './volume';

export type SmallVehicleKind = 'pickup' | 'openTrailer' | 'cargoTrailer';

export interface SmallVehicle {
  id: string;
  kind: SmallVehicleKind;
  /** "Pickup Truck", "5×8 Cargo Trailer" */
  label: string;
  /** The load space in inches, and the height a load may reach from the floor of it. */
  lengthIn: number;
  widthIn: number;
  loadHeightIn: number;
  enclosed: boolean;
  needsTow: boolean;
  /**
   * An enclosed trailer's door opening, which is smaller than its inside: a piece has to
   * pass through it, not only fit once in. Open beds load from above and have none.
   */
  door?: { widthIn: number; heightIn: number };
  /** Most it may carry, in pounds, as published – shown, not checked (see above). */
  maxLoadLb: number;
  /** Where the dimensions come from – a URL or a stated rule. */
  source: string;
}

export interface VehicleFit {
  vehicle: SmallVehicle;
  fits: boolean;
  /** Plain words for why not, or null when it fits. */
  reason: string | null;
  /** What the space may be asked to carry, after the safety reserve, in ft³. */
  usableCuFt: number;
  /** Items too big for the space in any orientation. */
  tooBig: InventoryItem[];
}

const CUBIC_INCHES_PER_CUBIC_FOOT = 1728;

export function usableCuFtOf(vehicle: SmallVehicle): number {
  const cuFt = (vehicle.lengthIn * vehicle.widthIn * vehicle.loadHeightIn) / CUBIC_INCHES_PER_CUBIC_FOOT;
  return Math.round(cuFt * (1 - SAFETY_HEADROOM_PCT) * 10) / 10;
}

/**
 * Whether one item fits the space, turned any way that keeps its faces square to the
 * floor: its sides and the space's, each sorted longest first, compared side by side.
 * A sofa can be stood on end in a trailer; it cannot be folded.
 */
export function itemFits(item: Pick<InventoryItem, 'dimensions'>, vehicle: SmallVehicle): boolean {
  const piece = [item.dimensions.lengthIn, item.dimensions.widthIn, item.dimensions.heightIn].sort((a, b) => b - a);
  const space = [vehicle.lengthIn, vehicle.widthIn, vehicle.loadHeightIn].sort((a, b) => b - a);
  if (!piece.every((side, i) => side <= space[i]!)) return false;
  if (!vehicle.door) return true;
  // Through the door end-first: its two shorter sides must pass the opening, turned
  // whichever way suits.
  const opening = [vehicle.door.widthIn, vehicle.door.heightIn].sort((a, b) => b - a);
  return piece[1]! <= opening[0]! && piece[2]! <= opening[1]!;
}

const inches = (n: number) => `${Math.round(n)}`;

export function assessVehicle(move: Move, vehicle: SmallVehicle): VehicleFit {
  const usableCuFt = usableCuFtOf(vehicle);
  const items = allItems(move);
  const tooBig = items.filter((item) => !itemFits(item, vehicle));
  const needed = adjustedVolumeCuFt(move);

  let reason: string | null = null;
  if (items.length === 0) {
    reason = 'Nothing in the inventory yet';
  } else if (tooBig.length > 0) {
    const first = tooBig.reduce((a, b) => (longest(b) > longest(a) ? b : a));
    const more = tooBig.length > 1 ? ` and ${tooBig.length - 1} more` : '';
    const d = first.dimensions;
    // The piece's size against the space's, because a piece can fail on width or height
    // as easily as length: a queen bed frame is shorter than a pickup bed and wider than
    // the gap between its wheel wells.
    reason = `The ${first.name}${more} won't fit – ${inches(d.lengthIn)} × ${inches(d.widthIn)} × ${inches(d.heightIn)} in against ${inches(vehicle.lengthIn)} × ${inches(vehicle.widthIn)} × ${inches(vehicle.loadHeightIn)} in of space`;
  } else if (needed > usableCuFt) {
    reason = `Too much – your load needs about ${Math.round(needed)} ft³, and this takes about ${Math.round(usableCuFt)} ft³`;
  }
  return { vehicle, fits: reason === null, reason, usableCuFt, tooBig };
}

function longest(item: InventoryItem): number {
  return Math.max(item.dimensions.lengthIn, item.dimensions.widthIn, item.dimensions.heightIn);
}

/**
 * Every small vehicle assessed against the move, smallest first. The screen shows the
 * ones that fit as alternatives to the truck, and says in one line why the rest don't.
 */
export function assessSmallVehicles(move: Move, vehicles: readonly SmallVehicle[]): VehicleFit[] {
  return vehicles
    .map((vehicle) => assessVehicle(move, vehicle))
    .sort((a, b) => a.usableCuFt - b.usableCuFt);
}
