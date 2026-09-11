/**
 * Reads the generated icon set back and checks the bytes.
 *
 * The renderer and the eye both miss the same class of problem: the Android
 * foreground layer is a white mark on transparency, so it is invisible in any
 * viewer with a white background — including the one I look at it in. An icon
 * that shipped empty would look exactly like an icon that shipped correctly.
 *
 * So this decodes the PNGs it actually wrote and asserts what is in them: the
 * dimensions each platform requires, that all three colours are present in the
 * proportions the geometry implies, and that the mark sits inside the safe zone
 * the launcher guarantees.
 *
 * Run: node scripts/brand/verify-marks.mjs
 */

import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');

import { RESERVE } from '../../src/ui/markGeometry.ts';

const INK = '0d2430';
const WHITE = 'ffffff';
const PINE = '0b7a62';

function decode(file) {
  const buf = readFileSync(join(ASSETS, file));
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);

  let at = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error(`${file}: expected 8-bit RGBA`);
    }
    if (type === 'IDAT') idat.push(data);
    at += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4 + 1;
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    // The encoder writes filter 0 on every scanline; anything else means the
    // file was not produced by render-marks.mjs.
    if (raw[y * stride] !== 0) throw new Error(`${file}: unexpected PNG filter`);
    raw.copy(px, y * width * 4, y * stride + 1, (y + 1) * stride);
  }
  return { width, height, px };
}

/** Colour counts inside one region of the grid, in 120-unit coordinates. */
function within(file, box, window = 1) {
  const { width, height, px } = decode(file);
  const span = 120 * window;
  const origin = (120 - span) / 2;
  const toPx = (g) => ((g - origin) / span) * width;
  const x0 = Math.max(0, Math.ceil(toPx(box.x0)));
  const x1 = Math.min(width - 1, Math.floor(toPx(box.x1)));
  const y0 = Math.max(0, Math.ceil(toPx(box.y0)));
  const y1 = Math.min(height - 1, Math.floor(toPx(box.y1)));

  let pine = 0;
  let cut = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      const a = px[i + 3];
      const h = px.subarray(i, i + 3).toString('hex');
      if (a >= 250 && h === PINE) pine++;
      // The knockout is the ground: opaque ink on the tiles, transparent on the
      // Android foreground where app.json supplies the ink instead.
      else if (a < 20 || (a >= 250 && h === INK)) cut++;
    }
  }
  return { pine, cut, area: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

function inspect(file) {
  const { width, height, px } = decode(file);
  const counts = new Map();
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = px[i + 3];
      if (a < 250) continue; // ignore the antialiased fringe
      const hex = px.subarray(i, i + 3).toString('hex');
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
      // The mark is everything that is not the ground.
      if (hex === WHITE || hex === PINE) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const total = width * height;
  return {
    width,
    height,
    share: (hex) => ((counts.get(hex) ?? 0) / total) * 100,
    box: { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};

console.log('\nicon.png — iOS master');
{
  const it = inspect('icon.png');
  check(it.width === 1024 && it.height === 1024, `1024×1024 (got ${it.width}×${it.height})`);
  check(it.share(INK) > 40, `ink ground present (${it.share(INK).toFixed(1)}%)`);
  check(it.share(WHITE) > 15, `white L present (${it.share(WHITE).toFixed(1)}%)`);
  check(it.share(PINE) > 5, `green reserve present (${it.share(PINE).toFixed(1)}%)`);
  const fill = (it.box.w / it.width) * 100;
  check(fill > 65 && fill < 75, `mark fills ${fill.toFixed(1)}% of the canvas`);
  // Apple rejects artwork with transparency; the OS supplies the mask.
  check(it.share(INK) + it.share(WHITE) + it.share(PINE) > 99, 'opaque to the edge, no alpha');
  const left = it.box.minX;
  const right = it.width - 1 - it.box.maxX;
  check(Math.abs(left - right) <= 2, `centred horizontally (${left}px / ${right}px)`);

  // The truck is cut out of the reserve square. If the knockout silently failed
  // the result is a plain green square, which looks completely fine — so the only
  // way to catch it is to count what is actually inside the square.
  const sq = within('icon.png', RESERVE);
  const cutShare = (sq.cut / sq.area) * 100;
  check(sq.pine > 0, `reserve square still reads green (${((sq.pine / sq.area) * 100).toFixed(1)}%)`);
  check(cutShare > 12 && cutShare < 45, `truck cut out of it (${cutShare.toFixed(1)}% of the square)`);
}

console.log('\nadaptive-icon.png — Android foreground');
{
  const it = inspect('adaptive-icon.png');
  check(it.width === 432 && it.height === 432, `432×432 (got ${it.width}×${it.height})`);
  check(it.share(INK) === 0, 'no baked ground — app.json supplies it');
  check(it.share(WHITE) > 5, `white L present (${it.share(WHITE).toFixed(1)}%)`);
  check(it.share(PINE) > 2, `green reserve present (${it.share(PINE).toFixed(1)}%)`);
  // Android guarantees only the centre 66%. A circular mask cuts the corners off
  // anything filling that square, so the mark is measured against the inscribed
  // circle — the roughest treatment a launcher can give it.
  const safe = (432 * 66) / 108;
  const cx = (it.box.minX + it.box.maxX) / 2;
  const cy = (it.box.minY + it.box.maxY) / 2;
  const reach = Math.hypot(it.box.w, it.box.h) / 2;
  check(Math.abs(cx - 216) <= 2 && Math.abs(cy - 216) <= 2, `centred (${cx}, ${cy})`);
  check(
    reach * 2 <= safe + 1,
    `mark spans ${(reach * 2).toFixed(0)}px across its diagonal, inside the ${safe.toFixed(0)}px safe circle`,
  );

  // Here the knockout must be genuinely transparent, not ink: the layer is
  // composited over app.json's background, and baking a second copy of it in
  // would defeat the point of a foreground layer.
  const sq = within('adaptive-icon.png', RESERVE, 1.63);
  const cutShare = (sq.cut / sq.area) * 100;
  check(sq.pine > 0, 'reserve square still reads green');
  check(cutShare > 12 && cutShare < 45, `truck cut through to transparency (${cutShare.toFixed(1)}%)`);
}

console.log('\nfavicon.png — browser tab');
{
  const it = inspect('favicon.png');
  check(it.width === 48 && it.height === 48, `48×48 (got ${it.width}×${it.height})`);
  check(it.share(WHITE) > 10, `white L survives at 48px (${it.share(WHITE).toFixed(1)}%)`);
  check(it.share(PINE) > 3, `green reserve survives at 48px (${it.share(PINE).toFixed(1)}%)`);
}

console.log('\nsplash.png — launch screen');
{
  const it = inspect('splash.png');
  check(it.width === 1024 && it.height === 1024, `1024×1024 (got ${it.width}×${it.height})`);
  check(it.share(WHITE) > 15, `white L present (${it.share(WHITE).toFixed(1)}%)`);
  // Rounded, unlike the iOS master: nothing masks a splash, so it has to bring
  // its own tile shape or it reads as a dark rectangle rather than as the icon.
  check(it.share(INK) < 60, `corners are transparent (ink ${it.share(INK).toFixed(1)}%)`);
}

console.log(
  failures.length === 0
    ? '\nAll checks passed.\n'
    : `\n${failures.length} check(s) failed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
