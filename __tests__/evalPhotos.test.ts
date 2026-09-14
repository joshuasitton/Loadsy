import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateImageTokens,
  groupPhotosByRoom,
  metadataLeft,
  orientationSteps,
  readJpegOrientation,
  roomKeyOf,
  stripJpegMetadata,
} from '../scripts/eval/photos';

/*
 * The eval sends photos of the inside of somebody's home. These tests pin the rules
 * that make what leaves the machine the same thing the app would send – right room,
 * right way up, no location – because each of them fails silently: a sideways photo
 * or a GPS tag looks like any other upload.
 */

/* ------------------------------------------------------------- fixtures */

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A TIFF block holding Orientation, and a GPS pointer so there is location to leak. */
function exifPayload(orientation: number, little: boolean): number[] {
  const bytes: number[] = [];
  const u16 = (n: number) => (little ? [n & 0xff, (n >> 8) & 0xff] : [(n >> 8) & 0xff, n & 0xff]);
  const u32 = (n: number) =>
    little
      ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
      : [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  bytes.push(...text(little ? 'II' : 'MM'), ...u16(42), ...u32(8));
  bytes.push(...u16(2));
  bytes.push(...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0); // Orientation
  bytes.push(...u16(0x8825), ...u16(4), ...u32(1), ...u32(38)); // GPSInfo → offset 38
  bytes.push(...u32(0));
  bytes.push(...u16(1), ...u16(0x0001), ...u16(2), ...u32(2), ...text('N'), 0, 0, 0, ...u32(0)); // GPS: LatitudeRef "N"
  return [...text('Exif\0\0'), ...bytes];
}

/** Compressed "image data" containing a stuffed 0xFF00 and a restart marker, which must survive intact. */
const SCAN_DATA = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd3, 0x56];

function jpeg(parts: { exif?: { orientation: number; little: boolean }; extras?: boolean; trailing?: boolean } = {}) {
  return new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe0, [...text('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...(parts.exif ? segment(0xe1, exifPayload(parts.exif.orientation, parts.exif.little)) : []),
    ...(parts.extras
      ? [
          ...segment(0xe2, [...text('ICC_PROFILE\0'), 1, 1, 9, 9]),
          ...segment(0xe2, [...text('MPF\0'), 7, 7, 7]),
          ...segment(0xed, [...text('Photoshop 3.0\0'), 5]),
          ...segment(0xfe, text('taken at 12 Elm St')),
        ]
      : []),
    ...segment(0xdb, [0, 1, 2, 3]), // DQT
    ...segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]), // SOF0
    ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), // SOS header
    ...SCAN_DATA,
    0xff, 0xd9,
    ...(parts.trailing ? text('EMBEDDED GAIN MAP') : []),
  ]);
}

function includes(haystack: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/* ------------------------------------------------------------ grouping */

test('photos named by room group into one request per room', () => {
  const rooms = groupPhotosByRoom([
    'living-room-2.jpg',
    'living-room-1.JPG',
    'bedroom.jpg',
    'kitchen-10.heic',
    'kitchen-2.HEIC',
    'truth.json',
    '.DS_Store',
    'notes.txt',
  ]);
  assert.deepEqual([...rooms.keys()], ['bedroom', 'kitchen', 'living-room']);
  assert.deepEqual(rooms.get('living-room'), ['living-room-1.JPG', 'living-room-2.jpg']);
});

test('photos are numbered in the order they were shot, not alphabetically', () => {
  // The request labels them "Image 1", "Image 2" and the prompt refers to images by
  // number; string order would put kitchen-10 before kitchen-2.
  assert.deepEqual(groupPhotosByRoom(['kitchen-10.jpg', 'kitchen-2.jpg', 'kitchen-1.jpg']).get('kitchen'), [
    'kitchen-1.jpg',
    'kitchen-2.jpg',
    'kitchen-10.jpg',
  ]);
});

test('a room named with a number keeps it, and old one-photo truth keys still resolve', () => {
  assert.equal(roomKeyOf('bedroom-2-1.jpg'), 'bedroom-2');
  assert.equal(roomKeyOf('bedroom.jpg'), 'bedroom');
  assert.equal(roomKeyOf('Living-Room'), 'living-room');
});

test('HEIC counts as a photo, because it is what an iPhone saves by default', () => {
  assert.equal(groupPhotosByRoom(['den-1.heic', 'den-2.heif']).get('den')?.length, 2);
});

/* --------------------------------------------------------- orientation */

test('the EXIF orientation is read in both byte orders', () => {
  assert.equal(readJpegOrientation(jpeg({ exif: { orientation: 6, little: true } })), 6);
  assert.equal(readJpegOrientation(jpeg({ exif: { orientation: 8, little: false } })), 8);
});

test('a photo with no orientation tag, or no JPEG at all, is treated as upright', () => {
  assert.equal(readJpegOrientation(jpeg()), 1);
  assert.equal(readJpegOrientation(new Uint8Array([1, 2, 3, 4])), 1);
  // The 22-byte placeholder files that shipped in eval-photos/.
  assert.equal(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])), 1);
});

