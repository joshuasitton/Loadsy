/**
 * Prepared inventories for demonstrating Loadsy without a camera.
 *
 * A live capture is the better demo when it works, but it depends on a camera, a
 * network, a model call and a room worth photographing. In a meeting one of those
 * is usually missing, and "let me try that again" is not a thing you get to say
 * twice. These scenarios put a complete, realistic move on screen in one tap so
 * the conversation can be about the truck, the price and the load plan.
 *
 * Everything here is ordinary app state. Loading a scenario dispatches the same
 * action hydration does, so every screen downstream — sizing, quotes, packing
 * steps, zone diagrams — is computed from this inventory exactly as it would be
 * from a photographed one. Nothing is stubbed further down.
 *
 * The items are marked `confidence: 'high'` rather than manually-added, because
 * that is what a good capture actually produces, and it keeps the Screen 2 review
 * gate out of the way of a scripted walkthrough. To show the gate itself, capture
 * a real room — the detector flags what it is unsure of.
 */

import type { InventoryItem, ItemCategory, Move, Room, WeightClass } from '../domain/types';
import { cubicFeetFor, DEFAULT_PACKING_BUFFER_PCT } from '../domain/volume';

interface ItemTemplate {
  name: string;
  category: ItemCategory;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weight: WeightClass;
  fragile?: boolean;
  /** Repeat count. Six dining chairs are six objects, not one entry of six. */
  count?: number;
}

interface RoomTemplate {
  name: string;
  /** How many angles the story says were taken. Drives the room's photo count. */
  angles: number;
  items: ItemTemplate[];
}

export interface DemoScenario {
  id: string;
  /** Shown on the button. Short enough to sit in a row of four. */
  label: string;
  /** One line under the label — what this move is, in plain words. */
  blurb: string;
  originZip: string;
  /**
   * Where the move ends. Null on the smaller scenarios so the local case — the
   * one where a one-way fee must NOT be charged — is what most of them show.
   */
  destinationZip: string | null;
  rooms: RoomTemplate[];
}

