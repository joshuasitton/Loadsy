/**
 * Draws the Loadsy mark and writes the app icon set.
 *
 * There is no SVG rasteriser on this machine — no rsvg-convert, no ImageMagick,
 * no cairosvg — and adding one as a dependency to produce four static files that
 * change once a year is a bad trade. So the mark is defined as geometry here and
 * rasterised directly: supersampled coverage into an RGBA buffer, then PNG
 * encoded with node:zlib, which ships with the runtime.
 *
 * The upside of that constraint is that the mark has exactly one definition, in
 * numbers, and every asset is generated from it. There is no master file that can
 * drift from the exported PNGs, and no step where somebody re-exports one size
 * and forgets another.
 *
 * The geometry itself is NOT here — it lives in src/ui/markGeometry.ts, which
 * the app's own <Mark /> also reads, so the icon and the in-app logo cannot
 * disagree. This file only knows how to turn that geometry into pixels.
 *
 * Run: npm run brand:icons
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');

import {
  BAR,
  CORNER_R,
  FOOT,
  GRID as G,
  MARK_INK,
  MARK_PINE,
  MARK_WHITE,
  RESERVE,
  TILE_R,
  TRUCK_BODY,
  TRUCK_CAB,
  TRUCK_R,
  TRUCK_WHEELS,
} from '../../src/ui/markGeometry.ts';

/* -------------------------------------------------------------------- shape */

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

const INK = hex(MARK_INK);
const WHITE = hex(MARK_WHITE);
const PINE = hex(MARK_PINE);

/**
 * The five convex corners, each with the direction the shape extends into.
 *
 * Derived from the same boxes the SVG path is, so a change to the geometry moves
 * the raster and the in-app mark together.
 */
const CONVEX = [
  { x: BAR.x0, y: BAR.y0, sx: 1, sy: 1 },
  { x: BAR.x1, y: BAR.y0, sx: -1, sy: 1 },
  { x: FOOT.x1, y: FOOT.y0, sx: -1, sy: 1 },
  { x: FOOT.x1, y: FOOT.y1, sx: -1, sy: -1 },
  { x: FOOT.x0, y: FOOT.y1, sx: 1, sy: -1 },
];

