/**
 * Exposure and focus, measured from pixels.
 *
 * Pure on purpose. The decoding lives in src/media/frameSignals.ts, where a JPEG
 * decoder and an image resizer are allowed to exist; everything below is
 * arithmetic over a grayscale buffer, so it runs in `npm test` with no
 * dependencies installed and can be pinned by ordinary assertions.
 *
 * These feed MIN_BRIGHTNESS and MIN_SHARPNESS in photoQuality.ts, which have been
 * implemented and tested since the first pass and have never once fired, because
 * nothing ever measured anything to give them.
 */

/**
 * Long edge, in pixels, that a frame must be resized to before it is measured.
 *
 * Fixed rather than "whatever the picker returned", because variance-of-Laplacian
 * is not scale-invariant: downscaling averages neighbouring pixels together and
 * drives the variance down. Measure a 4032px frame and a 1024px frame of the same
 * room and you get two different sharpness scores for one photograph, which would
 * make MIN_SHARPNESS mean something different on every device.
 */
export const ANALYSIS_LONG_EDGE = 256;

/**
 * Half-saturation constant for the sharpness curve below.
 *
 * Chosen so the normalised score crosses MIN_SHARPNESS (0.25) at a raw
 * variance-of-Laplacian of 100 — the threshold that has been the conventional
 * blur cutoff for this measure for twenty years. It is a defensible starting
 * point, not a law: if real captures cluster on the wrong side of it, move this
 * number and say why, rather than moving MIN_SHARPNESS and leaving two
 * thresholds to disagree about what "blurry" means.
 */
export const SHARPNESS_HALF_SATURATION = 300;

export interface ImageStats {
  /** Mean luminance, 0–1. */
  brightness: number;
  /** Normalised variance-of-Laplacian, 0–1, monotonic in focus. */
  sharpness: number;
}

/**
 * Measures a grayscale buffer laid out row-major, one byte per pixel.
 *
 * Returns null rather than a number for a buffer too small or the wrong length.
 * Every caller of this treats an absent signal as "nobody looked", which
 * photoQuality.ts already handles correctly — inventing a 1 here would be the
 * exact fiction this work exists to remove.
 */
export function luminanceStats(
  gray: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): ImageStats | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width < 3 || height < 3) return null;
  if (gray.length !== width * height) return null;

  let sum = 0;
  for (let i = 0; i < gray.length; i += 1) sum += gray[i]!;
  const brightness = sum / gray.length / 255;

  // Laplacian over the interior only. The border has no full neighbourhood, and
  // clamping it would invent edges at the frame edge — which is where the
  // wide-angle distortion the detector already has to fight is worst.
  let lapSum = 0;
  let lapSumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap =
        4 * gray[i]! - gray[i - 1]! - gray[i + 1]! - gray[i - width]! - gray[i + width]!;
      lapSum += lap;
      lapSumSq += lap * lap;
      count += 1;
    }
  }

  if (count === 0) return null;
  const mean = lapSum / count;
  const variance = Math.max(0, lapSumSq / count - mean * mean);

  return {
    brightness: clamp01(brightness),
    sharpness: clamp01(variance / (variance + SHARPNESS_HALF_SATURATION)),
  };
}

/** Rec. 601 luma, the weighting that matches how the eye reads brightness. */
export function toGrayscale(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const pixels = Math.floor(rgba.length / 4);
  const gray = new Uint8Array(pixels);
  for (let p = 0; p < pixels; p += 1) {
    const i = p * 4;
    gray[p] = (0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!) | 0;
  }
  return gray;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
