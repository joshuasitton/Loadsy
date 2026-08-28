import { guidanceZoneFor, loadsFirstInZone } from './itemGuidance';
import type { InventoryItem, LoadStep, WeightClass } from './types';

/**
 * The load plan, ordered by WHERE each piece rides — back wall to door.
 *
 * ## The plan is an order of operations, not a filing system
 *
 * People load in the order the plan is printed. That makes the sequence a set of
 * instructions rather than a grouping, and anything that reorders it for tidiness
 * is telling somebody to carry the wrong thing next.
 *
 * The groups used to be categories that happened to be listed in a sensible
 * order, and placement was decided in two places: here, by category and weight,
 * and again in itemGuidance.ts, in prose. Nothing kept them in step. An area rug
 * was told to go "at the very back, under everything else" while being listed in
 * the fourth group of five — so anyone following the plan put the rug on top of
 * their furniture, exactly as printed.
 *
 * Placement is now a property of the item. `guidanceZoneFor` owns it for anything
 * with a named rule, and the category-and-weight heuristic below is the fallback
 * for everything else. A rug is not heavy, is not furniture and is not a box; it
 * goes at the back because that is where a rug goes, and the group it appears in
 * is a position in the truck rather than a kind of object.
 *
 * Spec §3 Screen 5 required weight-class awareness rather than pure category, and
 * that survives in the fallback: a heavy box of books and a light box of linens
 * still do not land together.
 *
 * Spec §4.3 contract: assignment must be deterministic for a given item set — QA
 * snapshot tests and "Save Plan" round-tripping both depend on it. Nothing here
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
    title: 'Against the Back Wall',
    instruction:
      'Everything here goes in first, tight against the wall behind the cab. Heaviest low and centred over the axle — and anything that lies flat, like a rolled rug, goes down before the rest so it is not trapped on top.',
  },
  2: {
    order: 2,
    title: 'Along the Side Walls',
    instruction:
      'Stand sofas, mattresses and table tops on edge against the walls, working forward from what is already loaded. Strap them to the tie rails so nothing shifts on the first turn.',
  },
  3: {
    order: 3,
    title: 'Boxes and Fill',
    instruction:
      'Build a square wall of boxes from the floor up, heaviest on the bottom, lightest on top. Fill the gaps around what is already in so the stack cannot lean.',
  },
  4: {
    order: 4,
    title: 'Fragile and Awkward',
    instruction:
      'Mirrors, lamps, TVs and anything oddly shaped ride here, wedged between soft items near the front of the load. Never stack anything on top of these.',
  },
  5: {
    order: 5,
    title: 'Last On, First Off',
    instruction:
      'By the door: the box you want first at the new place, plus anything that must come off early — tools, chargers, bedding, coffee, and fuel-powered kit that should not sit sealed in the middle of the load.',
  },
};

/**
 * Where an item rides.
 *
 * A named guidance rule wins outright, because that rule is also what tells the
 * user where the piece goes — asking anything else here is how the plan came to
 * contradict its own instructions.
 *
 * Everything else falls through to weight class refined by category, which is
 * what spec §3 Screen 5 asks for. Order of checks matters and is fixed.
 */
export function stepForItem(item: InventoryItem): LoadStepOrder {
  const guided = guidanceZoneFor(item.name);
  if (guided !== null) return guided;

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
 * Deterministic given the same item set: nothing reads a clock, a random source,
 * or the order the items arrived in.
 *
 * Within a zone: anything that lies flat on the deck first, then biggest to
 * smallest. Same reasoning as the zones themselves — the list is an order of
 * operations. The large pieces go against the wall before the small ones fill in
 * around them, and a rug goes under all of it. Sorting by id, as this did, put
 * items in whatever order their ids happened to fall, which for a capture is the
 * order the detector emitted them.
 *
 * The id is the tiebreak, so two items of identical volume still sort stably.
 */
export function buildLoadSteps(items: InventoryItem[]): LoadStep[] {
  const buckets = new Map<LoadStepOrder, InventoryItem[]>();
  for (const order of LOAD_STEP_ORDER) buckets.set(order, []);

  for (const item of items) {
    buckets.get(stepForItem(item))!.push(item);
  }

  return LOAD_STEP_ORDER.map((order) => {
    const def = STEP_DEFINITIONS[order];
    const inZone = [...buckets.get(order)!].sort(
      (a, b) =>
        // Anything that lies flat on the deck goes down before the rest of its
        // zone is stacked on top of it.
        Number(loadsFirstInZone(b.name)) - Number(loadsFirstInZone(a.name)) ||
        b.cubicFeet - a.cubicFeet ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return {
      id: `step-${order}`,
      order: def.order,
      title: def.title,
      instruction: def.instruction,
      itemIds: inZone.map((item) => item.id),
    };
  }).filter((step) => step.itemIds.length > 0);
}
