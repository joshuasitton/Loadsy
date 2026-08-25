import type { InventoryItem } from '../domain/types';
import { apiFetch, mockDelay, USE_MOCKS } from './client';
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

  return response.items.map((item, index) => ({
    id: `${request.photoId}-item-${index}`,
    name: item.name,
    category: item.category,
    roomId: request.roomId,
    dimensions: item.dimensions,
    cubicFeet: item.cubicFeet,
    confidence: item.confidence,
    confidenceReason:
      item.confidence === 'low'
        ? (item.confidenceReason ?? 'Needs a quick check — the detector was unsure about this one')
        : null,
    isFragile: item.isFragile ?? item.category === 'fragile',
    estimatedWeightClass: item.estimatedWeightClass ?? 'medium',
    sourcePhotoId: request.photoId,
    userEdited: false,
  }));
}
