/**
 * A three-dimensional load plan: where every piece sits in the truck, and which
 * way round.
 *
 * ## Why this is a search and not a formula
 *
 * Packing boxes into a box optimally is NP-hard, so nothing here will find the
 * best possible load. What it can do is try a lot of *reasonable* loads quickly
 * and keep the best one, which is a different and achievable goal — and it is
 * roughly what a good loader does at the tailgate, deciding whether the dresser
 * goes in upright or turned.
 *
 * The search is deliberately narrow, because most of the freedom is not ours:
 *
 *   - **Load order between groups is fixed.** The plan prints heavy base, then
 *     long and tall, then boxes; people load in the order they read. A packer
 *     that reordered those to save six inches would optimise the wrong thing.
 *   - **Order WITHIN a group is ours.** Nothing physical says the dresser goes in
 *     before the bookshelf, so that sequence is a knob.
 *   - **Pose is constrained by guidance, not free.** A fridge stays upright. But
 *     a piece that will not fit in its ideal pose gets laid down, as a person
 *     would, so flatter poses are fallbacks rather than alternatives.
 *   - **Turning a piece on the deck is free**, so both ways round are always tried.
 *
 * Each strategy is a deterministic pass and the best result by `score` wins. No
 * randomness anywhere, so the same inventory always gives the same plan and Save
 * Plan round-trips.
 *
 * ## Support, not floating
 *
 * A piece must rest on the deck or on enough of what is already loaded. Without
 * that rule the packer suspends a mattress in mid-air over a gap, which looks
 * like a solution and is not one.
 *
 * ## Buildability is a question about the ORDER, not the arrangement
 *
 * "Can you actually get each piece to its spot" was tried here first, as a
 * constraint on where the solver may place things: no filling a gap that is
 * already walled in behind the load or roofed over by it. It works, and it is
 * the wrong place for it. Forbidding the solver from ever backfilling cost two
 * items across the demo inventories — including a sectional sofa — and doubled
 * the solve time, to buy a handful of fewer steps backwards in the playback.
 *
 * The arrangement does not have to be built front to back; the SEQUENCE does.
 * `loadSequence` derives one that is, and a test walks it piece by piece
 * checking that nothing is ever carried past something already loaded or stacked
 * onto something not yet in the truck. Same guarantee, at no cost to the fit.
 *
 * ## What the drawings are
 *
 * One 3D solve, two orthographic projections — the convention of any engineering
 * drawing:
 *
 *   - **side**: length across, height up. Shows the stacking.
 *   - **top**: length across, width down. Shows which side of the truck a piece is
 *     on, which a side view alone can never answer.
 *
 * In each view, pieces further from the viewer are drawn behind and dimmer. Two
 * views of one solve, rather than two pictures that could disagree.
 *
 * ## What the bed numbers are
 *
 * U-Haul's published interior dimensions. They do not multiply out to the
 * published cubic-foot capacities in either direction: the 10' capacity counts an
 * over-cab compartment the deck does not describe, and the larger trucks lose
 * deck to wheel wells. `TRUCK_CAPACITY` in domain/truck.ts stays what the sizing
 * decision is made from, and this file must not quietly replace it.
 *
 * Pure TypeScript, no React and no I/O.
 */

import { poseForItem, type TravelPose } from "../domain/itemGuidance";
import { buildLoadSteps, type LoadStepOrder } from "../domain/packing";
import type { InventoryItem, TruckSize } from "../domain/types";

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
  "10ft": { lengthIn: 119, widthIn: 75, heightIn: 73 },
  // 15' x 7'8" x 7'2"
  "15ft": { lengthIn: 180, widthIn: 92, heightIn: 86 },
  // 19'6" x 7'8" x 7'2"
  "20ft": { lengthIn: 234, widthIn: 92, heightIn: 86 },
  // 26'2" x 8'2" x 8'3"
  "26ft": { lengthIn: 314, widthIn: 98, heightIn: 99 },
};

