/**
 * Where every individual piece ends up in the truck, and which way round.
 *
 * The zone diagram answers "roughly how much of the truck does each group take".
 * This answers the question a person standing at the tailgate actually has: where
 * does THIS go, and how is it turned.
 *
 * ## What a rectangle means
 *
 * The picture is a side elevation — looking through the truck's left wall, cab on
 * the left, tailgate on the right. Each piece is drawn as:
 *
 *   height = how tall it stands **in the pose it travels in**
 *   width  = how much truck LENGTH it consumes, which is its depth scaled by the
 *            share of the truck's width it takes up
 *
 * That second one is the part worth stating plainly. Two nightstands side by side
 * occupy the same slice of truck, so each is drawn using half the depth it would
 * alone. The consequence is that a rectangle's AREA is exactly proportional to
 * the item's volume, and the drawn load fills exactly as much of the outline as
 * the real load fills of the truck. The picture is quantitative, not decorative.
 *
 * A plan view of the floor would have been the wrong drawing: it ignores the six
 * or seven feet of height every load uses, and would show most of a real move as
 * "not fitting". An elevation shows the stacking, which is what loading actually
 * is.
 *
 * ## Why the pose matters this much
 *
 * A queen mattress laid flat is 80 × 60 on the deck and 12 high — it eats a third
 * of a 15-footer's floor and holds nothing up. On its long edge it is 80 × 12 and
 * 60 tall, and the bed frame fits beside it. That difference is a truck size, and
 * it is why `pose` lives on the same guidance rule that writes the instruction.
 *
 * ## What the bed numbers are
 *
 * U-Haul's published interior dimensions. They do not multiply out to the
 * published cubic-foot capacities, in both directions, and both discrepancies are
 * real rather than sloppy:
 *
 *   - The 10' quotes 402 ft³ against a box of 377, because the capacity counts the
 *     over-cab compartment the deck dimensions do not describe.
 *   - The 15', 20' and 26' quote LESS than their box, because wheel wells eat into
 *     the deck at the sides.
 *
 * The drawing is the deck. `TRUCK_CAPACITY` in domain/truck.ts stays the number
 * the sizing decision is made from, and this file must not quietly replace it.
 *
 * ## What this is not
 *
 * An illustration, not a solver. A real loader turns things, slides a box into a
 * gap and stands a lamp inside a wardrobe box. This places pieces in the order the
 * plan prescribes, first fit, lowest gap — and says so when one runs past the
 * tailgate rather than pretending otherwise.
 *
 * Pure TypeScript, no React and no I/O.
 */

import { poseForItem, type TravelPose } from '../domain/itemGuidance';
import { buildLoadSteps, type LoadStepOrder } from '../domain/packing';
import type { InventoryItem, TruckSize } from '../domain/types';

export interface BedDimensions {
  /** Cab end to tailgate. */
  lengthIn: number;
  /** Wall to wall. */
  widthIn: number;
  /** Deck to roof. */
  heightIn: number;
}

/** U-Haul published interior dimensions, converted to inches. */
export const TRUCK_BED: Record<TruckSize, BedDimensions> = {
  // 9'6" x 5'7" x 4'8"
  van: { lengthIn: 114, widthIn: 67, heightIn: 56 },
  // 9'11" x 6'3" x 6'1"
  '10ft': { lengthIn: 119, widthIn: 75, heightIn: 73 },
  // 15' x 7'8" x 7'2"
  '15ft': { lengthIn: 180, widthIn: 92, heightIn: 86 },
  // 19'6" x 7'8" x 7'2"
  '20ft': { lengthIn: 234, widthIn: 92, heightIn: 86 },
  // 26'2" x 8'2" x 8'3"
  '26ft': { lengthIn: 314, widthIn: 98, heightIn: 99 },
};

export interface Footprint {
  /** Extent along the truck, cab to door. */
  alongIn: number;
  /** Extent across the truck, wall to wall. */
  acrossIn: number;
  /** Extent up from the deck. */
  tallIn: number;
}