const SOFA: ItemTemplate = { name: '3-Seat Sofa', category: 'furniture', lengthIn: 84, widthIn: 36, heightIn: 34, weight: 'heavy' };
const QUEEN_MATTRESS: ItemTemplate = { name: 'Queen Mattress', category: 'furniture', lengthIn: 80, widthIn: 60, heightIn: 12, weight: 'medium' };
const QUEEN_FRAME: ItemTemplate = { name: 'Queen Bed Frame', category: 'furniture', lengthIn: 84, widthIn: 64, heightIn: 14, weight: 'heavy' };
const NIGHTSTAND: ItemTemplate = { name: 'Nightstand', category: 'furniture', lengthIn: 22, widthIn: 18, heightIn: 26, weight: 'light' };
const DRESSER: ItemTemplate = { name: 'Dresser', category: 'furniture', lengthIn: 60, widthIn: 20, heightIn: 34, weight: 'heavy' };
const FRIDGE: ItemTemplate = { name: 'Refrigerator', category: 'appliance', lengthIn: 36, widthIn: 32, heightIn: 70, weight: 'heavy' };
const MOVING_BOX: ItemTemplate = { name: 'Moving Box', category: 'box', lengthIn: 18, widthIn: 18, heightIn: 18, weight: 'medium' };

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: 'studio',
    label: 'Studio',
    blurb: 'One room and a kitchenette — the smallest move worth a truck',
    originZip: '78704',
    destinationZip: null,
    rooms: [
      {
        name: 'Main Room',
        angles: 3,
        items: [
          { name: '2-Seat Sofa', category: 'furniture', lengthIn: 60, widthIn: 36, heightIn: 34, weight: 'heavy' },
          { name: 'Coffee Table', category: 'furniture', lengthIn: 40, widthIn: 22, heightIn: 18, weight: 'medium' },
          { name: 'TV (50")', category: 'fragile', lengthIn: 45, widthIn: 4, heightIn: 27, weight: 'light', fragile: true },
          { name: 'TV Stand', category: 'furniture', lengthIn: 48, widthIn: 16, heightIn: 20, weight: 'medium' },
          QUEEN_MATTRESS,
          { name: 'Bed Frame', category: 'furniture', lengthIn: 84, widthIn: 64, heightIn: 14, weight: 'heavy' },
          NIGHTSTAND,
          { name: 'Floor Lamp', category: 'fragile', lengthIn: 14, widthIn: 14, heightIn: 60, weight: 'light', fragile: true },
          { name: 'Desk', category: 'furniture', lengthIn: 48, widthIn: 24, heightIn: 30, weight: 'medium' },
          { name: 'Desk Chair', category: 'furniture', lengthIn: 24, widthIn: 24, heightIn: 38, weight: 'light' },
        ],
      },
      {
        name: 'Kitchen',
        angles: 2,
        items: [
          { name: 'Bistro Table', category: 'furniture', lengthIn: 36, widthIn: 30, heightIn: 30, weight: 'medium' },
          { name: 'Dining Chair', category: 'furniture', lengthIn: 18, widthIn: 20, heightIn: 36, weight: 'light', count: 2 },
          { ...MOVING_BOX, name: 'Kitchen Box', weight: 'heavy', count: 4 },
        ],
      },
      {
        name: 'Closet',
        angles: 1,
        items: [
          { name: 'Wardrobe Box', category: 'box', lengthIn: 24, widthIn: 24, heightIn: 40, weight: 'medium', count: 2 },
        ],
      },
    ],
  },
  {
    id: 'one-bed',
    label: '1-Bedroom',
    blurb: 'The most common apartment move in the country',
    originZip: '78704',
    destinationZip: null,
    rooms: [
      {
        name: 'Living Room',
        angles: 3,
        items: [
          SOFA,
          { name: 'Armchair', category: 'furniture', lengthIn: 36, widthIn: 34, heightIn: 34, weight: 'medium' },
          { name: 'Coffee Table', category: 'furniture', lengthIn: 48, widthIn: 24, heightIn: 18, weight: 'medium' },
          { name: 'TV (55")', category: 'fragile', lengthIn: 49, widthIn: 4, heightIn: 29, weight: 'light', fragile: true },
          { name: 'Media Console', category: 'furniture', lengthIn: 58, widthIn: 16, heightIn: 24, weight: 'heavy' },
          { name: 'Bookshelf', category: 'furniture', lengthIn: 32, widthIn: 12, heightIn: 72, weight: 'heavy' },
          { name: 'Floor Lamp', category: 'fragile', lengthIn: 14, widthIn: 14, heightIn: 60, weight: 'light', fragile: true },
          { name: 'Area Rug', category: 'other', lengthIn: 96, widthIn: 12, heightIn: 12, weight: 'medium' },
        ],
      },
      {
        name: 'Bedroom',
        angles: 3,
        items: [
          QUEEN_MATTRESS,
          QUEEN_FRAME,
          DRESSER,
          NIGHTSTAND,
          { ...NIGHTSTAND, name: 'Nightstand (pair)' },
          { name: 'Wardrobe Box', category: 'box', lengthIn: 24, widthIn: 24, heightIn: 40, weight: 'medium', count: 3 },
        ],
      },
      {
        name: 'Kitchen',
        angles: 2,
        items: [
          FRIDGE,
          { name: 'Dining Table', category: 'furniture', lengthIn: 60, widthIn: 36, heightIn: 30, weight: 'heavy' },
          { name: 'Dining Chair', category: 'furniture', lengthIn: 18, widthIn: 20, heightIn: 36, weight: 'light', count: 4 },
          { ...MOVING_BOX, name: 'Kitchen Box', weight: 'heavy', count: 8 },
        ],
      },
      {
        name: 'Closet',
        angles: 1,
        items: [
          { ...MOVING_BOX, name: 'Storage Box', count: 6 },
          { name: 'Vacuum Cleaner', category: 'appliance', lengthIn: 14, widthIn: 12, heightIn: 44, weight: 'light' },
        ],
      },
    ],
  },
  {
    id: 'two-bed',
    label: '2-Bedroom',
    blurb: 'Two bedrooms, a desk in the spare room, and no garage photographed',
    originZip: '78704',
    destinationZip: '78745',
    rooms: [
      {
        name: 'Living Room',
        angles: 3,
        items: [
          { name: 'Sectional Sofa', category: 'furniture', lengthIn: 108, widthIn: 38, heightIn: 34, weight: 'heavy' },
          { name: 'Armchair', category: 'furniture', lengthIn: 36, widthIn: 34, heightIn: 34, weight: 'medium' },
          { name: 'Coffee Table', category: 'furniture', lengthIn: 48, widthIn: 24, heightIn: 18, weight: 'medium' },
          { name: 'TV (65")', category: 'fragile', lengthIn: 57, widthIn: 4, heightIn: 33, weight: 'light', fragile: true },
          { name: 'Media Console', category: 'furniture', lengthIn: 58, widthIn: 16, heightIn: 24, weight: 'heavy' },
          { name: 'Bookshelf', category: 'furniture', lengthIn: 32, widthIn: 12, heightIn: 72, weight: 'heavy', count: 2 },
          { name: 'Area Rug', category: 'other', lengthIn: 108, widthIn: 12, heightIn: 12, weight: 'medium' },
          { name: 'Floor Lamp', category: 'fragile', lengthIn: 14, widthIn: 14, heightIn: 60, weight: 'light', fragile: true },
        ],
      },
      {
        name: 'Primary Bedroom',
        angles: 3,
        items: [
          { name: 'King Mattress', category: 'furniture', lengthIn: 80, widthIn: 76, heightIn: 12, weight: 'heavy' },
          { name: 'King Bed Frame', category: 'furniture', lengthIn: 84, widthIn: 80, heightIn: 14, weight: 'heavy' },
          DRESSER,
          NIGHTSTAND,
          { ...NIGHTSTAND, name: 'Nightstand (pair)' },
          { name: 'Wardrobe Box', category: 'box', lengthIn: 24, widthIn: 24, heightIn: 40, weight: 'medium', count: 4 },
        ],
      },
      {
        name: 'Second Bedroom',
        angles: 2,
        items: [
          { name: 'Full Mattress', category: 'furniture', lengthIn: 75, widthIn: 54, heightIn: 12, weight: 'medium' },
          { name: 'Bed Frame', category: 'furniture', lengthIn: 79, widthIn: 58, heightIn: 14, weight: 'heavy' },
          { name: 'Chest of Drawers', category: 'furniture', lengthIn: 34, widthIn: 18, heightIn: 48, weight: 'heavy' },
          { name: 'Desk', category: 'furniture', lengthIn: 48, widthIn: 24, heightIn: 30, weight: 'medium' },
          { name: 'Desk Chair', category: 'furniture', lengthIn: 24, widthIn: 24, heightIn: 38, weight: 'light' },
        ],
      },
      {
        name: 'Kitchen',
        angles: 2,
        items: [
          FRIDGE,
          { name: 'Dining Table', category: 'furniture', lengthIn: 72, widthIn: 40, heightIn: 30, weight: 'heavy' },
          { name: 'Dining Chair', category: 'furniture', lengthIn: 18, widthIn: 20, heightIn: 36, weight: 'light', count: 6 },
          { ...MOVING_BOX, name: 'Kitchen Box', weight: 'heavy', count: 10 },
        ],
      },
      // No garage, deliberately. This is the scenario that demonstrates the
      // coverage prompt: a two-bedroom home almost always has storage somewhere,
      // and Loadsy asks about it rather than quietly sizing a truck without it.
    ],
  },
  {
    id: 'three-bed-house',
    label: '3-Bed House',
    blurb: 'A full house — the move where getting the truck wrong really hurts',
    originZip: '78704',
    destinationZip: '75201',
    rooms: [
      {
        name: 'Living Room',
        angles: 3,
        items: [
          { name: 'Sectional Sofa', category: 'furniture', lengthIn: 120, widthIn: 40, heightIn: 34, weight: 'heavy' },
          { name: 'Armchair', category: 'furniture', lengthIn: 36, widthIn: 34, heightIn: 34, weight: 'medium' },
          { name: 'Coffee Table', category: 'furniture', lengthIn: 52, widthIn: 28, heightIn: 18, weight: 'medium' },
          { name: 'TV (75")', category: 'fragile', lengthIn: 66, widthIn: 4, heightIn: 38, weight: 'medium', fragile: true },
          { name: 'Media Console', category: 'furniture', lengthIn: 64, widthIn: 18, heightIn: 24, weight: 'heavy' },
          { name: 'Bookshelf', category: 'furniture', lengthIn: 32, widthIn: 12, heightIn: 72, weight: 'heavy', count: 2 },
          { name: 'Area Rug', category: 'other', lengthIn: 120, widthIn: 12, heightIn: 12, weight: 'medium' },
          { name: 'Piano (Upright)', category: 'other', lengthIn: 58, widthIn: 25, heightIn: 50, weight: 'heavy' },
        ],
      },
      {
        name: 'Primary Bedroom',
        angles: 3,
        items: [
          { name: 'King Mattress', category: 'furniture', lengthIn: 80, widthIn: 76, heightIn: 12, weight: 'heavy' },
          { name: 'King Bed Frame', category: 'furniture', lengthIn: 84, widthIn: 80, heightIn: 14, weight: 'heavy' },
          { name: 'Armoire', category: 'furniture', lengthIn: 48, widthIn: 24, heightIn: 72, weight: 'heavy' },
          DRESSER,
          NIGHTSTAND,
          { ...NIGHTSTAND, name: 'Nightstand (pair)' },
          { name: 'Wardrobe Box', category: 'box', lengthIn: 24, widthIn: 24, heightIn: 40, weight: 'medium', count: 4 },
        ],
      },
      {
        name: 'Second Bedroom',
        angles: 2,
        items: [
          { name: 'Full Mattress', category: 'furniture', lengthIn: 75, widthIn: 54, heightIn: 12, weight: 'medium' },
          { name: 'Bed Frame', category: 'furniture', lengthIn: 79, widthIn: 58, heightIn: 14, weight: 'heavy' },
          { name: 'Chest of Drawers', category: 'furniture', lengthIn: 34, widthIn: 18, heightIn: 48, weight: 'heavy' },
          { name: 'Wardrobe Box', category: 'box', lengthIn: 24, widthIn: 24, heightIn: 40, weight: 'medium', count: 2 },
        ],
      },
      {
        name: 'Third Bedroom',
        angles: 2,
        items: [
          { name: 'Twin Mattress', category: 'furniture', lengthIn: 75, widthIn: 39, heightIn: 10, weight: 'light' },
          { name: 'Bed Frame', category: 'furniture', lengthIn: 79, widthIn: 43, heightIn: 14, weight: 'medium' },
          { name: 'Desk', category: 'furniture', lengthIn: 48, widthIn: 24, heightIn: 30, weight: 'medium' },
          { name: 'Desk Chair', category: 'furniture', lengthIn: 24, widthIn: 24, heightIn: 38, weight: 'light' },
          { name: 'Bookshelf', category: 'furniture', lengthIn: 30, widthIn: 12, heightIn: 48, weight: 'medium' },
        ],
      },
      {
        name: 'Kitchen',
        angles: 2,
        items: [
          FRIDGE,
          { name: 'Dining Table', category: 'furniture', lengthIn: 72, widthIn: 40, heightIn: 30, weight: 'heavy' },
          { name: 'Dining Chair', category: 'furniture', lengthIn: 18, widthIn: 20, heightIn: 36, weight: 'light', count: 6 },
          { name: 'Sideboard', category: 'furniture', lengthIn: 60, widthIn: 18, heightIn: 34, weight: 'heavy' },
          { ...MOVING_BOX, name: 'Kitchen Box', weight: 'heavy', count: 10 },
        ],
      },
      {
        name: 'Garage',
        angles: 2,
        items: [
          { name: 'Bicycle', category: 'other', lengthIn: 68, widthIn: 24, heightIn: 42, weight: 'medium', count: 2 },
          { name: 'Workbench', category: 'furniture', lengthIn: 72, widthIn: 30, heightIn: 36, weight: 'heavy' },
          { name: 'Lawn Mower', category: 'appliance', lengthIn: 66, widthIn: 22, heightIn: 40, weight: 'heavy' },
          { name: 'Storage Tote', category: 'box', lengthIn: 27, widthIn: 17, heightIn: 15, weight: 'medium', count: 6 },
          { name: 'Extension Ladder', category: 'other', lengthIn: 96, widthIn: 18, heightIn: 6, weight: 'medium' },
        ],
      },
    ],
  },
] as const;

