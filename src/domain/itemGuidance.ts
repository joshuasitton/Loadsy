/**
 * Per-item loading guidance: how a piece travels, what to do to it first, and what
 * will damage it — or the truck — if you get it wrong.
 *
 * The load steps say WHERE a group goes. They cannot say that a refrigerator must
 * stay upright or its compressor oil migrates into the cooling lines, that a washer
 * without transit bolts destroys its own drum bearings, or that a propane cylinder
 * must not enter an enclosed truck at all. That knowledge is per-item, and it is
 * the difference between a plan and a diagram.
 *
 * Guidance is offered only where it changes what someone does. A plan that annotates
 * every lamp trains people to stop reading it, and then the entry that says "drain
 * the fuel" gets skipped too.
 */

import type { InventoryItem } from './types';

export interface ItemGuidance {
  /** How the piece sits in the truck. */
  readonly orientation: string;
  /** What to do before it goes on, or null when it just gets carried. */
  readonly prep: string | null;
  /**
   * A consequence worth knowing. Reserved for real damage or real hazard — never
   * used for general encouragement, or it stops carrying weight.
   */
  readonly caution: string | null;
}

interface GuidanceRule {
  readonly match: RegExp;
  readonly guidance: ItemGuidance;
}

/**
 * Volume at which a generic item earns guidance on its own.
 *
 * ~15 ft³ is about a two-drawer dresser: the point where a piece has to be planned
 * around rather than simply carried. Smaller items still get guidance if a rule
 * matches them by name, which is how a propane grill and a fuel-powered mower stay
 * annotated regardless of size.
 */
export const LARGE_ITEM_CUBIC_FEET = 15;

