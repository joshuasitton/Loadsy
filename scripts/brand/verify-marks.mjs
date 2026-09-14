/**
 * Reads the generated icon set back and checks the bytes.
 *
 * The renderer and the eye both miss the same class of problem. The Android
 * foreground layer is white and ink shapes on transparency, so it looks empty in
 * any viewer with a white background; and a mark whose gaps silently closed would
 * still look like a green square with shapes on it. An icon that shipped wrong
 * would look exactly like an icon that shipped right.
 *
 * So this decodes the PNGs it actually wrote and asserts what is in them: the
 * dimensions each platform requires, that every colour is present, that the gaps
 * between the pieces are still open, that the last piece is still the dark one,
 * and that the whole mark sits inside the safe zone the launcher guarantees.
 *
 * Run: npm run brand:icons
 */

import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { contrastRatio } from '../../src/ui/contrast.ts';
import {
  GAP,
  LAST,
  MARK_GROUND,
  MARK_LAST,
  MARK_PIECE,
  NARROW,
  TALL,
  WIDE,
} from '../../src/ui/markGeometry.ts';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');

const hex = (value) => value.slice(1).toLowerCase();
const GROUND = hex(MARK_GROUND);
const PIECE = hex(MARK_PIECE);
const DARK = hex(MARK_LAST);

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

/** Whole-image colour shares, and the bounding box of everything that is not ground. */
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
      if (px[i + 3] < 250) continue; // ignore the antialiased fringe
      const h = px.subarray(i, i + 3).toString('hex');
      counts.set(h, (counts.get(h) ?? 0) + 1);
      if (h === PIECE || h === DARK) {
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
    share: (h) => ((counts.get(h) ?? 0) / total) * 100,
    box: { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

/**
 * Colour shares inside one region of the grid, given in 120-unit coordinates.
 *
 * `window` matches the renderer's: above 1 the grid is shrunk toward the middle,
 * which is how the Android layer keeps clear of the launcher's mask.
 */
function region(file, box, window = 1) {
  const { width, height, px } = decode(file);
  const span = 120 * window;
  const origin = (120 - span) / 2;
  const toPx = (g) => ((g - origin) / span) * width;
  const x0 = Math.max(0, Math.ceil(toPx(box.x0)));
  const x1 = Math.min(width - 1, Math.floor(toPx(box.x1)));
  const y0 = Math.max(0, Math.ceil(toPx(box.y0)));
  const y1 = Math.min(height - 1, Math.floor(toPx(box.y1)));

  const tally = { ground: 0, piece: 0, dark: 0, clear: 0 };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      const a = px[i + 3];
      const h = px.subarray(i, i + 3).toString('hex');
      if (a < 20) tally.clear++;
      else if (a >= 250 && h === GROUND) tally.ground++;
      else if (a >= 250 && h === PIECE) tally.piece++;
      else if (a >= 250 && h === DARK) tally.dark++;
    }
  }
  const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  const pct = (n) => (n / area) * 100;
  return { ground: pct(tally.ground), piece: pct(tally.piece), dark: pct(tally.dark), clear: pct(tally.clear) };
}

/*
 * The three gaps, each taken as a strip down its middle — well inside the gap,
 * so antialiasing at the piece edges cannot count against it. If any of these
 * fills in, the pieces have merged and the mark has become a blob.
 */
const inset = GAP / 3;
const GAPS = [
  { name: 'tall | column', box: { x0: TALL.x1 + inset, y0: 30, x1: WIDE.x0 - inset, y1: 90 } },
  { name: 'wide / narrows', box: { x0: 64, y0: WIDE.y1 + inset, x1: 96, y1: NARROW.y0 - inset } },
  { name: 'narrow | last', box: { x0: NARROW.x1 + inset, y0: 70, x1: LAST.x0 - inset, y1: 94 } },
];

const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};

