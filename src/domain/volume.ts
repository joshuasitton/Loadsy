import type { Dimensions, InventoryItem, Move, Room } from './types';

/** Spec §6 Q1 (resolved): 20%, mid-range of the 15–30% band. */
export const DEFAULT_PACKING_BUFFER_PCT = 0.2;
export const MIN_PACKING_BUFFER_PCT = 0.15;
export const MAX_PACKING_BUFFER_PCT = 0.3;

const CUBIC_INCHES_PER_CUBIC_FOOT = 1728;

/** Cubic feet for a set of inch dimensions, rounded to 2dp so sums stay stable. */
export function cubicFeetFor(d: Dimensions): number {
  const raw = (d.lengthIn * d.widthIn * d.heightIn) / CUBIC_INCHES_PER_CUBIC_FOOT;
  return Math.round(raw * 100) / 100;
}

/** Swift: `Room.totalCubicFeet` */
export function roomCubicFeet(room: Room): number {
  return round2(room.items.reduce((sum, item) => sum + item.cubicFeet, 0));
}

/** Swift: `Move.rawVolumeCuFt` */
export function rawVolumeCuFt(move: Move): number {
  return round2(move.rooms.reduce((sum, room) => sum + roomCubicFeet(room), 0));
}

/** Swift: `Move.adjustedVolumeCuFt` — raw volume plus the packing-inefficiency buffer. */
export function adjustedVolumeCuFt(move: Move): number {
  return round2(rawVolumeCuFt(move) * (1 + clampBuffer(move.packingBufferPct)));
}

export function clampBuffer(pct: number): number {
  if (Number.isNaN(pct)) return DEFAULT_PACKING_BUFFER_PCT;
  return Math.min(MAX_PACKING_BUFFER_PCT, Math.max(MIN_PACKING_BUFFER_PCT, pct));
}

export function allItems(move: Move): InventoryItem[] {
  return move.rooms.flatMap((r) => r.items);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