/** The three dimensions of a piece, reordered by how it travels. */
export function poseFootprint(
  { lengthIn, widthIn, heightIn }: InventoryItem['dimensions'],
  pose: TravelPose,
): Footprint {
  switch (pose) {
    // Resting on its length × height face: the long edge is on the deck.
    case 'onEdge':
      return { alongIn: lengthIn, acrossIn: heightIn, tallIn: widthIn };
    // Stood on its smallest face, the length pointing at the roof.
    case 'onEnd':
      return { alongIn: widthIn, acrossIn: heightIn, tallIn: lengthIn };
    // Sitting the way it sits in a room.
    case 'upright':
    case 'flat':
      return { alongIn: widthIn, acrossIn: lengthIn, tallIn: heightIn };
  }
}

export interface Placement {
  itemId: string;
  name: string;
  /** The pose it is actually drawn in, which may not be the one it prefers. */
  pose: TravelPose;
  /**
   * The pose its guidance asks for, when the truck would not take it.
   *
   * A 96-inch rolled rug cannot stand on end under a 7'2" roof, and a nine-foot
   * sectional cannot stand on its arm. Both instructions are right in a room and
   * impossible in a 15-footer. Rather than declaring the piece unplaceable, the
   * packer turns it down the way a person would — and says so, because "stand it
   * on end" printed beside a picture of it lying down is the contradiction this
   * whole file exists to avoid.
   */
  posedDownFrom: TravelPose | null;
  /** Which load step this piece belongs to, 1 nearest the cab. */
  step: LoadStepOrder;
  /** Inches from the cab wall to the left edge of the drawn rectangle. */
  xIn: number;
  /** Inches from the deck to the underside. */
  yIn: number;
  /** Drawn length: depth scaled by the share of the truck's width it uses. */
  lengthUsedIn: number;
  /** True standing height in its travel pose. */
  heightIn: number;
  footprint: Footprint;
  cubicFeet: number;
}

export interface LoadPlan {
  bed: BedDimensions;
  placements: Placement[];
  /**
   * Pieces the drawing could not place.
   *
   * Reported rather than hidden. The truck recommendation is made from volume with
   * a 15% safety reserve and is the number to trust; this packer is tidier than a
   * person but worse than a good loader, so a few items here mean the diagram ran
   * out of room, not that the move will not fit. Saying so is the honest version
   * of a picture that cannot show everything.
   */
  overflow: { itemId: string; name: string; reason: 'tooBig' | 'noRoom' }[];
  /** Inches of truck length the drawn load reaches. */
  usedLengthIn: number;
}

/** One flat-topped run of the skyline: everything from `x` to `x + width` is at `y`. */
interface Segment {
  x: number;
  width: number;
  y: number;
}

/**
 * Lays the whole inventory out, in the order the packing plan prescribes.
 *
 * A skyline packer: each piece goes at the lowest place it fits, leftmost among
 * ties. That is a fair model of how a truck actually fills — things sit on the
 * deck until the deck is used, then on top of what is already there — and it
 * keeps the order the plan prints, which a smarter packer would have to break.
 *
 * Deterministic for a given item set: it consumes `buildLoadSteps`, which is
 * itself deterministic, and nothing here reads a clock or a random source.
 */
