/**
 * The Loadsy mark, as numbers.
 *
 * One definition, consumed by two very different renderers: `src/ui/Mark.tsx`
 * draws it as SVG inside the app, and `scripts/brand/render-marks.mjs`
 * rasterises it into the icon set. Neither owns it, so the icon on the home
 * screen and the mark on the sign-in screen cannot drift apart — which is the
 * usual failure of a logo that exists as an exported PNG and a hand-rewritten
 * copy in the code.
 *
 * The mark is an L built from two cargo blocks: a tall piece standing on end and
 * a heavy base, low and forward, which is the profile of a correctly loaded bed.
 * The square fills the notch the L leaves. That notch is the point — it is the
 * safety reserve the sizing model holds back, so the brand colour marks the space
 * you were right not to fill.
 */

/** Every coordinate below is on this square. Assets scale it; nothing re-draws it. */
export const GRID = 120;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/*
 * Two numbers set the whole composition.
 *
 * The stroke is 32 — the bar's width and the foot's height are the same, so the
 * mark reads as two blocks rather than as a letter drawn with a pen. And the gap
 * is 8 everywhere: bar to reserve, reserve to foot. That makes the reserve
 * exactly the notch minus one gap, 44 square, rather than a square placed by eye.
 *
 * Together they occupy 18..102: 70% of the grid, centred. An icon filling much
 * less than that reads as timid beside its neighbours, which is the only place an
 * icon is ever seen.
 */
export const BAR: Box = { x0: 18, y0: 18, x1: 50, y1: 102 };
export const FOOT: Box = { x0: 18, y0: 70, x1: 102, y1: 102 };
export const RESERVE: Box = { x0: 58, y0: 18, x1: 102, y1: 62 };

export const CORNER_R = 8;
/** The tile's own radius, used only where nothing else supplies a mask. */
export const TILE_R = 26;

export const MARK_INK = '#0D2430';
export const MARK_WHITE = '#FFFFFF';
export const MARK_PINE = '#0B7A62';

interface Vertex {
  x: number;
  y: number;
  /** 0 leaves the corner sharp. */
  r: number;
}

/**
 * The L's outline, clockwise.
 *
 * Five corners are convex and rounded. The sixth — where the bar meets the foot —
 * is concave and deliberately left sharp: a fillet there reads as a fold, and the
 * whole idea is two blocks stacked.
 */
export function markVertices(): Vertex[] {
  return [
    { x: BAR.x0, y: BAR.y0, r: CORNER_R },
    { x: BAR.x1, y: BAR.y0, r: CORNER_R },
    { x: BAR.x1, y: FOOT.y0, r: 0 },
    { x: FOOT.x1, y: FOOT.y0, r: CORNER_R },
    { x: FOOT.x1, y: FOOT.y1, r: CORNER_R },
    { x: FOOT.x0, y: FOOT.y1, r: CORNER_R },
  ];
}

const trim = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * An SVG path for a rectilinear polygon with per-vertex corner radii.
 *
 * True circular arcs rather than quadratic approximations, because the raster
 * side rounds its corners with a distance test against a circle. A `Q` would be
 * close enough to look right on its own and subtly wrong beside the icon.
 */
export function markPath(): string {
  const pts = markVertices();
  const n = pts.length;
  const parts: string[] = [];
  // Indexed access is checked in this project, and every index here is already
  // reduced mod n. `at` carries that guarantee into the type rather than
  // scattering non-null assertions through the loop.
  const at = (i: number): Vertex => {
    const v = pts[((i % n) + n) % n];
    if (!v) throw new Error('mark geometry is empty');
    return v;
  };

  for (let i = 0; i < n; i++) {
    const prev = at(i - 1);
    const cur = at(i);
    const next = at(i + 1);
    const toPrev = unit(cur, prev);
    const toNext = unit(cur, next);
    const enter = { x: cur.x + toPrev.x * cur.r, y: cur.y + toPrev.y * cur.r };
    const leave = { x: cur.x + toNext.x * cur.r, y: cur.y + toNext.y * cur.r };

    parts.push(`${i === 0 ? 'M' : 'L'}${trim(enter.x)},${trim(enter.y)}`);
    if (cur.r > 0) {
      // sweep 1: the outline runs clockwise, so every convex corner turns right.
      parts.push(`A${cur.r},${cur.r} 0 0 1 ${trim(leave.x)},${trim(leave.y)}`);
    }
  }
  parts.push('Z');
  return parts.join(' ');
}

function unit(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}
