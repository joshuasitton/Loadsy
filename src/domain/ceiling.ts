/**
 * The ceiling height of the home, as the person moving told us.
 *
 * The detection prompt measures furniture against things whose size it knows –
 * a door leaf, an outlet plate, the ceiling – and it assumes a 96 in ceiling. When
 * the ceiling is the reference in frame and the real one is 9 ft, every dimension
 * comes out about 11% short, and because volume multiplies three dimensions that
 * compounds to about 30% less – a truck too small, the one direction this app must
 * not err in. One question, asked once per move, removes the assumption.
 *
 * Decided by the Chairman on 14 September: "Are your ceilings the standard 8ft
 * high?", yes or no, and if no, the height.
 *
 * Pure, so the rules – what counts as a height, what gets told to the model – are
 * pinned by `npm test` with nothing installed.
 */

/** What the prompt assumes when it is told nothing: 8 ft. */
export const STANDARD_CEILING_IN = 96;

/**
 * The quick answers offered after "no". Chips rather than a text box, because a
 * typed height comes back as "9 feet", "108", or "9'6"", and a tap cannot be
 * misread. "Other" covers the rest.
 */
export const CEILING_CHOICES_FT = [7, 9, 10, 12] as const;

/**
 * The range a home's ceiling can plausibly be. Outside it, the answer is a slip –
 * inches typed as feet, a stray digit – and using it would scale every measurement
 * by the mistake.
 */
export const MIN_CEILING_IN = 72;
export const MAX_CEILING_IN = 240;

/** A ceiling height in whole inches, or null when the value is not one. */
export function normaliseCeilingHeight(inches: number | null | undefined): number | null {
  if (inches === null || inches === undefined || !Number.isFinite(inches)) return null;
  const whole = Math.round(inches);
  return whole >= MIN_CEILING_IN && whole <= MAX_CEILING_IN ? whole : null;
}

/**
 * Reads the "Other" box: feet, optionally with inches.
 *
 * Accepts the ways people actually write it – `9`, `9.5`, `9 ft`, `9'6"`, `9 ft 6 in`,
 * `9 6` – and returns inches, or null when it cannot be read as a plausible ceiling.
 * Never guesses: `108` is 108 feet, which is out of range, not 108 inches.
 */
export function parseCeilingFeet(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?\s*(?:(\d+(?:\.\d+)?)\s*(?:in|inch|inches|")?)?\s*$/i.exec(
    text,
  );
  if (!match) return null;
  const feet = Number(match[1]);
  const inches = match[2] === undefined ? 0 : Number(match[2]);
  if (inches >= 12) return null;
  return normaliseCeilingHeight(feet * 12 + inches);
}

/**
 * What the detector should be told: the height, or null when the standard
 * assumption already holds.
 *
 * Null for an unanswered question and for "yes" alike, so a move with an ordinary
 * ceiling sends exactly the request it sent before this question existed.
 */
export function ceilingForDetection(inches: number | null | undefined): number | null {
  const height = normaliseCeilingHeight(inches);
  return height === null || height === STANDARD_CEILING_IN ? null : height;
}

/** "8 ft", "9 ft 6 in". */
export function formatCeiling(inches: number): string {
  const feet = Math.floor(inches / 12);
  const rest = inches - feet * 12;
  return rest === 0 ? `${feet} ft` : `${feet} ft ${rest} in`;
}