export function planLoad(items: InventoryItem[], size: TruckSize): LoadPlan {
  const bed = TRUCK_BED[size];
  const byId = new Map(items.map((item) => [item.id, item]));

  // The order the plan prints. Drawing any other order would show a truck nobody
  // was told how to pack.
  const ordered = buildLoadSteps(items).flatMap((step) =>
    step.itemIds.flatMap((id) => {
      const item = byId.get(id);
      return item ? [{ item, step: step.order as LoadStepOrder }] : [];
    }),
  );

  let skyline: Segment[] = [{ x: 0, width: bed.lengthIn, y: 0 }];
  const placements: Placement[] = [];
  const overflow: LoadPlan['overflow'] = [];

  for (const { item, step } of ordered) {
    const wanted = poseForItem(item);
    const options = fitPoses(item.dimensions, wanted, bed);

    // Nothing about this piece fits under the roof or between the walls in any
    // pose. Left visible rather than dropped: a mis-measured piece is a
    // plausibility problem the inventory screen already flags, and quietly
    // removing it from the drawing would hide the one place somebody might notice.
    if (options.length === 0) {
      overflow.push({ itemId: item.id, name: item.name, reason: 'tooBig' });
      continue;
    }

    /*
     * The preferred pose first, then flatter ones if the gap left will not take it.
     *
     * A boxed floor lamp is 60 inches standing and 14 lying down. Late in a load
     * there is rarely a five-foot clear column left, and a person does the obvious
     * thing: lays it on top. Refusing to, and reporting the lamp as unplaceable in
     * a truck the sizing logic says is 44% empty, would be the packer being
     * pedantic rather than the truck being full.
     */
    let placed: { pose: TravelPose; footprint: Footprint; spot: { x: number; y: number } } | null =
      null;
    for (const option of options) {
      const used = (option.footprint.alongIn * option.footprint.acrossIn) / bed.widthIn;
      const found = lowestFit(skyline, used, option.footprint.tallIn, bed);
      if (found) {
        placed = { ...option, spot: found };
        break;
      }
    }

    if (placed === null) {
      overflow.push({ itemId: item.id, name: item.name, reason: 'noRoom' });
      continue;
    }

    const { pose, footprint, spot } = placed;
    const lengthUsedIn = (footprint.alongIn * footprint.acrossIn) / bed.widthIn;

    placements.push({
      itemId: item.id,
      name: item.name,
      pose,
      posedDownFrom: pose === wanted ? null : wanted,
      step,
      xIn: spot.x,
      yIn: spot.y,
      lengthUsedIn,
      heightIn: footprint.tallIn,
      footprint,
      cubicFeet: item.cubicFeet,
    });

    skyline = raise(skyline, spot.x, lengthUsedIn, spot.y + footprint.tallIn);
  }

  const usedLengthIn = placements.reduce(
    (max, placement) => Math.max(max, placement.xIn + placement.lengthUsedIn),
    0,
  );

  return { bed, placements, overflow, usedLengthIn: round2(usedLengthIn) };
}

/**
 * The pose and turn this piece can actually be loaded in, or null if none.
 *
 * Two things are tried, in this order, because that is the order a person tries
 * them. First the pose its guidance asks for; then the flatter poses, since
 * anything that will not stand up gets laid down. And within each pose, both
 * ways round on the deck — turning a long piece to run with the truck rather
 * than across it is free, and it is the difference between a rolled rug fitting
 * and a rolled rug being declared impossible.
 */
function fitPoses(
  dimensions: InventoryItem['dimensions'],
  wanted: TravelPose,
  bed: BedDimensions,
): { pose: TravelPose; footprint: Footprint }[] {
  const order: TravelPose[] = [wanted, 'onEdge', 'upright'];
  const seen = new Set<TravelPose>();
  const out: { pose: TravelPose; footprint: Footprint }[] = [];

  for (const pose of order) {
    if (seen.has(pose)) continue;
    seen.add(pose);

    const base = poseFootprint(dimensions, pose);
    if (base.tallIn > bed.heightIn) continue;

    // Prefer the turn that uses less of the truck's width, so more fits beside it.
    const turns: Footprint[] = [
      { alongIn: base.alongIn, acrossIn: base.acrossIn, tallIn: base.tallIn },
      { alongIn: base.acrossIn, acrossIn: base.alongIn, tallIn: base.tallIn },
    ].sort((a, b) => a.acrossIn - b.acrossIn);

    const fits = turns.find((turn) => turn.acrossIn <= bed.widthIn);
    if (fits) out.push({ pose, footprint: fits });
  }
  return out;
}