/** Ordered most specific first — the first match wins, as in the plausibility table. */
const RULES: readonly GuidanceRule[] = [
  {
    match: /\b(grill|barbecue|bbq)\b/i,
    guidance: {
      orientation: 'Upright, near the door where it can come off first.',
      prep: 'Take the propane cylinder off and transport it yourself, outside the truck.',
      caution: 'Propane must never travel in an enclosed truck — most rental agreements forbid it outright.',
    },
  },
  {
    match: /\b(lawn ?mower|mower|generator|chainsaw|trimmer)\b/i,
    guidance: {
      orientation: 'Upright on the floor, away from anything upholstered.',
      prep: 'Run the fuel tank dry, or drain it, and disconnect the spark plug lead.',
      caution: 'Petrol fumes in a sealed truck are a fire risk, and a leak ruins whatever it soaks into.',
    },
  },
  {
    match: /\b(refrigerator|fridge|freezer)\b/i,
    guidance: {
      orientation: 'Upright against the wall behind the cab, strapped. Never on its back or side.',
      prep: 'Empty and defrost a day ahead, then tape the doors shut and coil the cable inside.',
      caution: 'Laid down, compressor oil runs into the cooling lines. Stand it upright a full day before switching it on.',
    },
  },
  {
    match: /\b(washer|washing machine)\b/i,
    guidance: {
      orientation: 'Upright, against the wall behind the cab, strapped.',
      prep: 'Fit the transit bolts, drain the hoses, and tape the door and cable.',
      caution: 'Without transit bolts the drum swings loose in transit and wrecks its own bearings.',
    },
  },
  {
    match: /\b(dryer|tumble dryer|dishwasher|range|oven|stove|cooker)\b/i,
    guidance: {
      orientation: 'Upright against the wall behind the cab, strapped.',
      prep: 'Tape the door shut and coil the cable or hose inside.',
      caution: null,
    },
  },
  {
    match: /\b(mattress|box spring)\b/i,
    guidance: {
      orientation: 'On its long edge, flat against a side wall, running the length of the truck.',
      prep: 'Bag it — a mattress picks up dirt from the truck wall in minutes.',
      caution: 'Left flat it becomes a shelf, and everything stacked on it presses into the springs.',
    },
  },
  {
    match: /\b(sectional|sofa|couch|loveseat|settee)\b/i,
    guidance: {
      orientation: 'On end, arm down, against a side wall — it takes a third of the floor that way.',
      prep: 'Take the cushions off and pack them separately; unscrew the feet if they come off.',
      caution: null,
    },
  },
  {
    match: /\b(dining table|desk|table)\b/i,
    guidance: {
      orientation: 'Top on edge against a side wall, legs bundled beside it.',
      prep: 'Take the legs off, bag the hardware, and tape the bag underneath the top.',
      caution: 'Loose hardware is the single most common thing to go missing on moving day.',
    },
  },
  {
    match: /\b(bed frame|bedstead|bed base|headboard)\b/i,
    guidance: {
      orientation: 'Rails and boards flat against a side wall, behind the mattresses.',
      prep: 'Break it down, bundle the rails together, and tape the bagged bolts to one of them.',
      caution: null,
    },
  },
  {
    // Ahead of the television rule, which \btv\b would otherwise claim: a TV STAND
    // is a wooden cabinet, and telling its owner the screen might crack is nonsense.
    match: /\b(tv stand|media console|entertainment (unit|centre|center))\b/i,
    guidance: {
      orientation: 'Upright against a wall, strapped.',
      prep: 'Empty it and tape or remove any glass doors and loose shelves.',
      caution: null,
    },
  },
  {
    match: /\b(tv|television)\b/i,
    guidance: {
      orientation: 'Upright on its edge, never flat, wedged between two soft items.',
      prep: 'Use the original box if you kept it, or a TV box with corner blocks.',
      caution: 'Laid flat, the panel flexes over bumps and the screen can crack without a mark on the case.',
    },
  },
  {
    match: /\b(mirror|painting|framed|artwork|glass top)\b/i,
    guidance: {
      orientation: 'On edge in a picture box, slotted between two mattresses.',
      prep: 'Tape a cross over the glass so a crack cannot travel.',
      caution: 'Never lay glass flat — anything set on top of it will break it.',
    },
  },
  {
    match: /\b(piano|organ)\b/i,
    guidance: {
      orientation: 'Against the wall behind the cab, on a board, strapped at two heights.',
      prep: 'This is the one item worth hiring specialists for.',
      caution: 'A piano is heavy enough to shift the truck and to injure someone if it goes over.',
    },
  },
  {
    match: /\b(treadmill|exercise bike|elliptical|weight bench)\b/i,
    guidance: {
      orientation: 'Folded and locked, upright against a wall, strapped.',
      prep: 'Engage the transport lock, or take the deck off if it has no lock.',
      caution: null,
    },
  },
  {
    match: /\b(bicycle|bike)\b/i,
    guidance: {
      orientation: 'Upright against a wall, or hung from the tie rail by the frame.',
      prep: 'Turn the handlebars in line with the frame and take the pedals off.',
      caution: 'Chain grease ruins upholstery on contact and does not wash out.',
    },
  },
  {
    match: /\b(bookshelf|bookcase|shelving|china cabinet|hutch|display cabinet)\b/i,
    guidance: {
      orientation: 'Upright against a wall, strapped — it will rack and loosen if laid down.',
      prep: 'Empty it, take the loose shelves out, and tape or remove any glass doors.',
      caution: null,
    },
  },
  {
    match: /\b(dresser|chest of drawers|nightstand|sideboard|buffet|credenza|filing cabinet)\b/i,
    guidance: {
      orientation: 'Upright, drawers facing a wall so they cannot slide open.',
      prep: 'Leave clothes in the drawers to save boxes, but take out anything heavy or breakable.',
      caution: null,
    },
  },
  {
    match: /\b(wardrobe|armoire)\b/i,
    guidance: {
      orientation: 'Upright against a wall, strapped at two heights.',
      prep: 'Empty it, remove or tape the doors, and take out any internal rail.',
      caution: null,
    },
  },
  {
    match: /\b(lamp|chandelier)\b/i,
    guidance: {
      orientation: 'Boxed, loaded late, with nothing on top.',
      prep: 'Separate the shade, bulb and base and pack the shade on its own.',
      caution: null,
    },
  },
  {
    match: /\b(rug|carpet)\b/i,
    guidance: {
      orientation: 'Rolled, laid along the floor at the very back, under everything else.',
      prep: 'Roll it face-in and tape the roll in three places.',
      caution: null,
    },
  },
  {
    match: /\b(plant|tree)\b/i,
    guidance: {
      orientation: 'Not in the truck — carry it in the car.',
      prep: 'Water it lightly the day before, not on the day.',
      caution: 'A sealed truck swings well past what a houseplant survives, in either direction.',
    },
  },
];

/** The rule matching this item's name, or null when none applies. */
export function guidanceRuleFor(name: string): ItemGuidance | null {
  return RULES.find((rule) => rule.match.test(name))?.guidance ?? null;
}

/**
 * Guidance for an item, or null when it does not need any.
 *
 * A named rule always wins, whatever the size — a propane grill needs its warning at
 * any volume. Otherwise only genuinely large or fragile pieces get a generic note,
 * because annotating everything is the same as annotating nothing.
 */
export function guidanceFor(item: InventoryItem): ItemGuidance | null {
  const named = guidanceRuleFor(item.name);
  if (named !== null) return named;

  if (item.isFragile) {
    return {
      orientation: 'Upright, wedged between soft items, with nothing stacked on it.',
      prep: 'Wrap it and mark the box on more than one face.',
      caution: null,
    };
  }

  if (item.cubicFeet < LARGE_ITEM_CUBIC_FEET) return null;

  return {
    orientation:
      item.estimatedWeightClass === 'heavy'
        ? 'Low and against a wall, strapped — keep the weight over the axle.'
        : 'On edge against a side wall, packed tight against its neighbours.',
    prep: null,
    caution: null,
  };
}
