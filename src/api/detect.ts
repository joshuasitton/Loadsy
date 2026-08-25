import type { InventoryItem } from '../domain/types';
import { cubicFeetFor } from '../domain/volume';
import { finiteNumber, isRecord, nonEmptyString, oneOf } from '../lib/guards';
import { ApiError, apiFetch, mockDelay, USE_MOCKS } from './client';
import { mockDetect } from './mocks/detect';

/** Spec §4.1 — Vision/Detection Agent. */
export interface DetectRequest {
  photoId: string;
  roomId: string;
  roomName: string;
  imageData: string;
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
  if (USE_MOCKS) {
    return mockDelay(mockDetect(request.roomId, request.roomName, request.photoId));
  }

  const response = await apiFetch<DetectResponse>('/v1/detect', {
    method: 'POST',
    body: JSON.stringify({
      photoId: request.photoId,
      roomId: request.roomId,
      imageData: request.imageData,
    }),
  });

  if (!Array.isArray(response.items)) {
    throw new ApiError('/v1/detect returned no item list', 502);
  }

  return response.items.flatMap((item, index) =>
    parseDetectedItem(item, index, request),
  );
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

  const confidence = oneOf(item.confidence, ['high', 'low'] as const);
  if (confidence === null) return [];

  const category = oneOf(item.category, CATEGORIES) ?? 'other';
  return [
    {
      id: `${request.photoId}-item-${index}`,
      name,
      category,
      roomId: request.roomId,
      dimensions,
      cubicFeet,
      confidence,
      confidenceReason:
        confidence === 'low'
          ? (nonEmptyString(item.confidenceReason) ??
            'Needs a quick check — the detector was unsure about this one')
          : null,
      isFragile: item.isFragile === true || category === 'fragile',
      estimatedWeightClass: oneOf(item.estimatedWeightClass, WEIGHT_CLASSES) ?? 'medium',
      sourcePhotoId: request.photoId,
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
