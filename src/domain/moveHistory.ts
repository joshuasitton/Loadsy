/**
 * The record of moves already made.
 *
 * Pure TypeScript — no React, no I/O — so the archiving policy and its validation
 * are unit-testable in isolation, like the rest of `src/domain`.
 *
 * ## Why the numbers are frozen
 *
 * A completed move stores its own truck size and volumes rather than a reference
 * that gets recomputed on the way out. Loadsy's capacity table and safety reserve
 * have already changed once and will change again; recomputing would silently
 * rewrite what a past move says, so a user who was told "20 ft truck" in March
 * could open the same record in June and find it now says 26. That is not a
 * record. History is what you were told at the time, and it has to stay that way
 * even when the current answer would differ.
 *
 * The room and item names are kept alongside so the record can be looked at, not
 * just counted — but nothing is derived from them after the fact.
 */

import type { Move, TruckSize } from './types';
import { TRUCK_SIZES } from './types';
import { adjustedVolumeCuFt, allItems, rawVolumeCuFt } from './volume';

/**
 * How many completed moves are kept.
 *
 * AsyncStorage is a single serialised blob that is read and rewritten whole, so
 * unbounded history makes every launch slower forever. Fifty is far more moves
 * than a person makes in a lifetime; the cap exists to bound a bug, not a user.
 */
export const HISTORY_LIMIT = 50;

export interface CompletedRoom {
  name: string;
  items: { name: string; cubicFeet: number }[];
}

export interface CompletedMove {
  id: string;
  /** ISO-8601. Supplied by the caller — this module never reads a clock. */
  completedAt: string;
  originZip: string;
  destinationZip: string | null;
  moveDate: string | null;
  /** What the app recommended at the time. Never recomputed. See the note above. */
  truckSize: TruckSize;
  roomCount: number;
  itemCount: number;
  rawCuFt: number;
  adjustedCuFt: number;
  rooms: CompletedRoom[];
}

/**
 * Turns the move in progress into a record of a move that happened.
 *
 * `completedAt` is a parameter rather than a `new Date()` for the same reason the
 * demo scenarios avoid one: a function that reads a clock cannot be asserted on.
 */
export function summariseMove(
  move: Move,
  truckSize: TruckSize,
  completedAt: string,
): CompletedMove {
  const items = allItems(move);
  return {
    // Distinct from the move id: the same move could, in principle, be archived
    // twice, and two records sharing a key would collide in the list.
    id: `completed-${move.id}-${completedAt}`,
    completedAt,
    originZip: move.originZip,
    destinationZip: move.destinationZip,
    moveDate: move.moveDate,
    truckSize,
    roomCount: move.rooms.length,
    itemCount: items.length,
    rawCuFt: rawVolumeCuFt(move),
    adjustedCuFt: adjustedVolumeCuFt(move),
    rooms: move.rooms.map((room) => ({
      name: room.name,
      items: room.items.map((item) => ({ name: item.name, cubicFeet: item.cubicFeet })),
    })),
  };
}

/** Newest first, capped. The oldest record falls off the end rather than the newest. */
export function addCompleted(
  history: readonly CompletedMove[],
  record: CompletedMove,
): CompletedMove[] {
  return [record, ...history.filter((h) => h.id !== record.id)].slice(0, HISTORY_LIMIT);
}

export function removeCompleted(
  history: readonly CompletedMove[],
  id: string,
): CompletedMove[] {
  return history.filter((h) => h.id !== id);
}

/** True when there is anything worth archiving. An empty move is not a move. */
export function isWorthArchiving(move: Move): boolean {
  return allItems(move).length > 0;
}

/**
 * Validates a stored history payload.
 *
 * Same policy as `parseStoredState`: salvage rather than reject. One unreadable
 * record must not cost the user every other move they have made, so bad entries
 * are dropped individually and everything legible survives.
 */
export function parseHistory(raw: string | null): CompletedMove[] {
  if (!raw) return [];
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(payload)) return [];

  const out: CompletedMove[] = [];
  const seen = new Set<string>();
  for (const entry of payload) {
    const record = parseRecord(entry);
    if (record === null || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  return out.slice(0, HISTORY_LIMIT);
}

function parseRecord(value: unknown): CompletedMove | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;

  const id = str(v.id);
  const completedAt = str(v.completedAt);
  // Without an id there is nothing to key the row on, and without a timestamp
  // there is nothing to sort or label it by. Everything else has a safe default.
  if (id === null || completedAt === null) return null;

  const truckSize = TRUCK_SIZES.includes(v.truckSize as TruckSize)
    ? (v.truckSize as TruckSize)
    : null;
  if (truckSize === null) return null;

  const rooms = Array.isArray(v.rooms) ? v.rooms.flatMap(parseRoom) : [];

  return {
    id,
    completedAt,
    originZip: typeof v.originZip === 'string' ? v.originZip : '',
    destinationZip: str(v.destinationZip),
    moveDate: str(v.moveDate),
    truckSize,
    roomCount: num(v.roomCount) ?? rooms.length,
    itemCount: num(v.itemCount) ?? rooms.reduce((n, r) => n + r.items.length, 0),
    rawCuFt: num(v.rawCuFt) ?? 0,
    adjustedCuFt: num(v.adjustedCuFt) ?? 0,
    rooms,
  };
}

function parseRoom(value: unknown): CompletedRoom[] {
  if (typeof value !== 'object' || value === null) return [];
  const v = value as Record<string, unknown>;
  const name = str(v.name);
  if (name === null) return [];
  const items = Array.isArray(v.items)
    ? v.items.flatMap((raw) => {
        if (typeof raw !== 'object' || raw === null) return [];
        const item = raw as Record<string, unknown>;
        const itemName = str(item.name);
        if (itemName === null) return [];
        return [{ name: itemName, cubicFeet: num(item.cubicFeet) ?? 0 }];
      })
    : [];
  return [{ name, items }];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
