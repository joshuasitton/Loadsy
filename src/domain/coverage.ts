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
 *
 * Until 18 September the list was filtered against the rooms a person had named, so
 * a captured garage was not asked about again. Rooms are no longer named (README,
 * "Nobody names a room"), so there is nothing to match against and the whole list is
 * shown as a checklist. It is the one list: the inventory screen renders it, and does
 * not keep its own.
 */

export interface CoverageArea {
  readonly id: string;
  /** The label shown. */
  readonly label: string;
  /** Why it is worth checking, in the user's terms. */
  readonly hint: string;
}

/**
 * Ordered by how much volume is typically at stake. A missed garage can be a
 * truck size on its own; a missed coat closet rarely is.
 */
export const COMMONLY_MISSED: readonly CoverageArea[] = [
  { id: 'garage', label: 'Garage', hint: 'Bikes, tools and shelving add up fast' },
  { id: 'storage', label: 'Storage or shed', hint: 'Easy to forget when it is not in the house' },
  { id: 'basement', label: 'Basement', hint: 'Often where the bulky things live' },
  { id: 'attic', label: 'Attic or loft', hint: 'Boxes up here are easy to overlook' },
  { id: 'closets', label: 'Closets', hint: 'Everything hanging still has to travel' },
  {
    id: 'cabinets',
    label: 'Kitchen cabinets',
    // Detection sees closed doors, not what is behind them, and built-in cabinets are
    // not furniture it lists – so an apartment's kitchen can photograph as nearly empty.
    hint: 'Dishes, pans and the pantry are behind closed doors – usually several boxes',
  },
  { id: 'laundry', label: 'Laundry', hint: 'A washer and dryer are 40 ft³ between them' },
  { id: 'outdoor', label: 'Patio or balcony', hint: 'Outdoor furniture and the grill count too' },
];