const inRect = (x, y, r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

function inL(x, y) {
  if (!inRect(x, y, BAR) && !inRect(x, y, FOOT)) return false;
  for (const c of CONVEX) {
    // Inside the corner's r-by-r box, the shape is the quarter disc only.
    const dx = (x - c.x) * c.sx;
    const dy = (y - c.y) * c.sy;
    if (dx < 0 || dx > CORNER_R || dy < 0 || dy > CORNER_R) continue;
    const cx = CORNER_R - dx;
    const cy = CORNER_R - dy;
    if (cx * cx + cy * cy > CORNER_R * CORNER_R) return false;
  }
  return true;
}

function inRoundedRect(x, y, r, radius) {
  if (!inRect(x, y, r)) return false;
  if (radius <= 0) return true;
  const nx = Math.min(Math.max(x, r.x0 + radius), r.x1 - radius);
  const ny = Math.min(Math.max(y, r.y0 + radius), r.y1 - radius);
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * The colour at one point on the grid, or null for transparent.
 *
 * `tile` decides whether the ground is painted at all: the Android foreground
 * layer and the splash both sit on a colour the OS supplies, so they ship the
 * mark alone.
 */
/** The cut-out truck: two overlapping rounded boxes and two wheels. */
function inTruck(x, y) {
  if (inRoundedRect(x, y, TRUCK_BODY, TRUCK_R)) return true;
  if (inRoundedRect(x, y, TRUCK_CAB, TRUCK_R)) return true;
  for (const wheel of TRUCK_WHEELS) {
    const dx = x - wheel.cx;
    const dy = y - wheel.cy;
    if (dx * dx + dy * dy <= wheel.r * wheel.r) return true;
  }
  return false;
}

function sample(x, y, { ground, tileRadius }) {
  // The knockout takes the ground's colour, which is `null` on the Android layer
  // — so there it is genuinely transparent and app.json's ink shows through,
  // rather than baking a second copy of the background into the foreground.
  if (inRoundedRect(x, y, RESERVE, CORNER_R)) return inTruck(x, y) ? ground : PINE;
  if (inL(x, y)) return WHITE;
  if (ground === null) return null;
  if (tileRadius <= 0) return ground;
  const full = { x0: 0, y0: 0, x1: G, y1: G };
  return inRoundedRect(x, y, full, tileRadius) ? ground : null;
}

/* --------------------------------------------------------------- rasterise */

/** Sub-samples per axis. 4 puts 16 samples in every output pixel. */
const SS = 4;

/**
 * @param opts.window  How many grid-widths the output covers. 1 renders the tile
 *   edge to edge; above 1 the mark shrinks toward the middle, which is how the
 *   Android layer keeps clear of the launcher's mask.
 */
function raster(size, opts) {
  const px = Buffer.alloc(size * size * 4);
  const win = opts.window ?? 1;
  const span = G * win;
  const origin = (G - span) / 2;
  const step = span / (size * SS);
  const half = step / 2;

  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        const y = origin + (py * SS + sy) * step + half;
        for (let sx = 0; sx < SS; sx++) {
          const x = origin + (pxi * SS + sx) * step + half;
          const c = sample(x, y, opts);
          if (c === null) continue;
          // Premultiplied, so a shape meeting transparency does not fringe with
          // its own colour at half strength.
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const i = (py * size + pxi) * 4;
      if (a === 0) continue;
      px[i] = Math.round(r / a);
      px[i + 1] = Math.round(g / a);
      px[i + 2] = Math.round(b / a);
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return px;
}

/* --------------------------------------------------------------- PNG encode */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // Every scanline gets filter byte 0. Flat colour deflates well enough that a
  // filter search would buy bytes nobody is counting.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const at = y * (size * 4 + 1);
    raw[at] = 0;
    pixels.copy(raw, at + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ outputs */

const OUTPUTS = [
  {
    file: 'icon.png',
    size: 1024,
    opts: { ground: INK, tileRadius: 0 },
    why: 'iOS master. Square to the edge and no alpha in the artwork — the OS applies its own mask, and a pre-rounded corner gets rounded twice.',
  },
  {
    file: 'adaptive-icon.png',
    size: 432,
    opts: { ground: null, tileRadius: 0, window: 1.63 },
    why: "Android foreground layer. Mark only — the ground comes from app.json — and pulled in until its DIAGONAL fits the 264px circle Android guarantees, which puts the mark at about 43% of the canvas against 70% on iOS. That gap is not a mistake: a launcher may mask to a circle, and a square mark inscribed in a circle is smaller than a square mark inscribed in a square by a factor of root two. Sized to survive the roundest mask rather than the kindest.",
  },
  {
    file: 'favicon.png',
    size: 48,
    opts: { ground: INK, tileRadius: 0 },
    why: 'Browser tab. Square to the edge, because at 48px a corner radius costs more of the mark than it buys.',
  },
  {
    file: 'splash.png',
    size: 1024,
    opts: { ground: INK, tileRadius: TILE_R },
    why: 'Launch screen, drawn at 200pt on white. Rounded here because nothing masks it — it should read as the icon, so the launch is the icon growing into the app.',
  },
];

let total = 0;
for (const out of OUTPUTS) {
  const buf = png(out.size, raster(out.size, out.opts));
  writeFileSync(join(ASSETS, out.file), buf);
  total += buf.length;
  console.log(`${out.file.padEnd(18)} ${String(out.size).padStart(4)}px  ${String(buf.length).padStart(6)} bytes`);
}
console.log(`\n${OUTPUTS.length} files, ${(total / 1024).toFixed(1)} KB total`);