/** The lowest position a `width × height` piece fits, leftmost among equals. */
function lowestFit(
  skyline: readonly Segment[],
  width: number,
  height: number,
  bed: BedDimensions,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;

  /*
   * Both edges of every run, not just the left one.
   *
   * Left-aligning only is what a naive skyline does, and it leaves a sliver of
   * dead width at the right-hand end of every shelf — which on a real inventory
   * added up to a whole floor lamp that "did not fit" in a truck the sizing
   * logic said was 44% empty. Trying the right-aligned position too lets a piece
   * tuck into the end of a run, which is exactly what a person does with the last
   * box on a shelf.
   */
  const candidates: number[] = [];
  for (const segment of skyline) {
    candidates.push(segment.x);
    const rightAligned = segment.x + segment.width - width;
    if (rightAligned > 0) candidates.push(rightAligned);
  }

  for (const x of candidates) {
    if (x < -1e-9 || x + width > bed.lengthIn + 1e-9) continue;

    // The piece rests on the highest thing under its whole span, not just on the
    // segment it starts at — otherwise it would be drawn floating through a
    // taller neighbour.
    const y = topUnder(skyline, x, width);
    if (y + height > bed.heightIn + 1e-9) continue;

    /*
     * Furthest forward first, lowest second — not lowest first.
     *
     * Lowest-first is the textbook skyline rule and it draws a bar chart: every
     * piece takes a fresh patch of deck because the deck is always the lowest
     * thing available, so the load spreads back along the truck at knee height
     * and nothing ever stacks. Real loading is the opposite. You build the front
     * of the truck floor to ceiling, then start the next slice behind it, and
     * preferring the smallest x reproduces exactly that — a piece goes on top of
     * what is already at the front if it will fit there, and only moves back when
     * it will not.
     */
    if (best === null || x < best.x - 1e-9 || (Math.abs(x - best.x) < 1e-9 && y < best.y)) {
      best = { x, y };
    }
  }
  return best;
}

function topUnder(skyline: readonly Segment[], x: number, width: number): number {
  let top = 0;
  for (const segment of skyline) {
    if (segment.x + segment.width <= x + 1e-9) continue;
    if (segment.x >= x + width - 1e-9) break;
    top = Math.max(top, segment.y);
  }
  return top;
}

/** Rewrites the skyline so `[x, x + width)` now sits at `y`. */
function raise(skyline: readonly Segment[], x: number, width: number, y: number): Segment[] {
  const next: Segment[] = [];
  for (const segment of skyline) {
    const start = segment.x;
    const end = segment.x + segment.width;
    // Untouched, either side of the new piece.
    if (end <= x + 1e-9 || start >= x + width - 1e-9) {
      next.push(segment);
      continue;
    }
    // The part of this segment to the left of the piece survives at its old height.
    if (start < x) next.push({ x: start, width: x - start, y: segment.y });
    // And the part to the right.
    if (end > x + width) {
      next.push({ x: x + width, width: end - (x + width), y: segment.y });
    }
  }
  next.push({ x, width, y });
  next.sort((a, b) => a.x - b.x);

  // Merge equal-height neighbours so the segment list cannot grow without bound
  // on a large inventory.
  const merged: Segment[] = [];
  for (const segment of next) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y - segment.y) < 1e-9 && Math.abs(last.x + last.width - segment.x) < 1e-9) {
      last.width += segment.width;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

/**
 * The placements as fractions of the bed, ready to scale onto any canvas.
 *
 * `y` is measured from the DECK, so a caller drawing top-down has to flip it —
 * which is the one thing about this that is easy to get wrong, and why it is
 * stated here rather than left to be discovered.
 */
export interface ElevationRect {
  itemId: string;
  name: string;
  pose: TravelPose;
  posedDownFrom: TravelPose | null;
  step: LoadStepOrder;
  cubicFeet: number;
  /** 0 at the cab wall, 1 at the tailgate. */
  x: number;
  /** 0 at the deck, 1 at the roof. */
  y: number;
  width: number;
  height: number;
}

export function elevationRects(plan: LoadPlan): ElevationRect[] {
  const { bed } = plan;
  return plan.placements.map((placement) => ({
    itemId: placement.itemId,
    name: placement.name,
    pose: placement.pose,
    posedDownFrom: placement.posedDownFrom,
    step: placement.step,
    cubicFeet: placement.cubicFeet,
    x: placement.xIn / bed.lengthIn,
    y: placement.yIn / bed.heightIn,
    width: placement.lengthUsedIn / bed.lengthIn,
    height: placement.heightIn / bed.heightIn,
  }));
}

/** Plain-language name for a pose, for the caption under a highlighted piece. */
export const POSE_LABEL: Record<TravelPose, string> = {
  upright: 'Upright',
  onEdge: 'On its long edge',
  onEnd: 'On end',
  flat: 'Laid flat',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