export function findScenario(id: string): DemoScenario | null {
  return DEMO_SCENARIOS.find((s) => s.id === id) ?? null;
}

/**
 * Builds the Move a scenario describes.
 *
 * Every id is derived from the scenario and the item's position, never from a
 * clock or a random source. Two things depend on that: loading the same scenario
 * twice must produce identical state rather than a second move that merely looks
 * the same, and the tests must be able to assert on ids.
 */
export function buildDemoMove(scenario: DemoScenario): Move {
  const rooms: Room[] = scenario.rooms.map((template, roomIndex) => {
    const roomId = `demo-${scenario.id}-room-${roomIndex}`;
    return {
      id: roomId,
      name: template.name,
      photoIds: Array.from({ length: template.angles }, (_, i) => `${roomId}-photo-${i}`),
      items: expandItems(template.items).map((item, itemIndex) =>
        buildItem(item, roomId, itemIndex),
      ),
    };
  });

  return {
    id: `move-demo-${scenario.id}`,
    rooms,
    packingBufferPct: DEFAULT_PACKING_BUFFER_PCT,
    // Overwritten by the store's withRecommendation on load. Never trusted from here.
    recommendedTruckSize: 'van',
    originZip: scenario.originZip,
    destinationZip: scenario.destinationZip,
    tripMiles: null,
    moveDate: null,
    // Deliberately the first step. A scenario supplies the inventory and stops —
    // walking forward through sizing and the load plan is the demo, and starting
    // three steps in skips the part worth showing.
    status: 'inventory',
  };
}

/** `count: 6` becomes six separate objects, because that is what they are. */
function expandItems(templates: ItemTemplate[]): ItemTemplate[] {
  return templates.flatMap((template) =>
    Array.from({ length: template.count ?? 1 }, () => template),
  );
}

function buildItem(template: ItemTemplate, roomId: string, index: number): InventoryItem {
  const dimensions = {
    lengthIn: template.lengthIn,
    widthIn: template.widthIn,
    heightIn: template.heightIn,
    isEstimated: true,
  };
  return {
    id: `${roomId}-item-${index}`,
    name: template.name,
    category: template.category,
    roomId,
    dimensions,
    cubicFeet: cubicFeetFor(dimensions),
    confidence: 'high',
    confidenceReason: null,
    isFragile: template.fragile ?? template.category === 'fragile',
    estimatedWeightClass: template.weight,
    sourcePhotoId: `${roomId}-photo-0`,
    userEdited: false,
  };
}
