/**
 * Loadsy domain models.
 * Direct TypeScript translation of the Swift models in the MVP Technical Spec (§2).
 * Computed Swift properties (totalCubicFeet, adjustedVolumeCuFt, capacityCuFt) become
 * pure functions in the modules that own them, so the models stay serialisable.
 */

export type ItemCategory = 'furniture' | 'box' | 'appliance' | 'fragile' | 'other';
export type DetectionConfidence = 'high' | 'low';
export type WeightClass = 'light' | 'medium' | 'heavy';

export interface Dimensions {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** true if not directly measured/confirmed by the user */
  isEstimated: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  roomId: string;
  dimensions: Dimensions;
  cubicFeet: number;
  /**
   * Spec §6 Q3 (resolved): confidence applies only to AI-detected items.
   * Manually added items carry `confidence: null` and are never counted as
   * unresolved by the Screen 2 confidence gate.
   */
  confidence: DetectionConfidence | null;
  /** Human-readable reason, required by contract §4.1 whenever confidence === 'low'. */
  confidenceReason: string | null;
  isFragile: boolean;
  estimatedWeightClass: WeightClass;
  /** null for manually added items, which have no source photo. */
  sourcePhotoId: string | null;
  /** true once the user has confirmed or edited it */
  userEdited: boolean;
}

export interface Room {
  id: string;
  name: string;
  photoIds: string[];
  items: InventoryItem[];
}

export type TruckSize = 'van' | '10ft' | '15ft' | '20ft' | '26ft';

export const TRUCK_SIZES: readonly TruckSize[] = ['van', '10ft', '15ft', '20ft', '26ft'] as const;

export type MoveStatus =
  | 'inventory'
  | 'truckAndPrice'
  | 'packingPlan'
  | 'reservations'
  | 'movingDay';

export const MOVE_STATUS_ORDER: readonly MoveStatus[] = [
  'inventory',
  'truckAndPrice',
  'packingPlan',
  'reservations',
  'movingDay',
] as const;

export interface Move {
  id: string;
  rooms: Room[];
  /** Spec §6 Q1 (resolved): locked at 0.20, mid-range of the 0.15–0.30 band. */
  packingBufferPct: number;
  recommendedTruckSize: TruckSize;
  originZip: string;
  destinationZip: string | null;
  /** ISO-8601 string; Date is not JSON-serialisable across the API boundary. */
  moveDate: string | null;
  status: MoveStatus;
}

export type RentalVendor = 'uhaul' | 'penske' | 'budget' | 'homeDepot' | 'enterprise' | 'local';

export interface RentalQuote {
  id: string;
  vendor: RentalVendor;
  truckSize: TruckSize;
  baseRate: number;
  estimatedMileageFee: number | null;
  estimatedFuelFee: number | null;
  estimatedInsuranceFee: number | null;
  oneWayFee: number | null;
  taxesAndFees: number | null;
  estimatedTotal: number;
  distanceMiles: number;
  earliestAvailability: string;
  deepLinkURL: string;
  lastUpdated: string;
  /** Spec §2.4: always true for MVP — no vendor API confirms price. */
  isEstimate: boolean;
}

export interface LoadStep {
  id: string;
  /** 1–5, back-to-front load sequence */
  order: number;
  title: string;
  instruction: string;
  itemIds: string[];
}

export interface PackingPlan {
  id: string;
  moveId: string;
  loadSteps: LoadStep[];
  truckMapSVG: string | null;
}
