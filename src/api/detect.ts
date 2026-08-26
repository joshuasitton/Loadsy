import type { InventoryItem } from '../domain/types';
import { assessDimensions } from '../domain/plausibility';
import { cubicFeetFor } from '../domain/volume';
import { finiteNumber, isRecord, nonEmptyString, oneOf } from '../lib/guards';
import { ApiError, apiFetch, mockDelay, USE_MOCKS } from './client';
import { mockDetect } from './mocks/detect';

/** Spec §4.1 — Vision/Detection Agent. */
export interface CapturedPhoto {
  photoId: string;
  /** base64 JPEG, already resized by prepareUpload. */
  imageData: string;
}

export interface DetectRequest {
  roomId: string;
  roomName: string;
  /**
   * Every photo of ONE room, sent together in a single call.
   *
   * Not one request per photo. Two shots of the same living room both contain the
   * same sofa, and deciding whether that is one sofa from two angles or two
   * matching sofas needs both images in view at once — no rule applied afterwards
   * can tell those apart, and guessing wrong either doubles the sofa or loses one.
   * So deduplication has to happen where the pixels are.
   */
  photos: CapturedPhoto[];
}

interface DetectResponseItem {
  name: string;
  category: InventoryItem['category'];
  dimensions: InventoryItem['dimensions'];
  cubicFeet: number;
  confidence: 'high' | 'low';
  confidenceReason?: string | null;
  isFragile?: boolean;
  estimatedWeightClass?: InventoryItem['estimatedWeightClass'];
}

export interface DetectResponse {
  items: DetectResponseItem[];
}

/**
 * Contract §4.1 is enforced on the way in, not assumed: a low-confidence item
 * arriving without a reason is a contract violation, and we surface a placeholder
 * rather than letting it render as a blank explanation to the user.
 */
export async function detectItems(request: DetectRequest): Promise<InventoryItem[]> {
  if (request.photos.length === 0) return [];

  if (USE_MOCKS) {
    // Deliberately keyed on the room, not the photo count: the mock stands in for
    // an endpoint that deduplicates, so three angles of one room must return that
    // room's contents ONCE. A mock that returned three copies would make the
    // duplication bug invisible in development, which is where it must be visible.
    return mockDelay(mockDetect(request.roomId, request.roomName, captureId(request)));
  }

  const response = await apiFetch<DetectResponse>('/v1/detect', {
    method: 'POST',
    body: JSON.stringify({
      roomId: request.roomId,
      roomName: request.roomName,
      photos: request.photos,
    }),
  });

  if (!Array.isArray(response.items)) {
    throw new ApiError('/v1/detect returned no item list', 502);
  }

  return response.items.flatMap((item, index) =>
    parseDetectedItem(item, index, request),
  );
}

/**
 * A stable id for one capture session, derived from its first photo.
 *
 * Item ids are built from this, so a later capture of the same room produces a
 * different prefix and cannot collide with items already in the inventory.
 */
function captureId(request: DetectRequest): string {
  return request.photos[0]?.photoId ?? request.roomId;
}

const CATEGORIES: readonly InventoryItem['category'][] = [
  'furniture',
  'box',
  'appliance',
  'fragile',
  'other',
];
const WEIGHT_CLASSES: readonly InventoryItem['estimatedWeightClass'][] = [
  'light',
  'medium',
  'heavy',
];

/**
 * Validates one detected item. Returns [] for anything unusable, so a single bad
 * row costs that item rather than the whole capture.
 *
 * Everything here was previously copied straight through from the response body.
 * Two of those fields are load-bearing well beyond this module:
 *
 * - `cubicFeet` is what every volume, truck size and price is derived from. Absent,
 *   it made the sums NaN, and recommendTruckSize falls through every comparison to
 *   return '26ft' — the largest, priciest truck, for a single sofa, with "NaN ft³"
 *   rendered on screen and no error anywhere.
 * - `confidence` drives the Screen 2 gate, which is a hard spec requirement. The
 *   gate counts items whose confidence is exactly 'low'; a detector answering
 *   'medium' made every item pass silently, so an inventory the model was unsure
 *   about sailed through with no banner and no review prompt.
 */
function parseDetectedItem(
  item: unknown,
  index: number,
  request: DetectRequest,
): InventoryItem[] {
  if (!isRecord(item)) return [];

  const name = nonEmptyString(item.name);
  const dimensions = parseDimensions(item.dimensions);
  if (name === null || dimensions === null) return [];

  // Recomputed from dimensions rather than trusted, so the two can never disagree.
  const cubicFeet = cubicFeetFor(dimensions);
  if (!Number.isFinite(cubicFeet) || cubicFeet <= 0) return [];

  const stated = oneOf(item.confidence, ['high', 'low'] as const);
  if (stated === null) return [];

  // A detector's own confidence is about whether it RECOGNISED the object, which
  // says nothing about whether the size it returned is physically possible. A
  // mis-scaled sofa is reported with complete certainty. Downgrading here routes
  // it into the Screen 2 review the app already blocks on, rather than letting it
  // silently add a truck's worth of volume.
  const plausibility = assessDimensions(name, dimensions);
  const confidence = plausibility.plausible ? stated : 'low';

  const category = oneOf(item.category, CATEGORIES) ?? 'other';
  return [
    {
      id: `${captureId(request)}-item-${index}`,
      name,
      category,
      roomId: request.roomId,
      dimensions,
      cubicFeet,
      confidence,
      // The plausibility reason wins when it fired: "unusually large for a sofa"
      // tells the reviewer what to look at, where the detector's own reason would
      // not mention size at all.
      confidenceReason:
        confidence === 'low'
          ? (plausibility.reason ??
            nonEmptyString(item.confidenceReason) ??
            'Needs a quick check — the detector was unsure about this one')
          : null,
      isFragile: item.isFragile === true || category === 'fragile',
      estimatedWeightClass: oneOf(item.estimatedWeightClass, WEIGHT_CLASSES) ?? 'medium',
      sourcePhotoId: captureId(request),
      userEdited: false,
    },
  ];
}

function parseDimensions(value: unknown): InventoryItem['dimensions'] | null {
  if (!isRecord(value)) return null;
  const lengthIn = finiteNumber(value.lengthIn);
  const widthIn = finiteNumber(value.widthIn);
  const heightIn = finiteNumber(value.heightIn);
  if (lengthIn === null || widthIn === null || heightIn === null) return null;
  if (lengthIn <= 0 || widthIn <= 0 || heightIn <= 0) return null;
  return { lengthIn, widthIn, heightIn, isEstimated: value.isEstimated !== false };
}