/**
 * How much of a piece's base has to be held up by something.
 *
 * Not 100%: a box straddling two others with a finger's gap between them is
 * fine, and demanding perfection makes the packer refuse loads a person would
 * build without thinking. Not 50% either — that tips.
 */
const MIN_SUPPORT = 0.7;

/** Ignore sub-thousandth-of-an-inch float noise. */
const EPS = 1e-6;

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
  { lengthIn, widthIn, heightIn }: InventoryItem["dimensions"],
  pose: TravelPose,
): Footprint {
  switch (pose) {
    // Resting on its length x height face: the long edge is on the deck.
    case "onEdge":
      return { alongIn: lengthIn, acrossIn: heightIn, tallIn: widthIn };
    // Stood on its smallest face, the length pointing at the roof.
    case "onEnd":
      return { alongIn: widthIn, acrossIn: heightIn, tallIn: lengthIn };
    // Sitting the way it sits in a room.
    case "upright":
    case "flat":
      return { alongIn: widthIn, acrossIn: lengthIn, tallIn: heightIn };
  }
}

export interface Placement {
  itemId: string;
  name: string;
  /** The pose it is drawn in, which may not be the one it prefers. */
  pose: TravelPose;
  /**
   * The pose its guidance asks for, when the truck would not take it.
   *
   * A 96-inch rolled rug cannot stand on end under a 7'2" roof, and a nine-foot
   * sectional cannot stand on its arm. Both instructions are right in a room and
   * impossible in a 15-footer, so the packer turns the piece down the way a
   * person would — and records that it did, because "stand it on end" printed
   * beside a picture of it lying flat is the contradiction this file exists to
   * avoid.
   */
  posedDownFrom: TravelPose | null;
  step: LoadStepOrder;
  /** Inches from the cab wall. */
  xIn: number;
  /** Inches from the left wall, looking forward from the door. */
  yIn: number;
  /** Inches from the deck. */
  zIn: number;
  /** Extents at this placement, already turned. */
  alongIn: number;
  acrossIn: number;
  tallIn: number;
  cubicFeet: number;
}

export interface LoadPlan {
  bed: BedDimensions;
  placements: Placement[];
  /**
   * Pieces the solver could not place.
   *
   * Reported rather than hidden. The truck recommendation is made from volume
   * with a 15% safety reserve and remains the number to trust; this is a
   * heuristic, so a piece here means the search ran out of ideas, not that the
   * move will not fit.
   */
  overflow: { itemId: string; name: string; reason: "tooBig" | "noRoom" }[];
  /** Inches of truck length the load reaches. */
  usedLengthIn: number;
  /** Which arrangement won, and how many were tried. */
  strategy: { name: string; tried: number };
}

interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

interface Anchor {
  x: number;
  y: number;
  z: number;
}

/**
 * One arrangement to try.
 *
 * `order` re-sequences pieces WITHIN a load group — never across groups, which
 * would break the printed order people load in. `prefer` scores positions.
 */
interface Strategy {
  name: string;
  order: (items: InventoryItem[]) => InventoryItem[];
  prefer: (a: Box, b: Box) => number;
}

const byVolume = (items: InventoryItem[]) =>
  [...items].sort((a, b) => b.cubicFeet - a.cubicFeet || cmp(a.id, b.id));
const byLongest = (items: InventoryItem[]) =>
  [...items].sort(
    (a, b) =>
      longestSide(b) - longestSide(a) ||
      b.cubicFeet - a.cubicFeet ||
      cmp(a.id, b.id),
  );
const byFlattest = (items: InventoryItem[]) =>
  [...items].sort(
    (a, b) =>
      shortestSide(a) - shortestSide(b) ||
      b.cubicFeet - a.cubicFeet ||
      cmp(a.id, b.id),
  );

