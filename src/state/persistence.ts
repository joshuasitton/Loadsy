/**
 * Validation for everything read back out of AsyncStorage.
 *
 * The stored payload is not trustworthy input. It may have been written by an older
 * build with a different shape, truncated by a kill mid-write, or hand-edited during
 * development. Before this module existed the reducer fed it straight into
 * `buildRecommendation`, so a missing `rooms` array threw a TypeError during render —
 * uncatchable from the loading effect, and thrown again on every relaunch because the
 * same payload was still on disk. A corrupt save bricked the install permanently.
 *
 * The policy here is SALVAGE, not all-or-nothing: a payload with four good rooms and
 * one malformed item should cost the user that item, not their whole move. Anything
 * unusable is dropped and reported, so the caller can tell a clean load from a
 * repaired one and avoid overwriting evidence.
 *
 * Pure TypeScript, no React and no I/O, so the whole policy is unit-testable.
 */

import type {
  DetectionConfidence,
  Dimensions,
  InventoryItem,
  ItemCategory,
  Move,
  MoveStatus,
  PackingPlan,
  Room,
  TruckSize,
  WeightClass,
} from '../domain/types';
import { MOVE_STATUS_ORDER, TRUCK_SIZES } from '../domain/types';
import { clampBuffer, cubicFeetFor, DEFAULT_PACKING_BUFFER_PCT } from '../domain/volume';

const CATEGORIES: readonly ItemCategory[] = ['furniture', 'box', 'appliance', 'fragile', 'other'];
const WEIGHT_CLASSES: readonly WeightClass[] = ['light', 'medium', 'heavy'];
const CONFIDENCES: readonly DetectionConfidence[] = ['high', 'low'];

export interface ParsedState {
  move: Move;
  packingPlan: PackingPlan | null;
  /**
   * When this payload was written, ISO-8601, or null for a payload from a build
   * that predates the field. Only ever shown to the user — nothing is decided
   * from it, so an absent or nonsensical value costs a line of text and no more.
   */
  savedAt: string | null;
  /** What had to be dropped or corrected. Empty means the payload was already valid. */
  repairs: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strict finite number. Deliberately does NOT coerce strings: a `cubicFeet` of "10"
 * used to reach `roomCubicFeet`, where `0 + "10" + "20"` concatenates to "01020" and
 * reported 30 ft³ of furniture as 1020 ft³ — a two-bedroom move sized as a 26ft truck.
 */
function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function parseDimensions(value: unknown): Dimensions | null {
  if (!isRecord(value)) return null;
  const lengthIn = finiteNumber(value.lengthIn);
  const widthIn = finiteNumber(value.widthIn);
  const heightIn = finiteNumber(value.heightIn);
  if (lengthIn === null || widthIn === null || heightIn === null) return null;
  if (lengthIn <= 0 || widthIn <= 0 || heightIn <= 0) return null;
  return { lengthIn, widthIn, heightIn, isEstimated: value.isEstimated !== false };
}

function parseItem(value: unknown, roomId: string, repairs: string[]): InventoryItem | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const dimensions = parseDimensions(value.dimensions);
  if (id === null || name === null || dimensions === null) return null;

  // Recomputed rather than trusted: it is the number every downstream volume,
  // truck size and price decision is built on.
  const stored = finiteNumber(value.cubicFeet);
  const cubicFeet = cubicFeetFor(dimensions);
  if (stored === null || Math.abs(stored - cubicFeet) > 0.01) {
    repairs.push(`recomputed cubicFeet for "${name}"`);
  }

  const confidence = oneOf<DetectionConfidence>(value.confidence, CONFIDENCES);
  return {
    id,
    name,
    category: oneOf<ItemCategory>(value.category, CATEGORIES) ?? 'other',
    roomId: nonEmptyString(value.roomId) ?? roomId,
    dimensions,
    cubicFeet,
    confidence,
    // Contract §4.1: a low-confidence item must carry a reason. Without one the
    // Screen 2 banner renders a blank explanation next to a blocked CTA.
    confidenceReason:
      confidence === 'low'
        ? (nonEmptyString(value.confidenceReason) ?? 'Needs a quick check')
        : null,
    isFragile: value.isFragile === true || value.category === 'fragile',
    estimatedWeightClass: oneOf<WeightClass>(value.estimatedWeightClass, WEIGHT_CLASSES) ?? 'medium',
    sourcePhotoId: nonEmptyString(value.sourcePhotoId),
    userEdited: value.userEdited === true,
  };
}

