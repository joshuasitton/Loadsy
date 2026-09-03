/**
 * Spec §3 Screen 1 edge case: reject or warn on photos that are too dark, blurry,
 * or contain no detectable furniture. An empty inventory must never be produced
 * silently — every rejection carries a reason the user can act on.
 */

export type PhotoRejectionCode = 'tooDark' | 'tooBlurry' | 'noFurniture' | 'tooSmall' | 'network';

export interface PhotoQualitySignals {
  /**
   * Mean luminance, 0–1. Optional for exactly the reason widthPx is: there is no
   * safe number to invent when it has not been measured. 1 waves every dark photo
   * through, 0 blocks every photo. Unknown is not too dark.
   */
  brightness?: number;
  /** Variance-of-Laplacian style sharpness score, 0–1. Unknown is not blurry. */
  sharpness?: number;
  /**
   * Pixel dimensions, when the picker actually reported them.
   *
   * Optional on purpose: iOS returns no dimensions for some library assets and for
   * iCloud originals that have not downloaded yet. Coercing that to 0 made a
   * perfectly good 4032x3024 photo fail the size gate — and `tooSmall` is a
   * blocking verdict, so the user was told to retake a photo that was already fine,
   * with no way forward. Unknown is not the same as too small.
   */
  widthPx?: number;
  heightPx?: number;
  /** count of items the detector returned; undefined before detection runs */
  detectedItemCount?: number;
}

export interface PhotoQualityVerdict {
  ok: boolean;
  code: PhotoRejectionCode | null;
  title: string;
  message: string;
  /** true when the user may proceed anyway (warn), false when we must block */
  recoverable: boolean;
}

export const MIN_BRIGHTNESS = 0.18;
export const MIN_SHARPNESS = 0.25;
export const MIN_EDGE_PX = 640;

const OK: PhotoQualityVerdict = {
  ok: true,
  code: null,
  title: '',
  message: '',
  recoverable: true,
};

function isMeasured(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function assessPhoto(signals: PhotoQualitySignals): PhotoQualityVerdict {
  const { widthPx, heightPx } = signals;
  const measured =
    typeof widthPx === 'number' &&
    typeof heightPx === 'number' &&
    Number.isFinite(widthPx) &&
    Number.isFinite(heightPx) &&
    widthPx > 0 &&
    heightPx > 0;

  if (measured && Math.min(widthPx, heightPx) < MIN_EDGE_PX) {
    return {
      ok: false,
      code: 'tooSmall',
      title: 'That photo is a little small',
      message:
        'Loadsy needs a larger image to measure furniture accurately. Try taking the photo with the camera instead of using a screenshot.',
      recoverable: false,
    };
  }

  // Guarded rather than compared directly: `undefined < 0.18` is false, which
  // happens to be the behaviour we want but only by accident. Saying so out loud
  // stops a later refactor turning an accident into a regression.
  if (isMeasured(signals.brightness) && signals.brightness < MIN_BRIGHTNESS) {
    return {
      ok: false,
      code: 'tooDark',
      title: 'Too dark to read the room',
      message:
        'Turn on the lights or open the blinds, then take the photo again. Loadsy needs to see edges to size your furniture.',
      recoverable: false,
    };
  }

  if (isMeasured(signals.sharpness) && signals.sharpness < MIN_SHARPNESS) {
    return {
      ok: false,
      code: 'tooBlurry',
      title: 'That one came out blurry',
      message:
        'Hold still for a beat and tap to focus before shooting. A sharp photo gives a much closer size estimate.',
      recoverable: false,
    };
  }

  if (signals.detectedItemCount === 0) {
    return {
      ok: false,
      code: 'noFurniture',
      title: "Couldn't find any furniture",
      message:
        'Stand in the doorway and frame the whole room, including the corners. Or add the items by hand — that works just as well.',
      recoverable: true,
    };
  }

  return OK;
}
