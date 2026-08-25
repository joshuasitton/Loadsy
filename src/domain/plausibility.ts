/**
 * Sanity-checks the dimensions a detector returns, before they become cubic feet.
 *
 * Every number on Screen 3 and every price on Screen 4 is derived from these
 * inches. A vision model that mis-scales one sofa — 840 inches instead of 84 —
 * does not fail loudly; it silently adds a truck's worth of volume and quietly
 * recommends a 26ft truck for a studio. Nothing downstream can detect that,
 * because by then it is just a number.
 *
 * The response is deliberately NOT to drop an implausible item: dropping loses
 * furniture the user owns, which under-sizes the truck — the worse failure, since
 * it strands belongings on moving day. Instead the item is marked low-confidence,
 * which routes it into the Screen 2 review the app already blocks on. A human
 * glance is exactly the right resolution for "this looks wrong".
 *
 * Model-agnostic on purpose: whatever produces the dimensions — a VLM, a prior
 * table, LiDAR — the same physical limits apply.
 */

import type { Dimensions } from './types';
import { cubicFeetFor } from './volume';

/** Smaller than this and it is not something you hire a truck for. */
export const MIN_EDGE_IN = 2;
/**
 * 120in (10ft) is longer than the load bed of the smallest truck the app
 * recommends, and taller than any residential ceiling.
 */
export const MAX_EDGE_IN = 120;
/**
 * 300 ft³ is the entire capacity of a cargo van. No single household item
 * reaches it; a value this large is a scale error, not a large sofa.
 */
export const MAX_ITEM_CUBIC_FEET = 300;
/** A 40:1 edge ratio is a plank, not furniture — and usually a transposed unit. */
export const MAX_EDGE_RATIO = 40;

export interface PlausibilityVerdict {
  plausible: boolean;
  /**
   * Phrased for the person reviewing it, not for a log. This becomes the
   * confidenceReason shown beside the item on Screen 2, so it has to tell someone
   * non-technical what to look at.
   */
  reason: string | null;
}

const PLAUSIBLE: PlausibilityVerdict = { plausible: true, reason: null };

/**
 * A conservative floor and ceiling for items whose name we recognise.
 *
 * Deliberately wide: the job is catching order-of-magnitude errors, not policing
 * whether a particular sofa is 82 or 84 inches. A range that is too tight would
 * flag correct detections and train the user to click through the gate, which
 * would cost more accuracy than it gained.
 *
 * Provisional pending a researched table — kept small and obviously extendable
 * rather than guessed at scale.
 */
interface VolumePrior {
  readonly label: string;
  readonly match: RegExp;
  readonly minCuFt: number;
  readonly maxCuFt: number;
}

/**
 * Bands are WIDER than the sourced ranges they come from, on purpose.
 *
 * The research table lists a roughly ±2σ span for each item, which is the right
 * range for ESTIMATING a size. It is the wrong range for flagging one: ~5% of
 * genuine items fall outside ±2σ, which on a 60-item move is three false flags
 * before a single real error. The gate blocks the primary CTA, so a user who is
 * flagged for correct detections learns to clear the banner without reading it —
 * and then it catches nothing.
 *
 * So each band is the sourced min/max opened up by roughly a third either way.
 * The job here is catching a sofa reported at 600 ft³, not adjudicating whether a
 * particular sectional is unusually large.
 *
 * Sourced from retailer and manufacturer specifications: U-Haul and Uline box
 * specs, Amerisleep/Casper mattress charts, Coleman and Bassett furniture guides,
 * Whirlpool and NFM appliance sizing.
 *
 * BOUNDING BOX volumes, matching cubicFeetFor. Do NOT reconcile these against
 * moving-industry "cube sheets" — those are PACKED volumes and run 11-50% lower
 * for irregular items. Mixing the two conventions would introduce a systematic
 * bias, which is the error class truck sizing tolerates least.
 */
