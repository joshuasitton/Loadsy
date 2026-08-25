import type { InventoryItem, ItemCategory, WeightClass } from '../../domain/types';
import { cubicFeetFor } from '../../domain/volume';

/**
 * Deterministic stand-in for the Vision/Detection Agent (spec §4.1).
 *
 * Contract §4.1: every item carries a confidence value, and every low-confidence
 * item carries a human-readable reason. There are no silent high-confidence
 * defaults here — the mock is shaped to make the Screen 2 gate reachable in dev.
 */

interface DetectionTemplate {
  name: string;
  category: ItemCategory;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weight: WeightClass;
  fragile?: boolean;
  lowConfidenceReason?: string;
}

const CATALOG: Record<string, DetectionTemplate[]> = {
  'living room': [
    { name: '3-Seat Sofa', category: 'furniture', lengthIn: 84, widthIn: 36, heightIn: 34, weight: 'heavy' },
    { name: 'Coffee Table', category: 'furniture', lengthIn: 48, widthIn: 24, heightIn: 18, weight: 'medium' },
    { name: 'TV (55")', category: 'fragile', lengthIn: 49, widthIn: 4, heightIn: 29, weight: 'light', fragile: true },
    { name: 'Bookshelf', category: 'furniture', lengthIn: 32, widthIn: 12, heightIn: 72, weight: 'heavy', lowConfidenceReason: 'Partly hidden in photo' },
    { name: 'Floor Lamp', category: 'fragile', lengthIn: 14, widthIn: 14, heightIn: 60, weight: 'light', fragile: true },
  ],
  bedroom: [
    { name: 'Queen Mattress', category: 'furniture', lengthIn: 80, widthIn: 60, heightIn: 12, weight: 'medium' },
    { name: 'Bed Frame', category: 'furniture', lengthIn: 84, widthIn: 64, heightIn: 14, weight: 'heavy' },
    { name: 'Dresser', category: 'furniture', lengthIn: 60, widthIn: 20, heightIn: 34, weight: 'heavy' },
    { name: 'Nightstand', category: 'furniture', lengthIn: 22, widthIn: 18, heightIn: 26, weight: 'light', lowConfidenceReason: 'Cut off at the edge of the frame' },
  ],
  kitchen: [
    { name: 'Refrigerator', category: 'appliance', lengthIn: 36, widthIn: 32, heightIn: 70, weight: 'heavy' },
    { name: 'Dining Table', category: 'furniture', lengthIn: 60, widthIn: 36, heightIn: 30, weight: 'heavy' },
    { name: 'Dining Chair', category: 'furniture', lengthIn: 18, widthIn: 20, heightIn: 36, weight: 'light' },
    { name: 'Kitchen Boxes', category: 'box', lengthIn: 18, widthIn: 18, heightIn: 18, weight: 'heavy', lowConfidenceReason: 'Stacked — could be 3 or 5 boxes' },
  ],
  default: [
    { name: 'Storage Boxes', category: 'box', lengthIn: 18, widthIn: 18, heightIn: 18, weight: 'medium' },
    { name: 'Armchair', category: 'furniture', lengthIn: 36, widthIn: 34, heightIn: 34, weight: 'medium' },
    { name: 'Side Table', category: 'furniture', lengthIn: 22, widthIn: 22, heightIn: 24, weight: 'light', lowConfidenceReason: 'Partly hidden in photo' },
  ],
};

export function mockDetect(roomId: string, roomName: string, photoId: string): InventoryItem[] {
  const key = roomName.trim().toLowerCase();
  const templates =
    CATALOG[key] ?? CATALOG[Object.keys(CATALOG).find((k) => key.includes(k)) ?? 'default'] ?? CATALOG.default!;

  return templates.map((template, index) => {
    const dimensions = {
      lengthIn: template.lengthIn,
      widthIn: template.widthIn,
      heightIn: template.heightIn,
      isEstimated: true,
    };
    const isLow = Boolean(template.lowConfidenceReason);
    return {
      id: `${photoId}-item-${index}`,
      name: template.name,
      category: template.category,
      roomId,
      dimensions,
      cubicFeet: cubicFeetFor(dimensions),
      confidence: isLow ? 'low' : 'high',
      confidenceReason: template.lowConfidenceReason ?? null,
      isFragile: template.fragile ?? template.category === 'fragile',
      estimatedWeightClass: template.weight,
      sourcePhotoId: photoId,
      userEdited: false,
    } satisfies InventoryItem;
  });
}