/** Forward first, then low, then to a wall. The way a truck is actually built. */
const frontLowLeft = (a: Box, b: Box) => a.x - b.x || a.z - b.z || a.y - b.y;
/** Forward first, then hug a wall, then stack. Builds the sides before the middle. */
const frontLeftLow = (a: Box, b: Box) => a.x - b.x || a.y - b.y || a.z - b.z;

const STRATEGIES: readonly Strategy[] = [
  { name: 'front-low, biggest first', order: byVolume, prefer: frontLowLeft },
  { name: 'front-wall, biggest first', order: byVolume, prefer: frontLeftLow },
  { name: 'front-low, longest first', order: byLongest, prefer: frontLowLeft },
  { name: 'front-wall, longest first', order: byLongest, prefer: frontLeftLow },
  { name: 'front-low, flattest first', order: byFlattest, prefer: frontLowLeft },
  { name: 'front-wall, flattest first', order: byFlattest, prefer: frontLeftLow },
];

/**
 * Tries every arrangement and returns the best.
 *
 * Better means, in order: more pieces placed, then a shorter load, then more of
 * the weight kept low. The first two are obvious. The third breaks ties in the
 * direction that matters on the road — two loads of equal length are not equally
 * good if one of them is stacked tall and the other is not.
 */
export function planLoad(items: InventoryItem[], size: TruckSize): LoadPlan {
  const bed = TRUCK_BED[size];
  if (items.length === 0) return emptyPlan(bed);

  let best: LoadPlan | null = null;
  for (const strategy of STRATEGIES) {
    const attempt = packWith(items, bed, strategy);
    if (best === null || score(attempt) < score(best)) best = attempt;
  }
  return best ?? emptyPlan(bed);
}

/** Lower is better. */
function score(plan: LoadPlan): number {
  // Placing a piece outranks any amount of tidiness: a plan that leaves the sofa
  // on the driveway is not a better plan for being compact.
  const unplaced = plan.overflow.length * 1_000_000;
  const length = plan.usedLengthIn * 100;
  const volume = plan.placements.reduce((sum, p) => sum + p.cubicFeet, 0);
  const centreOfMass =
    volume === 0
      ? 0
      : plan.placements.reduce(
          (sum, p) => sum + (p.zIn + p.tallIn / 2) * p.cubicFeet,
          0,
        ) / volume;
  return unplaced + length + centreOfMass;
}

function emptyPlan(bed: BedDimensions): LoadPlan {
  return {
    bed,
    placements: [],
    overflow: [],
    usedLengthIn: 0,
    strategy: { name: 'nothing to load', tried: STRATEGIES.length },
  };
}

function packWith(
  items: InventoryItem[],
  bed: BedDimensions,
  strategy: Strategy,
): LoadPlan {
  const byId = new Map(items.map((item) => [item.id, item]));

  // Groups keep their printed order; only the sequence inside a group is the
  // strategy's to choose.
  const ordered = buildLoadSteps(items).flatMap((step) => {
    const inStep = step.itemIds.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
    return strategy
      .order(inStep)
      .map((item) => ({ item, step: step.order as LoadStepOrder }));
  });

  const placements: Placement[] = [];
  const boxes: Box[] = [];
  const overflow: LoadPlan["overflow"] = [];
  // Corners a next piece could start from. Seeded with the front-left of the deck.
  let anchors: Anchor[] = [{ x: 0, y: 0, z: 0 }];

  for (const { item, step } of ordered) {
    const wanted = poseForItem(item);
    const options = poseOptions(item.dimensions, wanted, bed);

    if (options.length === 0) {
      overflow.push({ itemId: item.id, name: item.name, reason: "tooBig" });
      continue;
    }

    let chosen: { box: Box; pose: TravelPose } | null = null;
    for (const option of options) {
      const spot = bestSpot(option.footprint, anchors, boxes, bed, strategy);
      if (spot) {
        chosen = { box: spot, pose: option.pose };
        break;
      }
    }

    if (chosen === null) {
      overflow.push({ itemId: item.id, name: item.name, reason: "noRoom" });
      continue;
    }

    boxes.push(chosen.box);
    placements.push({
      itemId: item.id,
      name: item.name,
      pose: chosen.pose,
      posedDownFrom: chosen.pose === wanted ? null : wanted,
      step,
      xIn: round2(chosen.box.x),
      yIn: round2(chosen.box.y),
      zIn: round2(chosen.box.z),
      alongIn: round2(chosen.box.w),
      acrossIn: round2(chosen.box.d),
      tallIn: round2(chosen.box.h),
      cubicFeet: item.cubicFeet,
    });

    anchors = addAnchors(anchors, chosen.box, bed);
  }

  return {
    bed,
    placements,
    overflow,
    usedLengthIn: round2(
      boxes.reduce((max, box) => Math.max(max, box.x + box.w), 0),
    ),
    strategy: { name: strategy.name, tried: STRATEGIES.length },
  };
}

