import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYSIS_LONG_EDGE,
  luminanceStats,
  SHARPNESS_HALF_SATURATION,
  toGrayscale,
} from '../src/domain/imageStats';
import { MIN_BRIGHTNESS, MIN_SHARPNESS } from '../src/domain/photoQuality';

const W = 64;
const H = 48;

function flat(value: number): Uint8Array {
  return new Uint8Array(W * H).fill(value);
}

/** Hard vertical stripes: maximum local contrast, so maximum Laplacian variance. */
function stripes(period: number, high = 255, low = 0): Uint8Array {
  const gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      gray[y * W + x] = Math.floor(x / period) % 2 === 0 ? high : low;
    }
  }
  return gray;
}

/** A smooth left-to-right gradient: plenty of range, no local detail at all. */
function gradient(): Uint8Array {
  const gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      gray[y * W + x] = Math.round((x / (W - 1)) * 255);
    }
  }
  return gray;
}

/** Box blur, the cheapest stand-in for a phone that moved while the shutter was open. */
function blurred(source: Uint8Array, passes: number): Uint8Array {
  let current = source;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
            sum += current[yy * W + xx]!;
            n += 1;
          }
        }
        next[y * W + x] = Math.round(sum / n);
      }
    }
    current = next;
  }
  return current;
}

test('a buffer of the wrong length measures nothing rather than guessing', () => {
  assert.equal(luminanceStats(new Uint8Array(10), W, H), null);
  assert.equal(luminanceStats(flat(128), 2, 2), null);
  assert.equal(luminanceStats(flat(128), 1.5, H), null);
});

test('brightness is the mean, scaled to the 0-1 the gate expects', () => {
  assert.equal(luminanceStats(flat(0), W, H)?.brightness, 0);
  assert.equal(luminanceStats(flat(255), W, H)?.brightness, 1);
  const mid = luminanceStats(flat(128), W, H)!.brightness;
  assert.ok(Math.abs(mid - 128 / 255) < 1e-9);
});

test('a dark frame fails the brightness threshold that has never fired', () => {
  const dim = luminanceStats(flat(20), W, H)!;
  assert.ok(dim.brightness < MIN_BRIGHTNESS, `${dim.brightness} should be under the floor`);
});

test('a flat frame has no detail, so no sharpness', () => {
  assert.equal(luminanceStats(flat(128), W, H)?.sharpness, 0);
});

test('crisp detail scores above the blur threshold', () => {
  const sharp = luminanceStats(stripes(2), W, H)!.sharpness;
  assert.ok(sharp > MIN_SHARPNESS, `crisp edges scored ${sharp}`);
});

/**
 * A defocused photograph is not a dark one or a low-contrast one — it still has
 * the full tonal range, it has just lost every local edge. A smooth gradient is
 * that in the limit, and it has to fail, because it is what a badly out-of-focus
 * wall actually looks like to this measure.
 */
test('a frame with range but no local detail fails the blur threshold', () => {
  const smooth = luminanceStats(gradient(), W, H)!;
  assert.ok(smooth.brightness > MIN_BRIGHTNESS, 'the gradient is not a dark frame');
  assert.ok(smooth.sharpness < MIN_SHARPNESS, `a featureless gradient scored ${smooth.sharpness}`);
});

test('blurring the same frame always lowers its score', () => {
  const source = stripes(4);
  const scores = [0, 1, 2, 4, 8].map(
    (passes) => luminanceStats(blurred(source, passes), W, H)!.sharpness,
  );

  for (let i = 1; i < scores.length; i += 1) {
    assert.ok(
      scores[i]! < scores[i - 1]!,
      `blur pass ${i} scored ${scores[i]}, up from ${scores[i - 1]}`,
    );
  }
});

test('sharpness is bounded, so no frame can score its way past 1', () => {
  const score = luminanceStats(stripes(1), W, H)!.sharpness;
  assert.ok(score > 0 && score <= 1);
});

/**
 * The curve's one calibration point, written down as a test so moving the
 * constant cannot silently move what "blurry" means.
 */
test('the sharpness curve crosses the threshold at a variance of 100', () => {
  const atThreshold = 100 / (100 + SHARPNESS_HALF_SATURATION);
  assert.ok(Math.abs(atThreshold - MIN_SHARPNESS) < 1e-9);
});

test('grayscale weights green most, the way the eye does', () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  const gray = toGrayscale(rgba);
  assert.equal(gray.length, 3);
  assert.ok(gray[1]! > gray[0]! && gray[0]! > gray[2]!);
});

/** Fixed, because variance-of-Laplacian is not scale-invariant. */
test('the analysis size is a constant, not whatever the camera returned', () => {
  assert.equal(ANALYSIS_LONG_EDGE, 256);
});
