import type { InventoryItem, LoadStep, WeightClass } from './types';

/**
 * Spec §3 Screen 5: step assignment is WEIGHT-CLASS aware, not category-driven.
 * A heavy box of books and a light box of linens are the same `category` but must
 * not land in the same load step.
 *
 * Spec §4.3 contract: assignment must be deterministic for a given item set —
 * QA snapshot tests and "Save Plan" round-tripping both depend on it. Nothing here
 * reads the clock, a random source, or input array order.
 */

export const LOAD_STEP_ORDER = [1, 2, 3, 4, 5] as const;
export type LoadStepOrder = (typeof LOAD_STEP_ORDER)[number];

interface StepDefinition {
  order: LoadStepOrder;
  title: string;
  instruction: string;
}

const STEP_DEFINITIONS: Record<LoadStepOrder, StepDefinition> = {
  1: {
    order: 1,
    title: 'Heavy Items',
    instruction:
      'Load your heaviest pieces first, against the wall behind the cab. Keep the weight low and centred over the axle — appliances and solid-wood furniture go here.',
  },
  2: {
    order: 2,
    title: 'Large Furniture',
    instruction:
      'Stand sofas, mattresses and table tops on edge along the walls. Strap them to the tie rails so nothing shifts on the first turn.',
  },
  3: {
    order: 3,
    title: 'Boxes',
    instruction:
      'Build a square wall of boxes from the floor up, heaviest on the bottom, lightest on top. Fill gaps so the stack cannot lean.',
  },
  4: {
    order: 4,
    title: 'Fragile & Awkward',
    instruction:
      'Mirrors, lamps, TVs and anything oddly shaped ride here, wedged between soft items. Never stack anything on top of these.',
  },
  5: {
    order: 5,
    title: 'Essentials Last',
    instruction:
      'Load the box you want first at the new place last, by the door: tools, chargers, bedding, coffee, toilet paper.',
  },
};

/**
 * Weight class is the primary signal; category only refines it.
 * Order of checks matters and is fixed.
 */
export function stepForItem(item: InventoryItem): LoadStepOrder {
  // Fragile always overrides — a heavy mirror still must not be buried.
  if (item.isFragile || item.category === 'fragile') return 4;

  if (item.category === 'appliance') return 1;

  if (item.category === 'box') {
    // The distinction the spec calls out: books vs. linens.
    if (item.estimatedWeightClass === 'heavy') return 3;
    if (item.estimatedWeightClass === 'light') return 5;
    return 3;
  }

  if (item.category === 'furniture') {
    return item.estimatedWeightClass === 'heavy' ? 1 : 2;
  }

  // 'other' falls back to pure weight class.
  return weightOnlyStep(item.estimatedWeightClass);
}

function weightOnlyStep(weight: WeightClass): LoadStepOrder {
  switch (weight) {
    case 'heavy':
      return 1;
    case 'medium':
      return 3;
    case 'light':
      return 5;
  }
}

/**
 * Deterministic given the same item set. Items within a step are sorted by id so
 * input ordering cannot change the output.
 */
export function buildLoadSteps(items: InventoryItem[]): LoadStep[] {
  const buckets = new Map<LoadStepOrder, string[]>();
  for (const order of LOAD_STEP_ORDER) buckets.set(order, []);

  for (const item of items) {
    buckets.get(stepForItem(item))!.push(item.id);
  }

  return LOAD_STEP_ORDER.map((order) => {
    const def = STEP_DEFINITIONS[order];
    return {
      id: `step-${order}`,
      order: def.order,
      title: def.title,
      instruction: def.instruction,
      itemIds: [...buckets.get(order)!].sort(),
    };
  }).filter((step) => step.itemIds.length > 0);
}
