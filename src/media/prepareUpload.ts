/**
 * Shrinking a captured photo before it is sent to the detector.
 *
 * The picker hands back a full-resolution frame — 4032x3024 on a current iPhone —
 * and base64 inflates it by a further third. Posting that costs the user's cellular
 * data on moving week, costs latency against a 15 second client timeout, and buys
 * nothing: the vision model bills by tokenised tiles, so beyond a point extra
 * pixels are charged for and then discarded.
 *
 * 1568x1176 is not an arbitrary cap. Both edges divide evenly by 28, the tile size
 * vision models quantise to, so nothing is spent padding a partial tile. It also
 * sits far above the MIN_EDGE_PX gate in photoQuality, so a photo that survives
 * this step is still comfortably large enough to measure furniture from.
 *
 * Deliberately NOT smaller. Scale is inferred from small reference objects — an
 * outlet plate, a door casing — and those are exactly what disappears first when a
 * room photo is downscaled. Saving a further tenth of a cent by blurring away the
 * ruler would be a false economy.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Long edge of the uploaded image, in pixels. A multiple of 28 by design. */
export const UPLOAD_LONG_EDGE = 1568;

/**
 * JPEG quality for the upload. 0.8 sits above the point where compression
 * artifacts start eating fine edges, which is what the detector reads to size
 * things.
 */
export const UPLOAD_QUALITY = 0.8;

export interface PreparedUpload {
  /** base64 JPEG, no data: prefix — what the detect contract expects. */
  base64: string;
  width: number;
  height: number;
}

/**
 * Returns the resized image, or null when it could not be produced.
 *
 * Null rather than the original: silently falling back to a full-resolution upload
 * would hide the failure behind a bill and a slow request, which is the kind of
 * regression nobody notices until it is expensive.
 */
export async function prepareUpload(
  uri: string,
  width?: number,
  height?: number,
): Promise<PreparedUpload | null> {
  try {
    const longEdge = Math.max(width ?? 0, height ?? 0);
    // Never upscale. A small photo is already cheap, and enlarging it would invent
    // detail the detector would then read as real.
    const shouldResize = longEdge === 0 || longEdge > UPLOAD_LONG_EDGE;
    const context = shouldResize
      ? ImageManipulator.manipulate(uri).resize(
          (width ?? 0) >= (height ?? 0)
            ? { width: UPLOAD_LONG_EDGE }
            : { height: UPLOAD_LONG_EDGE },
        )
      : ImageManipulator.manipulate(uri);

    const image = await context.renderAsync();
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: UPLOAD_QUALITY,
      base64: true,
    });
    image.release();

    if (!saved.base64) return null;
    return { base64: saved.base64, width: saved.width, height: saved.height };
  } catch {
    return null;
  }
}
