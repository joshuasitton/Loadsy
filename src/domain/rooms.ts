/**
 * Resolving which room a capture belongs to.
 *
 * Screen 1 asks the user to name the room, then creates one. Because the id was
 * minted fresh on every capture and the reducer only dedups by id, photographing
 * the same living room twice produced TWO rooms both called "Living Room", each
 * holding its own copy of the furniture. Nothing downstream can tell that apart
 * from a home that genuinely has two living rooms, so the volume simply doubles
 * and the truck recommendation grows with it.
 *
 * Matching on the name the user typed is the fix: they already told us which room
 * this is, and that answer is more reliable than an id derived from the clock.
 */

import type { Move, Room } from './types';

/** Names are compared the way a person would read them, not byte-for-byte. */
export function normaliseRoomName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The existing room the user means by this name, or null when it is a new one. */
export function findRoomByName(move: Move, name: string): Room | null {
  const target = normaliseRoomName(name);
  if (target.length === 0) return null;
  return move.rooms.find((room) => normaliseRoomName(room.name) === target) ?? null;
}

/**
 * The id a capture of this room should write to: the existing room's when the
 * user is adding another photo of somewhere already captured, otherwise a new one.
 *
 * The caller must use the returned id for BOTH addRoom and addItems. Dispatching
 * addRoom with a colliding id is a no-op in the reducer, so an addItems aimed at
 * a different id would find no room and drop the items silently.
 */
export function resolveRoomId(move: Move, name: string, newId: string): string {
  return findRoomByName(move, name)?.id ?? newId;
}
