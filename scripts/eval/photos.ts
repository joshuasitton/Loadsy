/**
 * The pure half of preparing eval photos: which photos belong to which room, which
 * way up a photo is, and how to take its metadata off.
 *
 * No I/O and no dependencies, so `npm test` pins every rule here with nothing
 * installed. The half that shells out to macOS `sips` lives in `prepare.ts`.
 *
 * These photos are pictures of the inside of somebody's home, taken on a phone that
 * may have recorded where the home is. Everything in this file exists so that what
 * leaves the machine is the same thing the app would send – a resized, correctly
 * oriented JPEG – and nothing more.
 */

/** Photo formats the eval accepts. HEIC because it is what an iPhone saves by default. */
export const PHOTO_PATTERN = /\.(jpe?g|png|heic|heif)$/i;

/**
 * The room a photo belongs to, from its filename.
 *
 * `living-room-1.jpg` and `living-room-2.jpg` are two views of `living-room`: exactly
 * one trailing `-<number>` is the photo number and is dropped. `bedroom.jpg` is its
 * own room, which keeps truth files written one-photo-per-room working. A room whose
 * name itself ends in a number keeps it by adding a photo number after –
 * `bedroom-2-1.jpg` is room `bedroom-2`.
 *
 * Lower-cased, because `Living-Room-1.JPG` and `living-room-2.jpg` are the same room
 * to the person who took them, and a truth key typed by hand should not have to
 * match the camera's capitalisation.
 */
export function roomKeyOf(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/-\d+$/, '')
    .toLowerCase();
}

/** The photo number in a filename, for ordering; 0 when there isn't one. */
function photoNumber(filename: string): number {
  const match = /-(\d+)\.[^.]+$/.exec(filename);
  return match ? Number(match[1]) : 0;
}

/**
 * Groups photos into rooms, each room's photos in photo-number order.
 *
 * Numeric order, not string order: `kitchen-10` comes after `kitchen-2`. The order
 * decides "Image 1", "Image 2" in the request, and the prompt refers to images by
 * number, so it has to be the order the person shot them in.
 */
export function groupPhotosByRoom(filenames: readonly string[]): Map<string, string[]> {
  const rooms = new Map<string, string[]>();
  for (const name of filenames) {
    if (name.startsWith('.') || !PHOTO_PATTERN.test(name)) continue;
    const key = roomKeyOf(name);
    const photos = rooms.get(key) ?? [];
    photos.push(name);
    rooms.set(key, photos);
  }
  for (const photos of rooms.values()) {
    photos.sort((a, b) => photoNumber(a) - photoNumber(b) || a.localeCompare(b));
  }
  return new Map([...rooms.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/* ------------------------------------------------------------------ JPEG */

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP15 = 0xef;
const COM = 0xfe;

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === SOI;
}

function u16be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i] ?? 0);
  }
  return out;
}

interface Segment {
  marker: number;
  /** Offset of the 0xFF that starts the segment. */
  start: number;
  /** Offset one past the segment's last byte. */
  end: number;
}

/** The marker segments before the image data, in order. Stops at SOS. */
function headerSegments(bytes: Uint8Array): { segments: Segment[]; sos: number } {
  const segments: Segment[] = [];
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) throw new Error('Malformed JPEG: expected a marker');
    const marker = bytes[at + 1] ?? 0;
    // 0xFF fill bytes may pad between segments.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === SOS) return { segments, sos: at };
    const end = at + 2 + u16be(bytes, at + 2);
    if (end > bytes.length) throw new Error('Malformed JPEG: segment runs past the end');
    segments.push({ marker, start: at, end });
    at = end;
  }
  throw new Error('Malformed JPEG: no image data');
}

/**
 * Where the primary image ends: one past its EOI marker.
 *
 * Inside compressed data a literal 0xFF is always stuffed as 0xFF00, so the byte
 * pair 0xFFD9 appears nowhere but the end marker – even in a progressive JPEG,
 * whose extra scans and tables sit between markers that are never 0xD9. The first
 * one after SOS is the end. Anything after it – an iPhone's embedded gain map,
 * trailing junk – is not the photograph and is dropped.
 */
function endOfImage(bytes: Uint8Array, sos: number): number {
  for (let at = sos + 2 + u16be(bytes, sos + 2); at + 1 < bytes.length; at++) {
    if (bytes[at] === 0xff && bytes[at + 1] === EOI) return at + 2;
  }
  return bytes.length;
}