function parseRoom(value: unknown, repairs: string[]): Room | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  if (id === null || name === null) return null;

  const rawItems = Array.isArray(value.items) ? value.items : [];
  if (!Array.isArray(value.items)) repairs.push(`room "${name}" had no item list`);

  const items: InventoryItem[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    const item = parseItem(raw, id, repairs);
    if (item === null) {
      repairs.push(`dropped an unreadable item in "${name}"`);
      continue;
    }
    // Duplicate ids make removeItem/updateItem act on two rows at once.
    if (seen.has(item.id)) {
      repairs.push(`dropped a duplicate item id in "${name}"`);
      continue;
    }
    seen.add(item.id);
    items.push(item);
  }

  return {
    id,
    name,
    photoIds: Array.isArray(value.photoIds)
      ? value.photoIds.filter((p): p is string => typeof p === 'string')
      : [],
    items,
  };
}

function parsePackingPlan(value: unknown, repairs: string[]): PackingPlan | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !Array.isArray(value.loadSteps)) {
    // A plan without loadSteps crashed the dashboard on every launch once persisted.
    repairs.push('dropped an unreadable packing plan');
    return null;
  }
  const loadSteps = value.loadSteps.flatMap((step) => {
    if (!isRecord(step)) return [];
    const order = finiteNumber(step.order);
    const id = nonEmptyString(step.id);
    const title = nonEmptyString(step.title);
    if (order === null || id === null || title === null) return [];
    return [
      {
        id,
        order,
        title,
        instruction: typeof step.instruction === 'string' ? step.instruction : '',
        itemIds: Array.isArray(step.itemIds)
          ? step.itemIds.filter((i): i is string => typeof i === 'string')
          : [],
      },
    ];
  });
  return {
    id: nonEmptyString(value.id) ?? 'plan-recovered',
    moveId: nonEmptyString(value.moveId) ?? '',
    loadSteps,
    truckMapSVG: typeof value.truckMapSVG === 'string' ? value.truckMapSVG : null,
  };
}

/**
 * Parses a raw AsyncStorage payload. Returns null only when there is nothing
 * salvageable at all — the caller must treat that as "quarantine, do not overwrite".
 */
export function parseStoredState(raw: string): ParsedState | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(payload) || !isRecord(payload.move)) return null;

  const repairs: string[] = [];
  const storedMove = payload.move;

  const rawRooms = Array.isArray(storedMove.rooms) ? storedMove.rooms : [];
  if (!Array.isArray(storedMove.rooms)) repairs.push('move had no room list');

  const rooms: Room[] = [];
  const seenRooms = new Set<string>();
  for (const raw of rawRooms) {
    const room = parseRoom(raw, repairs);
    if (room === null) {
      repairs.push('dropped an unreadable room');
      continue;
    }
    if (seenRooms.has(room.id)) {
      repairs.push(`dropped a duplicate room id "${room.name}"`);
      continue;
    }
    seenRooms.add(room.id);
    rooms.push(room);
  }

  const storedBuffer = finiteNumber(storedMove.packingBufferPct);
  if (storedBuffer === null) repairs.push('packing buffer reset to the default');

  const status = oneOf<MoveStatus>(storedMove.status, MOVE_STATUS_ORDER);
  if (status === null) repairs.push('unknown move status reset');

  const move: Move = {
    id: nonEmptyString(storedMove.id) ?? `move-recovered`,
    rooms,
    packingBufferPct: clampBuffer(storedBuffer ?? DEFAULT_PACKING_BUFFER_PCT),
    recommendedTruckSize: oneOf<TruckSize>(storedMove.recommendedTruckSize, TRUCK_SIZES) ?? 'van',
    originZip: typeof storedMove.originZip === 'string' ? storedMove.originZip : '',
    destinationZip: nonEmptyString(storedMove.destinationZip),
    moveDate: nonEmptyString(storedMove.moveDate),
    status: status ?? 'inventory',
  };

  return {
    move,
    packingPlan: parsePackingPlan(payload.packingPlan, repairs),
    savedAt: nonEmptyString(payload.savedAt),
    repairs,
  };
}
