import type { InventoryItem, ItemCategory, Move, RentalQuote, Room, WeightClass } from '../src/domain/types';
import { normaliseAddress } from '../src/domain/address';

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${String(++seq).padStart(3, '0')}`;

export function resetIds() {
  seq = 0;
}

export function makeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  const id = overrides.id ?? nextId('item');
  return {
    id,
    name: 'Sofa',
    category: 'furniture' as ItemCategory,
    roomId: 'room-001',
    dimensions: { lengthIn: 84, widthIn: 36, heightIn: 34, isEstimated: true },
    cubicFeet: 59.5,
    confidence: 'high',
    confidenceReason: null,
    isFragile: false,
    estimatedWeightClass: 'heavy' as WeightClass,
    sourcePhotoId: 'photo-001',
    userEdited: false,
    ...overrides,
  };
}

export function makeRoom(items: InventoryItem[], overrides: Partial<Room> = {}): Room {
  return {
    id: overrides.id ?? nextId('room'),
    name: 'Living Room',
    photoIds: ['photo-001'],
    items,
    ...overrides,
  };
}

export function makeMove(rooms: Room[], overrides: Partial<Move> = {}): Move {
  return {
    id: overrides.id ?? nextId('move'),
    rooms,
    packingBufferPct: 0.2,
    recommendedTruckSize: '15ft',
    originAddress: normaliseAddress({ city: 'Ashburn', state: 'VA', postalCode: '20147' }),
    destinationAddress: null,
    originZip: '20147',
    destinationZip: null,
    tripMiles: null,
    moveDate: null,
    status: 'inventory',
    ...overrides,
  };
}

export function makeQuote(overrides: Partial<RentalQuote> = {}): RentalQuote {
  const base: RentalQuote = {
    id: overrides.id ?? nextId('quote'),
    vendor: 'uhaul',
    truckSize: '20ft',
    baseRate: 39.95,
    estimatedMileageFee: 87.4,
    estimatedFuelFee: 42,
    estimatedInsuranceFee: 28,
    oneWayFee: 0,
    taxesAndFees: 14.31,
    estimatedTotal: 0,
    distanceMiles: 88,
    earliestAvailability: '2026-09-01T09:00:00.000Z',
    deepLinkURL: 'https://www.uhaul.com/Truck-Rentals/',
    lastUpdated: '2026-08-24T00:00:00.000Z',
    isEstimate: true,
    ...overrides,
  };
  if (overrides.estimatedTotal === undefined) {
    base.estimatedTotal =
      Math.round(
        ((base.baseRate ?? 0) +
          (base.estimatedMileageFee ?? 0) +
          (base.estimatedFuelFee ?? 0) +
          (base.estimatedInsuranceFee ?? 0) +
          (base.oneWayFee ?? 0) +
          (base.taxesAndFees ?? 0)) *
          100,
      ) / 100;
  }
  return base;
}
