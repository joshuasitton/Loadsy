/**
 * Choosing which frames of a room actually get measured.
 *
 * A 360° sweep produces dozens of frames; /v1/detect takes MAX_PHOTOS. Something
 * has to choose, and the choice cannot be "the last four", because the last four
 * are wherever the user happened to stop turning — usually four views of the same
 * wall. Four views of one wall is the worst possible input to a detector whose
 * hardest instruction is that each object must appear exactly once: it gets four
 * chances to double-count the sofa and never sees the other half of the room.
 *
 * So the rule is coverage first, focus second. Spread the picks around the circle,
 * and within each part of the circle take the sharpest frame available.
 *
 * Pure by construction — no framework imports, no pixels, no clock. The signals
 * arrive already measured (src/media/frameSignals.ts) and the thresholds come from
 * photoQuality.ts, so "too dark to use" means the same thing here as it does to a
 * user who took one photograph by hand.
 */

import { assessPhoto } from './photoQuality';

export interface CandidateFrame {
  id: string;
  /**
   * Compass-style heading at capture, 0–360. Null when DeviceMotion gave nothing
   * — a device with no gyroscope, or a permission the user declined. Null is not
   * zero: treating an unknown heading as "due north" would pile every unmeasured
   * frame into one bucket and call it coverage.
   */
  yawDeg: number | null;
  capturedAtMs: number;
  /** Undefined when unmeasured, exactly as in PhotoQualitySignals. */
  brightness?: number;
  sharpness?: number;
}

/**
 * Up to `limit` frames, in capture order.
 *
 * Capture order rather than selection order because the UI numbers them "Angle 1,
 * Angle 2…" and a user who turned clockwise expects those to read clockwise.
 */
export function selectKeyframes(
  frames: readonly CandidateFrame[],
  limit: number,
): CandidateFrame[] {
  if (limit <= 0 || frames.length === 0) return [];

  const usable = frames.filter(
    (frame) => assessPhoto({ brightness: frame.brightness, sharpness: frame.sharpness }).ok,
  );

  /**
   * A sweep where every frame failed the gate still has to produce something.
   * The alternative is telling somebody who just turned all the way around that
   * there is nothing to measure, which is both useless and unnecessary: a poor
   * inventory lands on Screen 2, where the confidence gate already makes them
   * check it. An empty one lands nowhere.
   */
  const pool = usable.length > 0 ? usable : [...frames];

  if (pool.length <= limit) return inCaptureOrder(pool);

  const withYaw = pool.filter((frame) => isHeading(frame.yawDeg));
  const picked =
    withYaw.length >= 2
      ? spread(pool, withYaw, limit, (frame) => bucketByYaw(frame, withYaw, limit))
      : spread(pool, pool, limit, (frame) => bucketByTime(frame, pool, limit));

  return inCaptureOrder(picked);
}

/**
 * One frame per bucket — the sharpest — then the best of the rest until full.
 *
 * The fill matters. A user who sweeps 180° and stops leaves half the buckets
 * empty; without the fill the app would send two frames when four good ones were
 * sitting there, and pay for the detector's uncertainty instead of the second
 * angle that would have resolved it.
 */
function spread(
  pool: readonly CandidateFrame[],
  bucketable: readonly CandidateFrame[],
  limit: number,
  bucketOf: (frame: CandidateFrame) => number,
): CandidateFrame[] {
  const best = new Map<number, CandidateFrame>();
  for (const frame of [...bucketable].sort(byId)) {
    const bucket = bucketOf(frame);
    const held = best.get(bucket);
    if (!held || sharpnessOf(frame) > sharpnessOf(held)) best.set(bucket, frame);
  }

  const picked = [...best.values()];
  if (picked.length >= limit) return picked.slice(0, limit);

  const chosen = new Set(picked.map((frame) => frame.id));
  const rest = [...pool]
    .filter((frame) => !chosen.has(frame.id))
    .sort((a, b) => sharpnessOf(b) - sharpnessOf(a) || byId(a, b));

  return [...picked, ...rest.slice(0, limit - picked.length)];
}

/** Buckets anchored on the first heading seen, so the partition is deterministic. */
function bucketByYaw(
  frame: CandidateFrame,
  withYaw: readonly CandidateFrame[],
  limit: number,
): number {
  const anchor = [...withYaw].sort(byCapture)[0]?.yawDeg ?? 0;
  const offset = normaliseDeg((frame.yawDeg ?? 0) - anchor);
  return Math.min(limit - 1, Math.floor((offset / 360) * limit));
}

function bucketByTime(
  frame: CandidateFrame,
  pool: readonly CandidateFrame[],
  limit: number,
): number {
  const times = pool.map((f) => f.capturedAtMs);
  const first = Math.min(...times);
  const span = Math.max(...times) - first;
  if (span <= 0) return 0;
  return Math.min(limit - 1, Math.floor(((frame.capturedAtMs - first) / span) * limit));
}

/** Unmeasured is not unsharp — but it cannot win a tie against a measured frame. */
function sharpnessOf(frame: CandidateFrame): number {
  return typeof frame.sharpness === 'number' && Number.isFinite(frame.sharpness)
    ? frame.sharpness
    : 0;
}

function isHeading(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normaliseDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function inCaptureOrder(frames: readonly CandidateFrame[]): CandidateFrame[] {
  return [...frames].sort(byCapture);
}

function byCapture(a: CandidateFrame, b: CandidateFrame): number {
  return a.capturedAtMs - b.capturedAtMs || byId(a, b);
}

/** The tiebreak, everywhere. Same reason packing.ts sorts on id: determinism. */
function byId(a: CandidateFrame, b: CandidateFrame): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