/**
 * The poses this piece could travel in, most-preferred first.
 *
 * Its guidance's pose, then the flatter ones — anything that will not stand up
 * gets laid down, and refusing to would report a boxed floor lamp as unplaceable
 * in a half-empty truck.
 */
function poseOptions(
  dimensions: InventoryItem["dimensions"],
  wanted: TravelPose,
  bed: BedDimensions,
): { pose: TravelPose; footprint: Footprint }[] {
  const out: { pose: TravelPose; footprint: Footprint }[] = [];
  const seen = new Set<TravelPose>();

  for (const pose of [wanted, "onEdge", "upright"] as TravelPose[]) {
    if (seen.has(pose)) continue;
    seen.add(pose);
    const footprint = poseFootprint(dimensions, pose);
    if (footprint.tallIn > bed.heightIn + EPS) continue;
    // Either way round on the deck, one of the two floor dimensions has to fit
    // between the walls.
    if (Math.min(footprint.alongIn, footprint.acrossIn) > bed.widthIn + EPS)
      continue;
    out.push({ pose, footprint });
  }
  return out;
}

/** The best position for this footprint, or null if there is nowhere it fits. */
function bestSpot(
  footprint: Footprint,
  anchors: readonly Anchor[],
  boxes: readonly Box[],
  bed: BedDimensions,
  strategy: Strategy,
): Box | null {
  let best: Box | null = null;

  // Turning a piece on the deck is free, so both ways round are always tried.
  const turns: [number, number][] = [
    [footprint.alongIn, footprint.acrossIn],
    [footprint.acrossIn, footprint.alongIn],
  ];

  for (const anchor of anchors) {
    for (const [w, d] of turns) {
      /*
       * Both walls, not just the left one.
       *
       * Anchors advance left to right, so without the mirrored position nothing
       * is ever placed flush against the right wall — the packer builds one tidy
       * column down the left and leaves a strip of unusable air down the right.
       * Offering the right-aligned y at the same corner is the same trick as
       * trying both ways round, and costs one more candidate.
       */
      const rightAligned = bed.widthIn - d;
      const ys =
        Math.abs(rightAligned - anchor.y) < EPS
          ? [anchor.y]
          : [anchor.y, rightAligned];

      for (const y of ys) {
        const start: Box = {
          x: anchor.x,
          y,
          z: anchor.z,
          w,
          d,
          h: footprint.tallIn,
        };
        if (!insideBed(start, bed)) continue;
        if (intersectsAny(start, boxes)) continue;

        // Anchors are corners of pieces already loaded, so a box placed at one
        // often floats above or behind the load with usable space under it.
        // Settling closes that gap, and it is what raised the packed density from
        // the mid sixties to the low eighties — the difference between a diagram
        // that loses two items out of a studio and one that does not.
        const box = settle(start, boxes);
        if (!supported(box, boxes)) continue;
        if (best === null || strategy.prefer(box, best) < 0) best = box;
      }
    }
  }
  return best;
}