const VOLUME_PRIORS: readonly VolumePrior[] = [
  // Seating — sectionals are irreducibly wide, so the band barely constrains them.
  { label: 'a sectional', match: /\bsectional\b/i, minCuFt: 65, maxCuFt: 530 },
  { label: 'a sleeper sofa', match: /\b(sleeper sofa|sofa bed|futon)\b/i, minCuFt: 34, maxCuFt: 131 },
  { label: 'a loveseat', match: /\bloveseat\b/i, minCuFt: 20, maxCuFt: 87 },
  { label: 'a sofa', match: /\b(sofa|couch|settee)\b/i, minCuFt: 30, maxCuFt: 114 },
  { label: 'a recliner', match: /\brecliner\b/i, minCuFt: 16, maxCuFt: 66 },
  { label: 'an armchair', match: /\b(armchair|accent chair|club chair)\b/i, minCuFt: 9, maxCuFt: 52 },
  { label: 'an office chair', match: /\b(office chair|desk chair)\b/i, minCuFt: 8, maxCuFt: 37 },
  { label: 'a bar stool', match: /\b(bar stool|counter stool)\b/i, minCuFt: 2, maxCuFt: 15 },
  { label: 'a dining chair', match: /\b(dining chair|chair)\b/i, minCuFt: 3, maxCuFt: 30 },
  { label: 'an ottoman', match: /\b(ottoman|footstool|pouffe)\b/i, minCuFt: 1, maxCuFt: 19 },

  // Tables and surfaces
  { label: 'a dining table', match: /\bdining table\b/i, minCuFt: 14, maxCuFt: 103 },
  { label: 'a coffee table', match: /\bcoffee table\b/i, minCuFt: 4, maxCuFt: 27 },
  { label: 'a console table', match: /\b(console table|sofa table)\b/i, minCuFt: 6, maxCuFt: 32 },
  { label: 'a patio table', match: /\bpatio table\b/i, minCuFt: 14, maxCuFt: 88 },
  { label: 'a desk', match: /\bdesk\b/i, minCuFt: 10, maxCuFt: 44 },
  { label: 'a side table', match: /\b(nightstand|side table|end table|bedside)\b/i, minCuFt: 2, maxCuFt: 18 },

  // Storage
  // Ahead of the furniture wardrobe on purpose: volumePriorFor returns the FIRST
  // match, and "Wardrobe Box" contains "wardrobe". A 12.8 ft³ packing box measured
  // against a 18-79 ft³ armoire band is flagged as impossibly small.
  { label: 'a wardrobe box', match: /\bwardrobe box\b/i, minCuFt: 6, maxCuFt: 22 },
  { label: 'a wardrobe', match: /\b(wardrobe|armoire)\b/i, minCuFt: 18, maxCuFt: 79 },
  { label: 'a china cabinet', match: /\b(china cabinet|hutch|display cabinet)\b/i, minCuFt: 17, maxCuFt: 82 },
  { label: 'a sideboard', match: /\b(buffet|sideboard|credenza)\b/i, minCuFt: 8, maxCuFt: 45 },
  { label: 'a dresser', match: /\b(dresser|chest of drawers|highboy|tallboy)\b/i, minCuFt: 8, maxCuFt: 40 },
  { label: 'a bookcase', match: /\b(bookshelf|bookcase|shelving|shelf unit)\b/i, minCuFt: 3, maxCuFt: 43 },
  { label: 'a media console', match: /\b(tv stand|media console|entertainment (unit|centre|center))\b/i, minCuFt: 4, maxCuFt: 31 },
  { label: 'a filing cabinet', match: /\bfiling cabinet\b/i, minCuFt: 3, maxCuFt: 23 },

  // Beds — mattresses are manufactured to spec, so these bands are the tightest here.
  { label: 'a mattress', match: /\b(mattress|box spring)\b/i, minCuFt: 6, maxCuFt: 79 },
  { label: 'a bed frame', match: /\b(bed frame|bedstead|bed base)\b/i, minCuFt: 18, maxCuFt: 88 },
  { label: 'a headboard', match: /\bheadboard\b/i, minCuFt: 1, maxCuFt: 20 },
  { label: 'a crib', match: /\b(crib|cot)\b/i, minCuFt: 6, maxCuFt: 45 },

  // Appliances — cutout dimensions are standardised, so these are reliable.
  { label: 'a refrigerator', match: /\b(refrigerator|fridge|freezer)\b/i, minCuFt: 5, maxCuFt: 78 },
  { label: 'a washer or dryer', match: /\b(washer|washing machine|dryer|tumble dryer)\b/i, minCuFt: 9, maxCuFt: 37 },
  { label: 'a dishwasher', match: /\bdishwasher\b/i, minCuFt: 7, maxCuFt: 18 },
  { label: 'an oven', match: /\b(range|oven|stove|cooker)\b/i, minCuFt: 10, maxCuFt: 25 },
  { label: 'a microwave', match: /\bmicrowave\b/i, minCuFt: 1, maxCuFt: 9 },
  { label: 'an air conditioner', match: /\b(air conditioner|ac unit|aircon)\b/i, minCuFt: 1, maxCuFt: 14 },

  // Screens, glass and art — thin, so a depth slip is the usual failure here.
  { label: 'a television', match: /\b(tv|television)\b/i, minCuFt: 0.8, maxCuFt: 35 },
  { label: 'a mirror', match: /\bmirror\b/i, minCuFt: 0.5, maxCuFt: 22 },
  { label: 'framed art', match: /\b(painting|framed|artwork|picture frame)\b/i, minCuFt: 0.2, maxCuFt: 16 },
  { label: 'a lamp', match: /\blamp\b/i, minCuFt: 0.4, maxCuFt: 25 },

  // Sport, garden and garage — the loosest entries in the source table.
  { label: 'a treadmill', match: /\btreadmill\b/i, minCuFt: 37, maxCuFt: 176 },
  { label: 'an exercise bike', match: /\b(exercise bike|spin bike|elliptical)\b/i, minCuFt: 13, maxCuFt: 69 },
  { label: 'a bicycle', match: /\b(bicycle|bike)\b/i, minCuFt: 18, maxCuFt: 78 },
  { label: 'a barbecue', match: /\b(grill|barbecue|bbq)\b/i, minCuFt: 14, maxCuFt: 81 },
  { label: 'a lawn mower', match: /\b(lawn ?mower|mower)\b/i, minCuFt: 14, maxCuFt: 63 },
  { label: 'a ladder', match: /\b(ladder|step ?ladder)\b/i, minCuFt: 2, maxCuFt: 15 },
  { label: 'a vacuum', match: /\bvacuum\b/i, minCuFt: 2, maxCuFt: 13 },
  { label: 'a rolled rug', match: /\b(rug|carpet)\b/i, minCuFt: 2, maxCuFt: 19 },

  // Boxes — retail specs, but "boxes" plural may be a stack, so the ceiling is open.
  { label: 'a box', match: /\b(box(es)?|carton|tote|crate|suitcase)\b/i, minCuFt: 0.4, maxCuFt: 40 },
];