/**
 * The EXIF orientation of a JPEG, 1–8. 1 – "already upright" – when there is none.
 *
 * Phones routinely store a portrait photo as landscape pixels plus this tag, and
 * macOS `sips` does not apply it: probed on this project, a photo tagged 6 resized
 * sideways. Reading it here is what lets the eval rotate the pixels before the tag
 * is stripped.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  if (!isJpeg(bytes)) return 1;
  let parsed: { segments: Segment[] };
  try {
    parsed = headerSegments(bytes);
  } catch {
    return 1;
  }
  for (const segment of parsed.segments) {
    if (segment.marker !== APP1 || ascii(bytes, segment.start + 4, 6) !== 'Exif\0\0') continue;
    const tiff = segment.start + 10;
    const little = ascii(bytes, tiff, 2) === 'II';
    const read16 = (at: number) =>
      little ? (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) : u16be(bytes, at);
    const read32 = (at: number) =>
      little
        ? ((bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16) | ((bytes[at + 3] ?? 0) << 24)) >>> 0
        : ((u16be(bytes, at) << 16) | u16be(bytes, at + 2)) >>> 0;
    const ifd = tiff + read32(tiff + 4);
    const count = read16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > segment.end) break;
      if (read16(entry) === 0x0112) {
        const value = read16(entry + 8);
        return value >= 1 && value <= 8 ? value : 1;
      }
    }
  }
  return 1;
}

/**
 * The `sips` invocations that turn stored pixels upright, one array per call.
 *
 * Separate calls, not one, because the two-step orientations are "mirror, then
 * rotate", and `sips` promises nothing about the order of operations within a
 * single invocation. `-r` rotates clockwise.
 *
 * Phone cameras write 1, 3, 6 and 8. The mirrored four are here for completeness,
 * following the TIFF definitions.
 */
export function orientationSteps(orientation: number): string[][] {
  switch (orientation) {
    case 2: return [['-f', 'horizontal']];
    case 3: return [['-r', '180']];
    case 4: return [['-f', 'vertical']];
    case 5: return [['-f', 'horizontal'], ['-r', '270']];
    case 6: return [['-r', '90']];
    case 7: return [['-f', 'horizontal'], ['-r', '90']];
    case 8: return [['-r', '270']];
    default: return [];
  }
}

/**
 * The same JPEG with every metadata block removed except the two that carry
 * nothing about the person.
 *
 * Kept: APP0 (JFIF, a format header) and an APP2 that is an ICC colour profile.
 * Dropped: APP1 (EXIF – including GPS and the orientation tag – and XMP), every
 * other APPn (IPTC, Photoshop, MPF and its embedded images), comments, and anything
 * after the primary image's end marker.
 *
 * Dropping the orientation tag is not only for privacy. `sips` carries the original
 * tag into its output even after the pixels have been rotated, so a file that kept
 * it would be turned a second time by anything that honours it.
 *
 * Operates on the header only: the compressed image data is copied byte for byte.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (!isJpeg(bytes)) throw new Error('Not a JPEG');
  const { segments, sos } = headerSegments(bytes);
  const end = endOfImage(bytes, sos);

  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  for (const segment of segments) {
    const { marker } = segment;
    const isApp = marker >= APP0 && marker <= APP15;
    const iccProfile = marker === APP2 && ascii(bytes, segment.start + 4, 12) === 'ICC_PROFILE\0';
    if (marker === COM) continue;
    if (isApp && marker !== APP0 && !iccProfile) continue;
    kept.push(bytes.subarray(segment.start, segment.end));
  }
  kept.push(bytes.subarray(sos, end));

  const out = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of kept) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** What identifying metadata a JPEG still carries. Used to verify before sending. */
export function metadataLeft(bytes: Uint8Array): string[] {
  if (!isJpeg(bytes)) return ['not a JPEG'];
  const found: string[] = [];
  const { segments } = headerSegments(bytes);
  for (const segment of segments) {
    const { marker } = segment;
    if (marker === APP1) found.push(ascii(bytes, segment.start + 4, 4) === 'Exif' ? 'EXIF' : 'XMP');
    else if (marker === COM) found.push('comment');
    else if (marker > APP2 && marker <= APP15) found.push(`APP${marker - APP0}`);
    else if (marker === APP2 && ascii(bytes, segment.start + 4, 12) !== 'ICC_PROFILE\0') found.push('APP2');
  }
  return found;
}

/**
 * Image tokens for one image of this size on a high-resolution Claude model.
 *
 * Width × height ÷ 750, capped. An estimate for the dry run's cost line – the live
 * run reports the real count from the API's `usage`.
 */
export function estimateImageTokens(width: number, height: number): number {
  return Math.min(Math.ceil((width * height) / 750), 4784);
}