/**
 * Slides a box down, then forward, then to the left wall, until each direction
 * is blocked — gravity plus a shove towards the cab.
 *
 * Three passes because the axes interact: dropping a box may open room ahead of
 * it, and sliding it forward may let it drop further. Three is where the demo
 * inventories stop changing; a fourth costs time and moves nothing.
 *
 * A slide that would leave the piece unsupported is undone. Better to leave a box
 * resting where it was placed than to slide it into a position where it floats.
 */
function settle(box: Box, boxes: readonly Box[]): Box {
  let current = box;
  for (let pass = 0; pass < 3; pass++) {
    current = slide(current, boxes, "z");
    current = slide(current, boxes, "x");
    current = slide(current, boxes, "y");
  }
  return current;
}

function slide(box: Box, boxes: readonly Box[], axis: "x" | "y" | "z"): Box {
  // The two axes the box must overlap on for another box to be in its way.
  const others = boxes.filter((other) => {
    if (axis !== "x" && !spans(box.x, box.w, other.x, other.w)) return false;
    if (axis !== "y" && !spans(box.y, box.d, other.y, other.d)) return false;
    if (axis !== "z" && !spans(box.z, box.h, other.z, other.h)) return false;
    return true;
  });

  const near = axis === "x" ? box.x : axis === "y" ? box.y : box.z;
  let stop = 0;
  for (const other of others) {
    const far =
      axis === "x"
        ? other.x + other.w
        : axis === "y"
          ? other.y + other.d
          : other.z + other.h;
    if (far <= near + EPS) stop = Math.max(stop, far);
  }
  if (stop >= near - EPS) return box;

  const moved: Box = { ...box, [axis]: stop } as Box;
  if (intersectsAny(moved, boxes)) return box;
  // Sliding sideways or forward can take a box off whatever was holding it up.
  if (!supported(moved, boxes)) return box;
  return moved;
}

/** Do two intervals overlap by more than a rounding error? */
function spans(
  aStart: number,
  aSize: number,
  bStart: number,
  bSize: number,
): boolean {
  return aStart < bStart + bSize - EPS && bStart < aStart + aSize - EPS;
}

function insideBed(box: Box, bed: BedDimensions): boolean {
  return (
    box.x >= -EPS &&
    box.y >= -EPS &&
    box.z >= -EPS &&
    box.x + box.w <= bed.lengthIn + EPS &&
    box.y + box.d <= bed.widthIn + EPS &&
    box.z + box.h <= bed.heightIn + EPS
  );
}

function intersectsAny(box: Box, boxes: readonly Box[]): boolean {
  return boxes.some(
    (other) =>
      box.x < other.x + other.w - EPS &&
      other.x < box.x + box.w - EPS &&
      box.y < other.y + other.d - EPS &&
      other.y < box.y + box.d - EPS &&
      box.z < other.z + other.h - EPS &&
      other.z < box.z + box.h - EPS,
  );
}

/**
 * Is enough of this piece's base held up?
 *
 * On the deck, always. Otherwise the tops directly beneath it have to cover most
 * of its footprint — without this the packer suspends a mattress over a gap,
 * which looks like a solution and is not one.
 */
function supported(box: Box, boxes: readonly Box[]): boolean {
  if (box.z <= EPS) return true;

  const base = box.w * box.d;
  if (base <= 0) return false;

  let held = 0;
  for (const other of boxes) {
    if (Math.abs(other.z + other.h - box.z) > EPS) continue;
    const overlapW =
      Math.min(box.x + box.w, other.x + other.w) - Math.max(box.x, other.x);
    const overlapD =
      Math.min(box.y + box.d, other.y + other.d) - Math.max(box.y, other.y);
    if (overlapW > 0 && overlapD > 0) held += overlapW * overlapD;
  }
  return held / base >= MIN_SUPPORT - EPS;
}