console.log('\npalette');
{
  // Pinned because it is close. The last piece is defined by its colour, and a
  // palette change that took it under 3:1 would leave a hole where a piece was.
  const dark = contrastRatio(MARK_LAST, MARK_GROUND);
  check(dark >= 3, `last piece on ground ${dark.toFixed(2)}:1 (WCAG non-text floor is 3:1)`);
  const white = contrastRatio(MARK_PIECE, MARK_GROUND);
  check(white >= 3, `pieces on ground ${white.toFixed(2)}:1`);
}

console.log('\nicon.png — iOS master');
{
  const it = inspect('icon.png');
  check(it.width === 1024 && it.height === 1024, `1024×1024 (got ${it.width}×${it.height})`);
  check(it.share(GROUND) > 40, `green ground present (${it.share(GROUND).toFixed(1)}%)`);
  check(it.share(PIECE) > 25, `white pieces present (${it.share(PIECE).toFixed(1)}%)`);
  check(it.share(DARK) > 3, `dark last piece present (${it.share(DARK).toFixed(1)}%)`);
  const fill = (it.box.w / it.width) * 100;
  check(fill > 65 && fill < 75, `mark fills ${fill.toFixed(1)}% of the canvas`);
  // Apple rejects artwork with transparency; the OS supplies the mask.
  check(it.share(GROUND) + it.share(PIECE) + it.share(DARK) > 99, 'opaque to the edge, no alpha');
  const left = it.box.minX;
  const right = it.width - 1 - it.box.maxX;
  check(Math.abs(left - right) <= 2, `centred horizontally (${left}px / ${right}px)`);

  const last = region('icon.png', LAST);
  check(last.dark > 80, `last piece is the dark one (${last.dark.toFixed(1)}% ink)`);
  for (const gap of GAPS) {
    const g = region('icon.png', gap.box);
    check(g.ground > 95, `gap ${gap.name} still open (${g.ground.toFixed(1)}% ground)`);
  }
}

console.log('\nadaptive-icon.png — Android foreground');
{
  const W = 1.63;
  const it = inspect('adaptive-icon.png');
  check(it.width === 432 && it.height === 432, `432×432 (got ${it.width}×${it.height})`);
  check(it.share(GROUND) === 0, 'no baked ground — app.json supplies it');
  check(it.share(PIECE) > 5, `white pieces present (${it.share(PIECE).toFixed(1)}%)`);
  check(it.share(DARK) > 1, `dark last piece present (${it.share(DARK).toFixed(1)}%)`);
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
  // Here the gaps must be genuinely transparent: the launcher's green shows
  // through them, and a baked-in green would be a second copy of the background.
  for (const gap of GAPS) {
    const g = region('adaptive-icon.png', gap.box, W);
    check(g.clear > 90, `gap ${gap.name} transparent (${g.clear.toFixed(1)}%)`);
  }
}

console.log('\nfavicon.png — browser tab');
{
  const it = inspect('favicon.png');
  check(it.width === 48 && it.height === 48, `48×48 (got ${it.width}×${it.height})`);
  check(it.share(PIECE) > 15, `white pieces survive at 48px (${it.share(PIECE).toFixed(1)}%)`);
  check(it.share(DARK) > 2, `dark piece survives at 48px (${it.share(DARK).toFixed(1)}%)`);
}

console.log('\nsplash.png — launch screen');
{
  const it = inspect('splash.png');
  check(it.width === 1024 && it.height === 1024, `1024×1024 (got ${it.width}×${it.height})`);
  check(it.share(PIECE) > 25, `white pieces present (${it.share(PIECE).toFixed(1)}%)`);
  // Rounded, unlike the iOS master: nothing masks a splash, so it has to bring
  // its own tile shape or it reads as a green rectangle rather than as the icon.
  check(it.share(GROUND) < 60, `corners are transparent (ground ${it.share(GROUND).toFixed(1)}%)`);
}

console.log(failures.length === 0 ? '\nAll checks passed.\n' : `\n${failures.length} check(s) failed.\n`);
process.exit(failures.length === 0 ? 0 : 1);
