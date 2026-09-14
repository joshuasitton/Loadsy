/**
 * Measuring exposure and focus on a captured frame, on the device.
 *
 * photoQuality.ts has had MIN_BRIGHTNESS and MIN_SHARPNESS since the first pass,
 * with tests around them, and neither has ever fired — app/capture.tsx passed
 * `undefined` for both, honestly, because nothing had looked at the pixels. This
 * is the thing that looks.
 *
 * Why it matters more than it sounds: a dark or blurry frame is not rejected for
 * tidiness. It is rejected because the detector's whole sizing method is measuring
 * furniture against a door casing or an outlet plate, and those are the first
 * details to disappear in a soft frame. A blurry photo does not produce no
 * inventory — it produces a confident, wrong one, and the user has no way to see
 * that the numbers came from a guess.
 *
 * Everything here is deliberately failure-tolerant. If the resize fails, or the
 * decoder chokes, or the platform hands back something unexpected, the signals
 * come back undefined and the existing gate treats them as unmeasured. That is the
 * same contract PhotoQualitySignals already documents: unknown is not too dark.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { ANALYSIS_LONG_EDGE, luminanceStats, toGrayscale } from '../domain/imageStats';

export interface FrameSignals {
  brightness?: number;
  sharpness?: number;
}

/** Nothing measured. Returned on every failure path, never a fabricated value. */
const UNMEASURED: FrameSignals = {};

/**
 * Resizes to a fixed analysis size, decodes, and measures.
 *
 * The resize is not an optimisation, it is the measurement's definition — see
 * ANALYSIS_LONG_EDGE. Measuring a full-resolution frame would also decode roughly
 * twelve megapixels into a JavaScript array on the phone, per frame, which on a
 * sweep would be the most expensive thing the app does.
 */
export async function measureFrame(
  uri: string,
  width?: number,
  height?: number,
): Promise<FrameSignals> {
  try {
    const landscape = (width ?? 0) >= (height ?? 0);
    const context = ImageManipulator.manipulate(uri).resize(
      landscape ? { width: ANALYSIS_LONG_EDGE } : { height: ANALYSIS_LONG_EDGE },
    );

    const image = await context.renderAsync();
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      // Quality is high on purpose. This frame is thrown away immediately, and
      // compression artifacts are exactly the high-frequency noise the Laplacian
      // reads — a cheap JPEG would score as sharper than the photograph was.
      compress: 1,
      base64: true,
    });
    image.release();

    if (!saved.base64) return UNMEASURED;

    const raw = decode(base64ToBytes(saved.base64), { useTArray: true });
    if (!raw?.data || !raw.width || !raw.height) return UNMEASURED;

    const stats = luminanceStats(toGrayscale(raw.data), raw.width, raw.height);
    return stats ?? UNMEASURED;
  } catch {
    return UNMEASURED;
  }
}

/**
 * base64 → bytes without Buffer.
 *
 * React Native has `global.atob` on Hermes, but not on every engine and not on
 * web workers, and a polyfill would be a dependency for twenty lines. This decodes
 * the alphabet directly, which is also faster than atob + charCodeAt for a buffer
 * this size.
 */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let out = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < clean.length; i += 1) {
    buffer = (buffer << 6) | sextet(clean.charCodeAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out] = (buffer >> bits) & 0xff;
      out += 1;
    }
  }

  return out === bytes.length ? bytes : bytes.subarray(0, out);
}

function sextet(code: number): number {
  if (code >= 65 && code <= 90) return code - 65; // A-Z
  if (code >= 97 && code <= 122) return code - 71; // a-z
  if (code >= 48 && code <= 57) return code + 4; // 0-9
  if (code === 43) return 62; // +
  return 63; // /
}