/**
 * Corners created by placing this box: past it, beside it, and on top of it.
 *
 * Capped and de-duplicated. The search is anchors x placed boxes per item, so an
 * uncapped list takes a sixty-item house move from milliseconds to seconds — on a
 * screen that recomputes whenever the inventory changes.
 */
const MAX_ANCHORS = 300;

function addAnchors(
  anchors: readonly Anchor[],
  box: Box,
  bed: BedDimensions,
): Anchor[] {
  const next = [
    ...anchors,
    { x: box.x + box.w, y: box.y, z: box.z },
    { x: box.x, y: box.y + box.d, z: box.z },
    { x: box.x, y: box.y, z: box.z + box.h },
  ].filter(
    (a) =>
      a.x < bed.lengthIn - EPS &&
      a.y < bed.widthIn - EPS &&
      a.z < bed.heightIn - EPS,
  );

  const seen = new Set<string>();
  const unique = next.filter((a) => {
    const key = `${a.x.toFixed(2)}|${a.y.toFixed(2)}|${a.z.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length <= MAX_ANCHORS) return unique;
  // Keep the corners nearest the cab: that is where the next piece wants to go,
  // and corners further down the truck come back into reach as the load advances.
  return unique
    .sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y)
    .slice(0, MAX_ANCHORS);
}

/* ------------------------------------------------------------------------ */
/* Projections                                                              */
/* ------------------------------------------------------------------------ */

export type ProjectionView = "side" | "top";

/**
 * One placement flattened into a drawable rectangle.
 *
 * `depth` is 0 for the piece nearest the viewer and 1 for the furthest, so the
 * caller can dim what is behind. Every value is a fraction of the bed, ready to
 * scale onto any canvas.
 */
export interface ProjectedRect {
  itemId: string;
  name: string;
  pose: TravelPose;
  posedDownFrom: TravelPose | null;
  step: LoadStepOrder;
  cubicFeet: number;
  /** 0 at the cab wall, 1 at the tailgate. */
  x: number;
  /**
   * Side view: 0 at the deck, 1 at the roof, measured from the BOTTOM.
   * Top view: 0 at the left wall, 1 at the right wall, measured from the TOP.
   *
   * The two run opposite ways, which is the one thing here that is easy to get
   * wrong — hence saying so rather than leaving it to be discovered.
   */
  y: number;
  width: number;
  height: number;
  depth: number;
}

export function project(plan: LoadPlan, view: ProjectionView): ProjectedRect[] {
  const { bed } = plan;
  const rects = plan.placements.map((placement) => {
    const common = {
      itemId: placement.itemId,
      name: placement.name,
      pose: placement.pose,
      posedDownFrom: placement.posedDownFrom,
      step: placement.step,
      cubicFeet: placement.cubicFeet,
      x: placement.xIn / bed.lengthIn,
      width: placement.alongIn / bed.lengthIn,
    };

    if (view === "side") {
      return {
        ...common,
        y: placement.zIn / bed.heightIn,
        height: placement.tallIn / bed.heightIn,
        // Looking in through the left wall, so the left of the truck is nearest.
        depth: bed.widthIn === 0 ? 0 : placement.yIn / bed.widthIn,
      };
    }
    return {
      ...common,
      y: placement.yIn / bed.widthIn,
      height: placement.acrossIn / bed.widthIn,
      // Looking down, so the top of the load is nearest.
      depth:
        bed.heightIn === 0
          ? 0
          : 1 - (placement.zIn + placement.tallIn) / bed.heightIn,
    };
  });

  // Furthest first, so nearer pieces paint over them.
  return rects.sort((a, b) => b.depth - a.depth || cmp(a.itemId, b.itemId));
}

/**
 * The order to carry things in: front to back, bottom to top.
 *
 * NOT the order the solver happened to place them in. The solver works group by
 * group and fills where it can, so its own sequence hops between lanes — load
 * the left wall to the back, come forward again for the right wall. Every one of
 * those hops is physically fine, and watching it is baffling: the truck fills in
 * a scatter rather than a sweep.
 *
 * So the sequence is derived spatially, with two rules that cannot be broken:
 *
 *   - a piece comes after everything holding it up, and
 *   - a piece comes after anything already blocking its way in.
 *
 * Among whatever is available at each step, the nearest to the cab goes first,
 * then the lowest, then the left. Which is front to back, bottom to top.
 *
 * A greedy topological walk rather than a plain sort: sorting by position alone
 * can put a piece before the thing it rests on, whenever the supporter starts
 * further back and overhangs forward.
 */
export function loadSequence(plan: LoadPlan): Placement[] {
  const remaining = [...plan.placements];
  const out: Placement[] = [];

  while (remaining.length > 0) {
    const ready = remaining.filter((candidate) =>
      remaining.every((other) => other === candidate || !mustPrecede(other, candidate)),
    );

    // Nothing free to go next would mean a cycle. It cannot happen — both
    // relations point strictly forward or strictly downward — but falling back to
    // position order beats looping for ever if it ever does.
    const pool = ready.length > 0 ? ready : remaining;
    let next = pool[0]!;
    for (const candidate of pool) if (earlier(candidate, next) < 0) next = candidate;

    out.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return out;
}

/** Nearest the cab first, then lowest, then leftmost. Id last, for determinism. */
function earlier(a: Placement, b: Placement): number {
  return a.xIn - b.xIn || a.zIn - b.zIn || a.yIn - b.yIn || cmp(a.itemId, b.itemId);
}

/**
 * Must `first` be loaded before `second`?
 *
 * Two reasons, and they are the two the user notices: you cannot stack onto
 * something that is not there yet, and you cannot carry a piece past one that is
 * already in the way. x is measured from the CAB, so the smaller x is the one
 * further inside the truck — and therefore the one that has to go in first.
 */
function mustPrecede(first: Placement, second: Placement): boolean {
  const sameLane = spans(second.yIn, second.acrossIn, first.yIn, first.acrossIn);
  if (!sameLane) return false;

  // `first` is holding `second` up.
  if (
    Math.abs(first.zIn + first.tallIn - second.zIn) < 1e-3 &&
    spans(second.xIn, second.alongIn, first.xIn, first.alongIn)
  ) {
    return true;
  }

  // `first` is further inside the truck, in the same lane and at the same
  // height: once `second` is in, there is no way past it to reach `first`.
  if (
    spans(second.zIn, second.tallIn, first.zIn, first.tallIn) &&
    first.xIn + first.alongIn <= second.xIn + EPS
  ) {
    return true;
  }
  return false;
}

/** Plain-language name for a pose, for the caption under a highlighted piece. */
export const POSE_LABEL: Record<TravelPose, string> = {
  upright: "Upright",
  onEdge: "On its long edge",
  onEnd: "On end",
  flat: "Laid flat",
};

/** Which part of the truck's width a piece sits in, in words. */
export function sideOfTruck(placement: Placement, bed: BedDimensions): string {
  if (placement.acrossIn >= bed.widthIn * 0.8) return "across the full width";
  const centre = placement.yIn + placement.acrossIn / 2;
  const third = bed.widthIn / 3;
  if (centre < third) return "against the left wall";
  if (centre > bed.widthIn - third) return "against the right wall";
  return "down the middle";
}

function longestSide(item: InventoryItem): number {
  const { lengthIn, widthIn, heightIn } = item.dimensions;
  return Math.max(lengthIn, widthIn, heightIn);
}

function shortestSide(item: InventoryItem): number {
  const { lengthIn, widthIn, heightIn } = item.dimensions;
  return Math.min(lengthIn, widthIn, heightIn);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
