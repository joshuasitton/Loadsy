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
 * The mark is the cargo bed seen end-on, packed with four pieces and no gap
 * between them. It is the view the app's own load diagram uses, and the thing
 * Loadsy computes that no competitor does: not a truck, but the solved load
 * inside one. Someone who has built a plan in the app will recognise it as their
 * own; that is the bet, and the cost is that someone who hasn't may read it as a
 * grid.
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
 * One number sets the composition: the gap is 6, everywhere. Between the tall
 * piece and the right-hand column, between the wide piece and the two below it,
 * between those two. Every piece's size follows from that and from the pack
 * filling 18..102 — 70% of the grid, centred — so nothing is placed by eye.
 *
 * The arrangement is uneven on purpose. A 2x2 grid of equal boxes reads as a
 * folder icon; this reads as a solution — a tall piece on end, a wide one above
 * two narrow ones — which is what the packer actually returns.
 */
export const GAP = 6;

/** A mattress or wardrobe, standing on end. */
export const TALL: Box = { x0: 18, y0: 18, x1: 52, y1: 102 };
/** A wide piece across the top of the right-hand column. */
export const WIDE: Box = { x0: 58, y0: 18, x1: 102, y1: 54 };
/** The first of the two narrow pieces below it. */
export const NARROW: Box = { x0: 58, y0: 60, x1: 77, y1: 102 };
/**
 * The last piece in, and the only one that is not white.
 *
 * It fits only because everything before it was placed correctly, which is the
 * whole claim the mark makes. Ink on the green ground is 3.03:1 — clear of the
 * 3:1 WCAG floor for graphics, but not by much, and `verify-marks.mjs` pins it so
 * a palette tweak cannot quietly take it under. Against the white pieces beside
 * it the contrast is 16:1, and those shared edges are what actually define it.
 */
export const LAST: Box = { x0: 83, y0: 60, x1: 102, y1: 102 };

/** The four pieces, in load order. */
export const PIECES = [TALL, WIDE, NARROW, LAST] as const;

/** Rounded enough to read as objects, square enough to read as boxes. */
export const CORNER_R = 6;
/** The tile's own radius, used only where nothing else supplies a mask. */
export const TILE_R = 26;

export const MARK_GROUND = '#0B7A62';
export const MARK_PIECE = '#FFFFFF';
export const MARK_LAST = '#0D2430';