test('each orientation maps to the sips steps that stand it upright', () => {
  // sips rotates clockwise. Phones write 1, 3, 6 and 8; the mirrored four follow
  // the TIFF definitions and are run as separate calls, flip first.
  assert.deepEqual(orientationSteps(1), []);
  assert.deepEqual(orientationSteps(3), [['-r', '180']]);
  assert.deepEqual(orientationSteps(6), [['-r', '90']]);
  assert.deepEqual(orientationSteps(8), [['-r', '270']]);
  assert.deepEqual(orientationSteps(2), [['-f', 'horizontal']]);
  assert.deepEqual(orientationSteps(4), [['-f', 'vertical']]);
  assert.deepEqual(orientationSteps(5), [['-f', 'horizontal'], ['-r', '270']]);
  assert.deepEqual(orientationSteps(7), [['-f', 'horizontal'], ['-r', '90']]);
  assert.deepEqual(orientationSteps(0), []);
});

/* ------------------------------------------------------------ metadata */

test('stripping removes location and every other identifying block', () => {
  const original = jpeg({ exif: { orientation: 6, little: true }, extras: true });
  assert.deepEqual(metadataLeft(original).sort(), ['APP13', 'APP2', 'EXIF', 'comment'].sort());

  const stripped = stripJpegMetadata(original);
  assert.deepEqual(metadataLeft(stripped), []);
  assert.equal(includes(stripped, text('Exif')), false, 'EXIF, and the GPS inside it, must be gone');
  assert.equal(includes(stripped, text('12 Elm St')), false, 'comments must be gone');
  assert.equal(includes(stripped, text('MPF')), false, 'embedded-image index must be gone');
});

test('stripping drops the orientation tag, so the rotated pixels are not turned twice', () => {
  // sips carries the original tag into its output after rotating the pixels. A file
  // that kept it would be rotated again by anything that honours the tag.
  const stripped = stripJpegMetadata(jpeg({ exif: { orientation: 6, little: true } }));
  assert.equal(readJpegOrientation(stripped), 1);
});

test('stripping keeps the colour profile and copies the image data byte for byte', () => {
  const stripped = stripJpegMetadata(jpeg({ extras: true }));
  assert.equal(includes(stripped, text('ICC_PROFILE')), true);
  assert.equal(includes(stripped, [...SCAN_DATA, 0xff, 0xd9]), true, 'compressed data, stuffed bytes and restart marker intact');
  assert.deepEqual([...stripped.subarray(0, 2)], [0xff, 0xd8]);
});

test('anything after the end of the photograph is dropped', () => {
  const stripped = stripJpegMetadata(jpeg({ trailing: true }));
  assert.equal(includes(stripped, text('GAIN MAP')), false);
  assert.deepEqual([...stripped.subarray(stripped.length - 2)], [0xff, 0xd9]);
});

test('stripping refuses something that is not a JPEG rather than sending it', () => {
  assert.throws(() => stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47])));
});

/* -------------------------------------------------------------- tokens */

test('image token estimate follows pixels ÷ 750, and is capped', () => {
  assert.equal(estimateImageTokens(1568, 1176), 2459);
  assert.equal(estimateImageTokens(10_000, 10_000), 4784);
});
