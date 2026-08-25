/**
 * Primitives for validating data that came from outside this app — an API
 * response, or a payload read back out of storage.
 *
 * Both sources are untrusted for the same reason: they were produced by a
 * different version of something, at a different time, and nothing about the
 * TypeScript types survives the boundary. `as T` on a parsed JSON body is a
 * promise the compiler cannot keep.
 *
 * Pure, no dependencies, so every consumer is testable by the dependency-free
 * test runner.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A real, finite number — never a numeric string.
 *
 * Coercion is deliberately refused. A `cubicFeet` of "10" summed with `+` against
 * "20" concatenates to "01020", and the resulting 1020 ft³ sizes a one-room move
 * as a 26ft truck. A wrong type is a bug at the source, not something to paper
 * over with Number().
 */
export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A finite number that is zero or greater — money, volumes, distances. */
export function nonNegativeNumber(value: unknown): number | null {
  const n = finiteNumber(value);
  return n !== null && n >= 0 ? n : null;
}

export function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** Narrows an unknown to one of a fixed set — the only safe way to trust an enum. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * An ISO-8601 date string the platform can actually parse.
 *
 * `Date.parse` returning NaN is silently contagious: one unparseable
 * `earliestAvailability` makes `Math.min(...)` NaN across the whole quote list,
 * which zeroes the wait penalty for every quote and quietly degrades Best Match
 * into Cheapest — with the wrong quote ranked first, not the bad one.
 */
export function isoDateString(value: unknown): string | null {
  const text = nonEmptyString(value);
  if (text === null) return null;
  return Number.isFinite(Date.parse(text)) ? text : null;
}