/** The first prior whose name matches, or null when the item is unrecognised. */
export function volumePriorFor(name: string): VolumePrior | null {
  return VOLUME_PRIORS.find((prior) => prior.match.test(name)) ?? null;
}

/**
 * Checks physical limits first, then a per-item volume range when the name is
 * recognised. An unrecognised name only gets the generic checks — unknown is not
 * suspicious, and inventing a prior for it would flag legitimate items.
 */
export function assessDimensions(name: string, dimensions: Dimensions): PlausibilityVerdict {
  const edges = [dimensions.lengthIn, dimensions.widthIn, dimensions.heightIn];

  if (edges.some((edge) => !Number.isFinite(edge) || edge <= 0)) {
    return { plausible: false, reason: 'The measurements came back incomplete — please check them' };
  }

  if (edges.some((edge) => edge < MIN_EDGE_IN)) {
    return { plausible: false, reason: 'This measured smaller than it probably is — worth a check' };
  }

  if (edges.some((edge) => edge > MAX_EDGE_IN)) {
    return {
      plausible: false,
      reason: 'This measured over 10 feet on one side — worth confirming the size',
    };
  }

  const longest = Math.max(...edges);
  const shortest = Math.min(...edges);
  if (longest / shortest > MAX_EDGE_RATIO) {
    return { plausible: false, reason: 'That shape looks unusual — please confirm the measurements' };
  }

  const cubicFeet = cubicFeetFor(dimensions);
  if (cubicFeet > MAX_ITEM_CUBIC_FEET) {
    return {
      plausible: false,
      reason: 'This came out larger than a whole van — please confirm the size',
    };
  }

  const prior = volumePriorFor(name);
  if (prior !== null) {
    if (cubicFeet > prior.maxCuFt) {
      return { plausible: false, reason: `That is unusually large for ${prior.label} — worth a check` };
    }
    if (cubicFeet < prior.minCuFt) {
      return { plausible: false, reason: `That is unusually small for ${prior.label} — worth a check` };
    }
  }

  return PLAUSIBLE;
}
