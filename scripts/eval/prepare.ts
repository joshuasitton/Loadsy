/**
 * Turns a photo on disk into exactly what the app would upload.
 *
 * The app shrinks every photo to `UPLOAD_LONG_EDGE` and re-saves it as a JPEG at
 * `UPLOAD_QUALITY` before sending. The eval used to send the original file instead –
 * a 12 or 48 megapixel photo, its location metadata included – which showed the
 * model detail no user's upload carries and would have reported accuracy the app
 * cannot reach. This does what the app does, with the tool every Mac already has.
 *
 * The order is deliberate, and each step was probed against real `sips` behaviour
 * on this project rather than assumed:
 *
 *   1. Read the orientation tag, via a throwaway JPEG copy (this is how HEIC works).
 *   2. Decode to PNG. Lossless, and `sips` does NOT apply the orientation tag, so
 *      these are the pixels exactly as stored.
 *   3. Rotate and flip the PNG upright.
 *   4. Resize and save as JPEG once – one lossy encode, as in the app.
 *   5. Strip every metadata block. `sips` carries the original orientation tag into
 *      this file even though the pixels are now upright, so leaving it would get the
 *      photo turned twice by anything that honours it – and it takes GPS with it.
 *   6. Verify: no identifying metadata left, and `sips` can still read the result.
 *
 * macOS only, because `sips` is. That matches where the eval runs: it needs the
 * network and a key, and CLAUDE.md puts both on Josh's Mac.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { UPLOAD_LONG_EDGE, UPLOAD_QUALITY } from '../../src/media/uploadSpec';
import { metadataLeft, orientationSteps, readJpegOrientation, stripJpegMetadata } from './photos';

export interface PreparedPhoto {
  /** base64 JPEG, as the detect request expects it. */
  base64: string;
  width: number;
  height: number;
  bytes: number;
  /** The EXIF orientation that was applied – 1 means none was needed. */
  orientation: number;
}

export class UnreadablePhotoError extends Error {}

/** `execFileSync`, never a shell: a filename with spaces or quotes is just an argument. */
function sips(args: string[]): string {
  return execFileSync('sips', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function dimensions(path: string): { width: number; height: number } {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', path]);
  const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1]);
  if (!(width > 0 && height > 0)) throw new UnreadablePhotoError(`${basename(path)} has no readable size`);
  return { width, height };
}

/**
 * @param source  the photo as the person took it
 * @param workDir a private temp directory the caller deletes; every intermediate
 *                copy of the photo is written here and nowhere else
 * @param index   distinguishes this photo's intermediates from the others'
 */
export function preparePhoto(source: string, workDir: string, index: number): PreparedPhoto {
  if (process.platform !== 'darwin') {
    throw new Error('Preparing eval photos uses macOS `sips`, so it runs on a Mac.');
  }

  const probe = join(workDir, `${index}-probe.jpg`);
  const upright = join(workDir, `${index}-pixels.png`);
  const final = join(workDir, `${index}.jpg`);

  // 1. Orientation, read from a JPEG copy so HEIC and PNG sources work too.
  try {
    sips(['-s', 'format', 'jpeg', source, '--out', probe]);
  } catch {
    throw new UnreadablePhotoError(
      `${basename(source)} is not a photo sips can read.`,
    );
  }
  const orientation = readJpegOrientation(readFileSync(probe));

  // 2–3. Pixels as stored, then upright.
  sips(['-s', 'format', 'png', source, '--out', upright]);
  for (const step of orientationSteps(orientation)) {
    sips([...step, upright, '--out', upright]);
  }

  // 4. One resize and one JPEG encode, never upscaling – exactly as prepareUpload does.
  const { width, height } = dimensions(upright);
  const resize = Math.max(width, height) > UPLOAD_LONG_EDGE ? ['-Z', String(UPLOAD_LONG_EDGE)] : [];
  sips([
    ...resize,
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', String(Math.round(UPLOAD_QUALITY * 100)),
    upright, '--out', final,
  ]);

  // 5. Metadata off.
  const stripped = stripJpegMetadata(readFileSync(final));
  writeFileSync(final, stripped);

  // 6. Verify before anything leaves the machine.
  const left = metadataLeft(stripped);
  if (left.length > 0) {
    throw new Error(`${basename(source)} still carries ${left.join(', ')} after stripping – refusing to send it`);
  }
  const out = dimensions(final);
  if (Math.max(out.width, out.height) > UPLOAD_LONG_EDGE) {
    throw new Error(`${basename(source)} came out ${out.width}x${out.height}, larger than the app ever sends`);
  }

  return {
    base64: Buffer.from(stripped).toString('base64'),
    width: out.width,
    height: out.height,
    bytes: stripped.length,
    orientation,
  };
}
