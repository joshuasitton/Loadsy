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

const VOLUME_PRIORS: readonly VolumePrior[] = [
  { label: 'a sofa', match: /\b(sofa|couch|loveseat|sectional)\b/i, minCuFt: 15, maxCuFt: 130 },
  { label: 'a mattress', match: /\bmattress\b/i, minCuFt: 8, maxCuFt: 60 },
  { label: 'a refrigerator', match: /\b(refrigerator|fridge|freezer)\b/i, minCuFt: 15, maxCuFt: 100 },
  { label: 'a dining table', match: /\bdining table\b/i, minCuFt: 15, maxCuFt: 90 },
  { label: 'a chair', match: /\b(chair|stool)\b/i, minCuFt: 2, maxCuFt: 40 },
  { label: 'a nightstand', match: /\b(nightstand|side table|end table)\b/i, minCuFt: 1, maxCuFt: 20 },
  { label: 'a lamp', match: /\blamp\b/i, minCuFt: 0.5, maxCuFt: 20 },
  { label: 'a television', match: /\b(tv|television)\b/i, minCuFt: 0.5, maxCuFt: 25 },
  { label: 'a box', match: /\bbox(es)?\b/i, minCuFt: 0.5, maxCuFt: 30 },
  { label: 'a bookshelf', match: /\b(bookshelf|bookcase|shelving)\b/i, minCuFt: 4, maxCuFt: 60 },
  { label: 'a dresser', match: /\b(dresser|chest of drawers)\b/i, minCuFt: 8, maxCuFt: 60 },
  { label: 'a desk', match: /\bdesk\b/i, minCuFt: 8, maxCuFt: 70 },
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
