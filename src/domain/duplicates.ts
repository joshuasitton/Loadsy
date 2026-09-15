/**
 * One object listed in two rooms.
 *
 * Each room is photographed and detected on its own, and a doorway or an open plan puts
 * the next room's furniture in frame. Measured on the first real rooms (15 September): in
 * 50 answers for a family room, the breakfast room's chalkboard was listed in 49, its
 * console table in 35 and its 54 ft³ hutch in 11 – and telling the model not to count
 * what it sees through an opening did not stop it. So instead of trusting one room's
 * answer, the move is checked once every room is in: the same kind of object, at about
 * the same size, in two rooms, is put to the person who knows – which room is it in?
 *
 * Deliberately narrow, because a question that is usually wrong teaches people to tap
 * through it. Only kinds a home normally has one of are checked: a hutch, a sectional, a
 * dining table. Nightstands, mattresses, lamps, chairs and boxes repeat from room to room
 * in real homes and are never asked about – a two-bedroom flat has two beds. An object
 * the app does not recognise is not asked about either.
 *
 * Pure, so `npm test` pins every rule with nothing installed.
 */

import { nameSimilarity, sizeSimilarity } from './itemMatch';
import { volumePriorFor } from './plausibility';
import type { InventoryItem, Move } from './types';

/**
 * The kinds of object a home usually has one of – named by the plausibility table's
 * labels, so "kind" means the same thing here as in the size check. Anything not listed
 * repeats across rooms often enough that asking would mostly be wrong.
 */
export const USUALLY_ONE_PER_HOME: ReadonlySet<string> = new Set([
  'a sectional',
  'a sleeper sofa',
  'a sofa',
  'a loveseat',
  'a recliner',
  'a dining table',
  'a coffee table',
  'a console table',
  'a patio table',
  'a wardrobe',
  'a china cabinet',
  'a sideboard',
  'a media console',
  'a refrigerator',
  'a washer or dryer',
  'a dishwasher',
  'an oven',
  'a treadmill',
  'an exercise bike',
  'a barbecue',
  'a lawn mower',
]);

/**
 * How alike two sizes must be – 1 is identical. The model's two listings of the breakfast
 * room's hutch and console table matched at 0.95 or better; a loveseat against a
 * three-seat sofa is about 0.81, and should not be asked about.
 */
export const DUPLICATE_SIZE_MATCH = 0.85;

export interface SuspectedDuplicate {
  /** Stable for the pair whichever way round it is found: the two item ids, sorted. */
  key: string;
  first: { item: InventoryItem; roomId: string; roomName: string };
  second: { item: InventoryItem; roomId: string; roomName: string };
}

export function duplicateKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

interface Located {
  item: InventoryItem;
  roomId: string;
  roomName: string;
  kind: string;
}

/**
 * Pairs of items in different rooms that are probably one object.
 *
 * Each item is in at most one pair, closest size first, so one answer is asked for at a
 * time: when three rooms all show the same hutch, the first question removes one listing
 * and the next pairs the two that remain. Boxes
 * are never paired. Pairs the person has already said are two real objects – `kept` –
 * are left out, and a pair disappears on its own once either item is removed.
 */
export function suspectedDuplicates(move: Pick<Move, 'rooms'>, kept: readonly string[] = []): SuspectedDuplicate[] {
  const located: Located[] = move.rooms.flatMap((room) =>
    room.items.flatMap((item) => {
      if (item.category === 'box') return [];
      const kind = volumePriorFor(item.name)?.label;
      return kind !== undefined && USUALLY_ONE_PER_HOME.has(kind) ? [{ item, roomId: room.id, roomName: room.name, kind }] : [];
    }),
  );

  const candidates: { a: Located; b: Located; size: number }[] = [];
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const a = located[i]!;
      const b = located[j]!;
      if (a.roomId === b.roomId || a.kind !== b.kind) continue;
      if (kept.includes(duplicateKey(a.item.id, b.item.id))) continue;
      if (nameSimilarity([a.item.name], b.item.name) === 0 && nameSimilarity([b.item.name], a.item.name) === 0) continue;
      const size = sizeSimilarity(a.item.dimensions, b.item.dimensions);
      if (size >= DUPLICATE_SIZE_MATCH) candidates.push({ a, b, size });
    }
  }
  candidates.sort((x, y) => y.size - x.size);

  const used = new Set<string>();
  const pairs: SuspectedDuplicate[] = [];
  for (const { a, b } of candidates) {
    if (used.has(a.item.id) || used.has(b.item.id)) continue;
    used.add(a.item.id);
    used.add(b.item.id);
    pairs.push({
      key: duplicateKey(a.item.id, b.item.id),
      first: { item: a.item, roomId: a.roomId, roomName: a.roomName },
      second: { item: b.item, roomId: b.roomId, roomName: b.roomName },
    });
  }
  return pairs;
}
