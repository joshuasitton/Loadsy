/**
 * Prompting for the rooms people forget to photograph.
 *
 * Missed items are the single largest source of a wrong truck, and the only one
 * that fails in the dangerous direction. Simulation over a realistic inventory:
 * a 10% miss rate mis-sizes ~19.5% of moves and 100% of those are UNDER-sized,
 * against ~11.5% for a 20% dimensional error of which 89% are over-sized and
 * therefore harmless. Closing coverage is worth roughly 9.3 points of truck
 * accuracy where perfect measurement is worth 0.7.
 *
 * It is also the one failure the safety reserve cannot reach. A reserve covers
 * error in the volume the app KNOWS about; a garage nobody photographed is not
 * under-estimated, it is absent, and no percentage of headroom recovers it.
 *
 * These are deliberately storage and edge spaces, not living rooms. Nobody forgets
 * the room with the sofa in it; they forget the one with the bikes.
 */

import type { Move } from './types';
import { normaliseRoomName } from './rooms';

export interface CoverageArea {
  readonly id: string;
  /** The room name added on tap, and the label shown. */
  readonly label: string;
  /** Names that count as already covering this area. */
  readonly match: RegExp;
  /** Why it is worth checking, in the user's terms. */
  readonly hint: string;
}

/**
 * Ordered by how much volume is typically at stake. A missed garage can be a
 * truck size on its own; a missed coat closet rarely is.
 */
export const COMMONLY_MISSED: readonly CoverageArea[] = [
  {
    id: 'garage',
    label: 'Garage',
    match: /\b(garage|carport)\b/i,
    hint: 'Bikes, tools and shelving add up fast',
  },
  {
    id: 'storage',
    label: 'Storage or shed',
    match: /\b(storage|shed|locker|unit)\b/i,
    hint: 'Easy to forget when it is not in the house',
  },
  {
    id: 'basement',
    label: 'Basement',
    match: /\b(basement|cellar)\b/i,
    hint: 'Often where the bulky things live',
  },
  {
    id: 'attic',
    label: 'Attic or loft',
    match: /\b(attic|loft)\b/i,
    hint: 'Boxes up here are easy to overlook',
  },
  {
    id: 'closets',
    label: 'Closets',
    // `closets?` matters: the chip adds the room as "Closets", and \bcloset\b does
    // not match that — so the area would be offered again the moment it was taken.
    match: /\b(closets?|wardrobe room|walk-?in)\b/i,
    hint: 'Everything hanging still has to travel',
  },
  {
    id: 'laundry',
    label: 'Laundry',
    match: /\b(laundry|utility|mud ?room)\b/i,
    hint: 'A washer and dryer are 40 ft³ between them',
  },
  {
    id: 'outdoor',
    label: 'Patio or balcony',
    match: /\b(patio|balcony|deck|yard|garden|terrace)\b/i,
    hint: 'Outdoor furniture and the grill count too',
  },
];

/**
 * The areas no captured room appears to cover.
 *
 * Matching is on the names the user typed, so someone who called it "Front Garage"
 * or "garage / workshop" is not prompted again. A false prompt is cheap — one
 * dismissal — but a repeated one for a room they already did erodes trust in the
 * whole list, and then the prompts that matter get ignored too.
 */
export function uncoveredAreas(move: Move): CoverageArea[] {
  const captured = move.rooms.map((room) => normaliseRoomName(room.name));
  return COMMONLY_MISSED.filter((area) => !captured.some((name) => area.match.test(name)));
}

/**
 * Whether it is worth asking at all.
 *
 * Silent until there is an inventory to be incomplete: prompting someone with no
 * rooms yet to check their attic is noise, and the empty state already tells them
 * what to do.
 */
export function shouldPromptCoverage(move: Move): boolean {
  return move.rooms.length > 0 && uncoveredAreas(move).length > 0;
}
