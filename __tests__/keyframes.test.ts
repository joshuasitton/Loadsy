import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PHOTOS } from '../src/domain/capture';
import { normaliseDeg, selectKeyframes, type CandidateFrame } from '../src/domain/keyframes';
import { MIN_BRIGHTNESS, MIN_SHARPNESS } from '../src/domain/photoQuality';

/** A frame that passes the quality gate, so tests opt in to badness explicitly. */
function frame(over: Partial<CandidateFrame> & { id: string }): CandidateFrame {
  return {
    yawDeg: 0,
    capturedAtMs: 0,
    brightness: 0.5,
    sharpness: 0.7,
    ...over,
  };
}

/** A sweep: `count` frames evenly around the circle, in time order. */
function sweep(count: number, sharpnessAt: (i: number) => number = () => 0.7): CandidateFrame[] {
  return Array.from({ length: count }, (_, i) =>
    frame({
      id: `f${String(i).padStart(3, '0')}`,
      yawDeg: (i * 360) / count,
      capturedAtMs: i * 120,
      sharpness: sharpnessAt(i),
    }),
  );
}

test('never returns more than the limit, at any input size', () => {
  for (const count of [5, 12, 60, 300]) {
    assert.equal(selectKeyframes(sweep(count), MAX_PHOTOS).length, MAX_PHOTOS);
  }
});

test('an empty sweep selects nothing, and a zero limit selects nothing', () => {
  assert.deepEqual(selectKeyframes([], MAX_PHOTOS), []);
  assert.deepEqual(selectKeyframes(sweep(10), 0), []);
});

test('fewer frames than the limit returns all of them, in capture order', () => {
  const frames = [
    frame({ id: 'c', capturedAtMs: 300 }),
    frame({ id: 'a', capturedAtMs: 100 }),
    frame({ id: 'b', capturedAtMs: 200 }),
  ];
  assert.deepEqual(
    selectKeyframes(frames, MAX_PHOTOS).map((f) => f.id),
    ['a', 'b', 'c'],
  );
});

/**
 * The reason this module exists. Taking the last four frames of a sweep gives you
 * four views of whichever wall the user stopped on — the detector's worst input,
 * because it gets four chances to double-count one sofa and never sees the rest of
 * the room.
 */
test('a full sweep is sampled around the circle, not clustered on one wall', () => {
  const picked = selectKeyframes(sweep(40), MAX_PHOTOS);
  const yaws = picked.map((f) => f.yawDeg ?? 0).sort((a, b) => a - b);

  for (let i = 1; i < yaws.length; i += 1) {
    const gap = yaws[i]! - yaws[i - 1]!;
    assert.ok(gap > 45, `frames ${i - 1} and ${i} are only ${gap}° apart — that is one wall`);
  }
});

test('within a part of the circle, the sharper frame wins', () => {
  // Two frames per quadrant, the second of each pair sharper than the first.
  const frames = [0, 90, 180, 270].flatMap((yaw, q) => [
    frame({ id: `q${q}-soft`, yawDeg: yaw + 1, capturedAtMs: q * 200, sharpness: 0.3 }),
    frame({ id: `q${q}-sharp`, yawDeg: yaw + 5, capturedAtMs: q * 200 + 50, sharpness: 0.9 }),
  ]);

  const picked = selectKeyframes(frames, MAX_PHOTOS).map((f) => f.id);
  assert.deepEqual(picked, ['q0-sharp', 'q1-sharp', 'q2-sharp', 'q3-sharp']);
});

test('the same input always selects the same frames', () => {
  const frames = sweep(37, (i) => 0.4 + ((i * 7) % 11) / 40);
  const once = selectKeyframes(frames, MAX_PHOTOS).map((f) => f.id);
  const twice = selectKeyframes([...frames].reverse(), MAX_PHOTOS).map((f) => f.id);
  assert.deepEqual(once, twice);
});

/**
 * A device with no gyroscope, or a user who declined motion access, still gets a
 * spread — over time instead of heading. Falling back to "the first four" would
 * quietly turn a sweep into four photographs of the doorway.
 */
test('with no heading at all, frames are spread over time', () => {
  const frames = Array.from({ length: 20 }, (_, i) =>
    frame({ id: `n${String(i).padStart(2, '0')}`, yawDeg: null, capturedAtMs: i * 100 }),
  );
  const times = selectKeyframes(frames, MAX_PHOTOS).map((f) => f.capturedAtMs);

  assert.equal(times.length, MAX_PHOTOS);
  assert.ok(times[times.length - 1]! - times[0]! >= 1400, `only spanned ${times[0]}–${times[3]}ms`);
});

test('a single frame with a heading is not treated as coverage', () => {
  const frames = [
    frame({ id: 'a', yawDeg: 10, capturedAtMs: 0 }),
    ...Array.from({ length: 9 }, (_, i) =>
      frame({ id: `b${i}`, yawDeg: null, capturedAtMs: (i + 1) * 100 }),
    ),
  ];
  const picked = selectKeyframes(frames, MAX_PHOTOS);
  assert.equal(picked.length, MAX_PHOTOS);
  // Time fallback, so the picks span the sweep rather than all landing on 'a'.
  assert.ok(picked[picked.length - 1]!.capturedAtMs - picked[0]!.capturedAtMs >= 600);
});

/**
 * Somebody who has just turned all the way around has to end up somewhere. An
 * empty result would drop them out of the flow with nothing to review; a poor
 * inventory lands on Screen 2, where the confidence gate already makes them check
 * it before they can leave.
 */
test('a sweep where every frame fails the gate still yields frames', () => {
  const frames = sweep(12).map((f) => ({
    ...f,
    brightness: MIN_BRIGHTNESS / 2,
    sharpness: MIN_SHARPNESS / 2,
  }));
  assert.equal(selectKeyframes(frames, MAX_PHOTOS).length, MAX_PHOTOS);
});

test('unusable frames are skipped while usable ones remain', () => {
  const frames = [
    ...sweep(4),
    ...sweep(4).map((f, i) => ({ ...f, id: `dark${i}`, brightness: 0.01 })),
  ];
  const picked = selectKeyframes(frames, MAX_PHOTOS);
  assert.ok(
    picked.every((f) => !f.id.startsWith('dark')),
    `selected an unusable frame: ${picked.map((f) => f.id).join(', ')}`,
  );
});

test('a half sweep still fills every slot it can', () => {
  // 180° of coverage: two of four buckets are empty, and the fill takes over.
  const frames = Array.from({ length: 10 }, (_, i) =>
    frame({ id: `h${i}`, yawDeg: (i * 180) / 10, capturedAtMs: i * 100 }),
  );
  assert.equal(selectKeyframes(frames, MAX_PHOTOS).length, MAX_PHOTOS);
});

test('headings wrap rather than clamp', () => {
  assert.equal(normaliseDeg(370), 10);
  assert.equal(normaliseDeg(-10), 350);
  assert.equal(normaliseDeg(0), 0);
});

/** The selection is bounded by the route's own limit, not a number of its own. */
test('the limit the app uses is the one the server enforces', () => {
  assert.equal(MAX_PHOTOS, 4);
});
