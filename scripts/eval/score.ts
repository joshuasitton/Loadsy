/**
 * Scores detection item by item, not only room by room.
 *
 * The room total is what sizes the truck, but on its own it hides why it is wrong.
 * A room that comes out 5% under can be a sofa sized 30% short and a phantom
 * bookshelf cancelling out – right by accident, and wrong the next time. So each
 * detected item is paired with a tape-measured one, and a room's error is split into
 * the three things that cause it:
 *
 *   sizing   items found, measured wrong        (detected − measured, over the pairs)
 *   missed   items on the truck the model did not list – the dangerous kind, because
 *            every one of them shrinks the truck
 *   extras   items the model listed that were not measured: duplicates of one object
 *            seen from two angles, phantoms, or something left out of truth.json
 *
 * Those three add up to the room's error exactly, so nothing is lost in the split.
 *
 * Pairing is a guess from names and sizes, so every pairing is printed for a person
 * to check, and `aka` in truth.json corrects one that is wrong. It never pairs two
 * things whose names share no head noun: a wrong pairing hides a missed item, which
 * is worse than reporting a correct pairing as a miss and an extra.
 *
 * Pure – no I/O – so `npm test` pins it with nothing installed. Answers are read
 * with the app's own `parseDetectedItem`, here and not at request time, so a saved
 * run scored again later is read exactly as the app reads it then.
 */

import { parseDetectedItem, type DetectRequest } from '../../src/api/detect';
import { normaliseCeilingHeight } from '../../src/domain/ceiling';
import { objectName } from '../../src/domain/plausibility';
import { recommendTruckSize, TRUCK_CAPACITY, usableCapacityCuFt } from '../../src/domain/truck';
import { TRUCK_SIZES, type TruckSize } from '../../src/domain/types';
import { cubicFeetFor, DEFAULT_PACKING_BUFFER_PCT } from '../../src/domain/volume';

/* ------------------------------------------------------------ ground truth */

export interface TruthItem {
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** Several identical objects – six dining chairs – measured once. */
  count?: number;
  /** Other names the model might reasonably use: `["couch"]`. Corrects a pairing. */
  aka?: string[];
  /**
   * Not tape-measured – an estimate, such as a box count judged from the photos. Scored
   * like any item, but reported apart, because an estimate from another model measures
   * agreement with it rather than accuracy.
   */
  estimated?: boolean;
}

export interface TruthRoom {
  roomName: string;
  items: TruthItem[];
  /** Measured ceiling height in feet; absent means standard. */
  ceilingFt?: number;
  /**
   * True once everything that goes on the truck is in `items`, boxes included. Until
   * then the room's numbers are provisional: an unmeasured box count reads as the model
   * over-estimating. Absent means not yet.
   */
  complete?: boolean;
  /** What is still to measure – a checklist for the person with the tape. Not scored. */
  toMeasure?: string[];
}

/** One physical object as measured – a truth item with its count expanded. */
export interface MeasuredItem {
  name: string;
  names: string[];
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  cubicFeet: number;
  estimated: boolean;
}

/**
 * Reads truth.json, keyed by room, and says what is wrong with it.
 *
 * It is typed by hand with a tape measure in the other hand, so it gets checked:
 * a missing height or a zero would silently change a room's volume, and every
 * number the eval prints would inherit the typo.
 */
export function readTruth(
  raw: unknown,
  keyOf: (key: string) => string = (key) => key,
): { rooms: Map<string, TruthRoom>; problems: string[] } {
  const rooms = new Map<string, TruthRoom>();
  const problems: string[] = [];
  if (!isRecord(raw)) return { rooms, problems: ['truth.json must be an object keyed by room'] };

  for (const [rawKey, value] of Object.entries(raw)) {
    const key = keyOf(rawKey);
    if (!isRecord(value) || typeof value.roomName !== 'string' || !Array.isArray(value.items)) {
      problems.push(`"${rawKey}": needs "roomName" and an "items" list`);
      continue;
    }
    const items: TruthItem[] = [];
    value.items.forEach((item: unknown, index: number) => {
      const where = `"${rawKey}" item ${index + 1}`;
      if (!isRecord(item) || typeof item.name !== 'string' || item.name.trim() === '') {
        problems.push(`${where}: needs a "name"`);
        return;
      }
      const label = `"${rawKey}" → ${item.name}`;
      const dims = ['lengthIn', 'widthIn', 'heightIn'] as const;
      const bad = dims.filter((d) => typeof item[d] !== 'number' || !((item[d] as number) > 0));
      if (bad.length > 0) {
        problems.push(`${label}: ${bad.join(', ')} must be a number of inches above 0`);
        return;
      }
      if (item.count !== undefined && !(Number.isInteger(item.count) && (item.count as number) >= 1)) {
        problems.push(`${label}: "count" must be a whole number, 1 or more`);
        return;
      }
      if (item.aka !== undefined && !(Array.isArray(item.aka) && item.aka.every((a) => typeof a === 'string'))) {
        problems.push(`${label}: "aka" must be a list of names`);
        return;
      }
      if (item.estimated !== undefined && typeof item.estimated !== 'boolean') {
        problems.push(`${label}: "estimated" must be true or false`);
        return;
      }
      items.push(item as unknown as TruthItem);
    });
    if (value.complete !== undefined && typeof value.complete !== 'boolean') {
      problems.push(`"${rawKey}": "complete" must be true or false`);
    }
    if (value.toMeasure !== undefined && !(Array.isArray(value.toMeasure) && value.toMeasure.every((t) => typeof t === 'string'))) {
      problems.push(`"${rawKey}": "toMeasure" must be a list of reminders`);
    }
    if (value.ceilingFt !== undefined) {
      if (typeof value.ceilingFt !== 'number' || normaliseCeilingHeight(value.ceilingFt * 12) === null) {
        problems.push(`"${rawKey}": "ceilingFt" must be a height in feet between 6 and 20`);
      }
    }
    rooms.set(key, {
      roomName: value.roomName,
      items,
      ...(typeof value.ceilingFt === 'number' ? { ceilingFt: value.ceilingFt } : {}),
      ...(value.complete === true ? { complete: true } : {}),
    });
  }
  return { rooms, problems };
}

export function expandTruth(room: TruthRoom): MeasuredItem[] {
  return room.items.flatMap((item) => {
    const count = item.count ?? 1;
    const one: MeasuredItem = {
      name: item.name,
      names: [item.name, ...(item.aka ?? [])],
      lengthIn: item.lengthIn,
      widthIn: item.widthIn,
      heightIn: item.heightIn,
      cubicFeet: cubicFeetFor({ ...item, isEstimated: false }),
      estimated: item.estimated === true,
    };
    return Array.from({ length: count }, (_, i) => (count === 1 ? one : { ...one, name: `${item.name} (${i + 1} of ${count})` }));
  });
}

/* --------------------------------------------------------- reading answers */

/** An item as the app would show it, reduced to what scoring needs. */
export interface SeenItem {
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  cubicFeet: number;
  confidence: 'high' | 'low' | null;
  /** Why the app would ask the user to check it – set when confidence is low. */
  confidenceReason?: string | null;
}

export type Answer = { ok: true; items: SeenItem[] } | { ok: false; reason: string };

/**
 * The model's text, read as the app reads it.
 *
 * Unparseable text keeps its stop reason, because that is the diagnosis:
 * `max_tokens` means thinking used up the response budget before the JSON was done.
 */
export function readAnswer(text: string, stopReason: string | null, roomName: string): Answer {
  let items: unknown;
  try {
    items = (JSON.parse(text) as { items?: unknown }).items;
  } catch {
    return { ok: false, reason: `unparseable answer (stop_reason: ${stopReason ?? 'unknown'})` };
  }
  if (!Array.isArray(items)) return { ok: false, reason: 'answer had no item list' };

  const request: DetectRequest = { roomId: 'eval', roomName, photos: [{ photoId: 'eval', imageData: '' }] };
  return {
    ok: true,
    items: items.flatMap((item, index) =>
      parseDetectedItem(item, index, request).map((parsed) => ({
        name: parsed.name,
        ...parsed.dimensions,
        cubicFeet: parsed.cubicFeet,
        confidence: parsed.confidence,
        confidenceReason: parsed.confidenceReason,
      })),
    ),
  };
}

/**
 * An answer as a person reads an inventory: identical objects counted together.
 *
 * The model lists one entry per physical object, so four matching chairs are four
 * entries. They are grouped only when name and size both match – two "Bookshelf"
 * entries of different sizes are two different bookshelves and stay two lines.
 * Largest total volume first, since that is what sizes the truck.
 */
export interface SeenGroup {
  item: SeenItem;
  count: number;
  /** How many of the group the app would ask the user to check, and the first reason it gives. */
  lowCount: number;
  lowReason: string | null;
}

export function groupSeen(items: readonly SeenItem[]): SeenGroup[] {
  const groups = new Map<string, SeenGroup>();
  for (const item of items) {
    const key = [item.name.trim().toLowerCase(), item.lengthIn, item.widthIn, item.heightIn].join('|');
    const group = groups.get(key) ?? { item, count: 0, lowCount: 0, lowReason: null };
    group.count += 1;
    if (item.confidence === 'low') {
      group.lowCount += 1;
      group.lowReason ??= item.confidenceReason ?? null;
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.item.cubicFeet * b.count - a.item.cubicFeet * a.count);
}

/* ---------------------------------------------------------------- pairing */

/** Words that describe an object without saying what it is. */
const IGNORED = new Set([
  'a', 'an', 'the', 'of', 'and', 'with', 'for', 'in', 'on', 'set', 'pair', 'piece',
  // What part of a thing it is, not what it is: "Sectional Sofa Long Run" is a sofa.
  'run', 'section', 'module', 'part', 'end', 'corner', 'long',
  'small', 'large', 'big', 'medium', 'mini', 'tall', 'short', 'low', 'wide', 'narrow',
  'wooden', 'wood', 'metal', 'glass', 'fabric', 'leather', 'upholstered', 'plastic', 'wicker', 'rattan',
  'white', 'black', 'grey', 'gray', 'brown', 'beige', 'blue', 'green', 'red', 'cream', 'dark', 'light',
  'round', 'square', 'rectangular', 'oval', 'old', 'new', 'modern', 'vintage',
  'king', 'queen', 'twin', 'full', 'double', 'single', 'seat', 'seater',
]);

/** Phrases that name one object in two words, joined before splitting. */
const PHRASES: [RegExp, string][] = [
  [/\bchest of drawers\b/g, 'dresser'],
  [/\bbed ?frame\b/g, 'bed'],
  [/\bbox ?spring\b/g, 'boxspring'],
  [/\bnight ?stand\b|\bbedside table\b|\bnight table\b/g, 'nightstand'],
  [/\b(tv|television|media) (stand|console|unit|cabinet)\b|\bentertainment (center|centre|unit)\b/g, 'tvstand'],
  [/\bbook ?(shelf|shelves|case)\b/g, 'shelf'],
  [/\bwashing machine\b/g, 'washer'],
  [/\bfoot ?stool\b/g, 'ottoman'],
  [/\b(hutch|china|display|curio) cabinet\b/g, 'hutch'],
  // A shadow box or display case hangs on a wall; it is not a packing box.
  [/\b(shadow box|display case)\b/g, 'displaycase'],
];

/** Different words for the same kind of object. */
const SYNONYMS: Record<string, string> = {
  couch: 'sofa', loveseat: 'sofa', settee: 'sofa', sectional: 'sofa',
  television: 'tv', tvs: 'tv',
  shelving: 'shelf', shelve: 'shelf', etagere: 'shelf',
  bureau: 'dresser',
  armchair: 'chair', recliner: 'chair',
  carpet: 'rug', runner: 'rug',
  carton: 'box', tote: 'box', bin: 'box', crate: 'box',
  pouf: 'ottoman', pouffe: 'ottoman',
  credenza: 'sideboard', buffet: 'sideboard',
  armoire: 'wardrobe',
  planter: 'plant',
  artwork: 'art', painting: 'art', picture: 'art', print: 'art', canvas: 'art',
  bike: 'bicycle',
  fridge: 'refrigerator',
  bedframe: 'bed', headboard: 'bed',
  chaise: 'sofa',
  map: 'art',
};

function singular(word: string): string {
  if (word.length <= 3 || word.endsWith('ss')) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** The words of a name that say what the object is, most important – the head noun – last. */
export function nameWords(name: string): string[] {
  // The app's own reading of what an object is – location and contents clauses off, so
  // "Wood Side Table with Drawer" is a table, not a drawer.
  let text = objectName(name).toLowerCase();
  for (const [pattern, replacement] of PHRASES) text = text.replace(pattern, replacement);
  return text
    .split(/[^a-z]+/)
    .filter((word) => word.length > 1)
    .map((word) => SYNONYMS[word] ?? SYNONYMS[singular(word)] ?? singular(word))
    .filter((word) => !IGNORED.has(word));
}

function headOf(words: readonly string[]): string | null {
  return words.length === 0 ? null : words[words.length - 1]!;
}

/**
 * How alike two names are, 0 to 1 – and 0 unless they name the same kind of thing.
 *
 * "Same kind" means the same head noun: "Side Table" and "Coffee Table" can pair,
 * "Table Lamp" and "Side Table" cannot. Past that, shared words decide between
 * candidates.
 */
export function nameSimilarity(measuredNames: readonly string[], seenName: string): number {
  const seen = nameWords(seenName);
  const seenHead = headOf(seen);
  let best = 0;
  for (const name of measuredNames) {
    const words = nameWords(name);
    if (seenHead === null || headOf(words) !== seenHead) continue;
    const a = new Set(words);
    const b = new Set(seen);
    const shared = [...a].filter((word) => b.has(word)).length;
    best = Math.max(best, 0.5 + 0.5 * (shared / new Set([...a, ...b]).size));
  }
  return best;
}

/** How alike two sizes are, 0 to 1, ignoring which way round the sides were given. */
export function sizeSimilarity(a: Dims, b: Dims): number {
  const x = sortedSides(a);
  const y = sortedSides(b);
  return x.reduce((sum, side, i) => sum + Math.min(side, y[i]!) / Math.max(side, y[i]!), 0) / 3;
}

interface Dims {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

function sortedSides(d: Dims): number[] {
  return [d.lengthIn, d.widthIn, d.heightIn].sort((p, q) => q - p);
}

/**
 * Signed error of each side, as a fraction of the measured one.
 *
 * Floor footprint as long side and short side, whichever way round length and width
 * were given – a model that swaps them has not measured anything wrong – and height
 * on its own, because height is where a wrong ceiling assumption shows.
 */
export function sideErrors(measured: Dims, seen: Dims) {
  const long = (d: Dims) => Math.max(d.lengthIn, d.widthIn);
  const short = (d: Dims) => Math.min(d.lengthIn, d.widthIn);
  return {
    long: (long(seen) - long(measured)) / long(measured),
    short: (short(seen) - short(measured)) / short(measured),
    height: (seen.heightIn - measured.heightIn) / measured.heightIn,
  };
}

export interface Pair {
  measured: MeasuredItem;
  seen: SeenItem;
  error: { long: number; short: number; height: number; volume: number };
}

export interface Extra {
  seen: SeenItem;
  /** A measured item of the same kind that was already paired – likely the same object counted twice. */
  duplicateOf: string | null;
}

/** How alike in size an extra must be to what it duplicates – 1 is identical. */
const DUPLICATE_SIZE_SIMILARITY = 0.75;

export interface RoomScore {
  measuredCuFt: number;
  seenCuFt: number;
  /** (seen − measured) / measured. */
  error: number;
  pairs: Pair[];
  missed: MeasuredItem[];
  extras: Extra[];
  /** Cubic feet, adding up to seen − measured. */
  explained: { sizing: number; missed: number; extras: number };
  /** Share of the measured volume that was found at all. */
  volumeRecall: number;
}

/**
 * Pairs every seen item with at most one measured item, best match first.
 *
 * Greedy rather than optimal: a room holds a few dozen items, the name rule already
 * rules out almost every pairing, and a greedy choice can be explained in one line
 * when it is printed for checking. Names weigh as much as sizes, so a sofa sized
 * badly still pairs with the sofa – that is exactly the error being measured.
 */
export function scoreRoom(measured: readonly MeasuredItem[], seen: readonly SeenItem[]): RoomScore {
  const candidates: { m: number; s: number; score: number }[] = [];
  measured.forEach((item, m) => {
    seen.forEach((found, s) => {
      const name = nameSimilarity(item.names, found.name);
      if (name > 0) candidates.push({ m, s, score: 0.5 * name + 0.5 * sizeSimilarity(item, found) });
    });
  });
  // Ties go to list order, so the same answer always pairs the same way.
  candidates.sort((a, b) => b.score - a.score || a.m - b.m || a.s - b.s);

  const takenM = new Set<number>();
  const takenS = new Set<number>();
  const pairs: Pair[] = [];
  for (const { m, s } of candidates) {
    if (takenM.has(m) || takenS.has(s)) continue;
    takenM.add(m);
    takenS.add(s);
    const item = measured[m]!;
    const found = seen[s]!;
    pairs.push({
      measured: item,
      seen: found,
      error: { ...sideErrors(item, found), volume: (found.cubicFeet - item.cubicFeet) / item.cubicFeet },
    });
  }

  const missed = measured.filter((_, m) => !takenM.has(m));
  const extras = seen
    .filter((_, s) => !takenS.has(s))
    .map((found) => ({
      seen: found,
      // Same kind of thing AND about the same size as what it would duplicate. On the
      // first real room, kind alone called a console table a second count of an 18 in
      // side table – a different object, in fact in another room.
      duplicateOf:
        pairs.find(
          (pair) =>
            nameSimilarity(pair.measured.names, found.name) > 0 &&
            Math.max(sizeSimilarity(pair.seen, found), sizeSimilarity(pair.measured, found)) >= DUPLICATE_SIZE_SIMILARITY,
        )?.measured.name ?? null,
    }));

  const measuredCuFt = sum(measured.map((item) => item.cubicFeet));
  const seenCuFt = sum(seen.map((item) => item.cubicFeet));
  const pairedMeasured = sum(pairs.map((pair) => pair.measured.cubicFeet));
  return {
    measuredCuFt,
    seenCuFt,
    error: measuredCuFt === 0 ? 0 : (seenCuFt - measuredCuFt) / measuredCuFt,
    pairs,
    missed,
    extras,
    explained: {
      sizing: sum(pairs.map((pair) => pair.seen.cubicFeet)) - pairedMeasured,
      missed: -sum(missed.map((item) => item.cubicFeet)),
      extras: sum(extras.map((extra) => extra.seen.cubicFeet)),
    },
    volumeRecall: measuredCuFt === 0 ? 1 : pairedMeasured / measuredCuFt,
  };
}

/* ------------------------------------------------------------------ runs */

/** One request's outcome, as saved – the raw text, so it can be scored again for free. */
export interface Attempt {
  /** The model's text, or null when there was no answer to read. */
  text: string | null;
  stopReason: string | null;
  /** Why there was no answer: HTTP status, network error, timeout. */
  error: string | null;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  /** How many times a rate-limited or overloaded request was retried before this answer. */
  retries?: number;
}

export interface SavedRoom {
  roomName: string;
  photoCount: number;
  ceilingIn: number | null;
  /** SHA-256 of each original photo file, so two runs can be checked for the same photos. */
  photoHashes: string[];
  /** SHA-256 of the request with the images replaced by their hashes. */
  requestHash: string;
  attempts: Attempt[];
}

export interface SavedRun {
  format: 'loadsy-eval-run';
  version: 1;
  label: string;
  startedAt: string;
  model: string;
  maxTokens: number;
  /** The deadline the route applied when this run was made. */
  deadlineMs: number;
  rooms: Record<string, SavedRoom>;
}

export function isSavedRun(value: unknown): value is SavedRun {
  return isRecord(value) && value.format === 'loadsy-eval-run' && value.version === 1 && isRecord(value.rooms);
}

export type AttemptScore =
  | { ok: true; late: boolean; score: RoomScore; ms: number; outputTokens: number; stopReason: string | null }
  | { ok: false; reason: string; ms: number; outputTokens: number; stopReason: string | null };

export interface RoomResult {
  key: string;
  roomName: string;
  photoCount: number;
  measuredCuFt: number;
  measured: MeasuredItem[];
  /** Whether truth.json says everything in the room is measured. */
  complete: boolean;
  attempts: AttemptScore[];
}

export function scoreAttempt(attempt: Attempt, measured: readonly MeasuredItem[], roomName: string, deadlineMs: number): AttemptScore {
  const common = { ms: attempt.ms, outputTokens: attempt.outputTokens, stopReason: attempt.stopReason };
  if (attempt.text === null) return { ok: false, reason: attempt.error ?? 'no answer', ...common };
  const answer = readAnswer(attempt.text, attempt.stopReason, roomName);
  if (!answer.ok) return { ok: false, reason: answer.reason, ...common };
  return { ok: true, late: attempt.ms > deadlineMs, score: scoreRoom(measured, answer.items), ...common };
}

/**
 * Every room of a saved run that has measurements, scored against them.
 *
 * A room in truth.json with no items yet is set up but not measured: it is listed as
 * unmeasured, not scored, because against nothing every item is an "extra" and the room
 * would read as a wildly wrong answer.
 */
export function scoreRun(
  run: SavedRun,
  truth: ReadonlyMap<string, TruthRoom>,
): { rooms: RoomResult[]; unscored: string[]; unmeasured: string[] } {
  const rooms: RoomResult[] = [];
  const unscored: string[] = [];
  const unmeasured: string[] = [];
  for (const [key, saved] of Object.entries(run.rooms)) {
    const room = truth.get(key);
    if (!room) {
      unscored.push(key);
      continue;
    }
    const measured = expandTruth(room);
    if (measured.length === 0) {
      unmeasured.push(key);
      continue;
    }
    rooms.push({
      key,
      roomName: room.roomName,
      photoCount: saved.photoCount,
      measuredCuFt: sum(measured.map((item) => item.cubicFeet)),
      measured,
      complete: room.complete === true,
      attempts: saved.attempts.map((attempt) => scoreAttempt(attempt, measured, room.roomName, run.deadlineMs)),
    });
  }
  return { rooms, unscored, unmeasured };
}

/**
 * Several saved runs as one, so rooms run on different days make one move.
 *
 * A move is scored from the n-th answer of every room, and those answers are
 * independent requests whether they were sent together or not. Where two runs hold
 * the same room, the later file wins. The first run's model and deadline describe the
 * whole; `mismatch` says when the runs disagree on them, so a comparison built across
 * different requests is labelled rather than trusted.
 */
export function mergeRuns(runs: readonly SavedRun[]): { run: SavedRun; mismatch: string | null } {
  if (runs.length === 0) throw new Error('mergeRuns: no runs');
  const first = runs[0]!;
  const rooms: Record<string, SavedRoom> = {};
  for (const run of runs) Object.assign(rooms, run.rooms);
  const models = new Set(runs.map((run) => `${run.model} · ${run.maxTokens} tokens`));
  return {
    run: { ...first, label: runs.map((run) => run.label).join(' + '), rooms },
    mismatch: models.size > 1 ? `the merged runs used different requests: ${[...models].join(' / ')}` : null,
  };
}

/* ------------------------------------------------------------- summaries */

export interface Headline {
  /** Room answers scored. */
  scored: number;
  /** Requests with no usable answer – including, when the deadline applies, late ones. */
  failed: number;
  medianAbsRoomError: number | null;
  /** Summed over every scored answer: positive means the model runs large. */
  bias: number | null;
  truckExact: number | null;
  truckWithinOne: number | null;
  truckUnder: number | null;
  volumeRecall: number | null;
  /** Median signed side errors over every pairing. */
  sides: { long: number; short: number; height: number } | null;
  medianAbsItemVolumeError: number | null;
  missedItems: number;
  extras: number;
  likelyDuplicates: number;
  /** Cubic feet across every scored answer, adding up to seen − measured. */
  explained: { sizing: number; missed: number; extras: number };
}

/** The truck a load of this raw volume needs, through the app's own buffer and bands. */
export function truckFor(rawCuFt: number): TruckSize {
  return recommendTruckSize(rawCuFt * (1 + DEFAULT_PACKING_BUFFER_PCT));
}

/**
 * The pass-bar numbers over a set of room results.
 *
 * `respectDeadline` decides whether an answer that arrived after the route would have
 * given up counts. With it, the numbers are what a user gets. Without it, they are
 * what the model can do – worth knowing separately, because a slow right answer is
 * fixed differently from a fast wrong one.
 */
export function headline(rooms: readonly RoomResult[], respectDeadline: boolean): Headline {
  const scores: RoomScore[] = [];
  let failed = 0;
  for (const room of rooms) {
    for (const attempt of room.attempts) {
      if (attempt.ok && !(respectDeadline && attempt.late)) scores.push(attempt.score);
      else failed += 1;
    }
  }

  const trucks = scores.map((score) => ({ truth: truckFor(score.measuredCuFt), seen: truckFor(score.seenCuFt) }));
  const share = (n: number) => (scores.length === 0 ? null : n / scores.length);
  const pairs = scores.flatMap((score) => score.pairs);
  const measured = sum(scores.map((score) => score.measuredCuFt));
  const extras = scores.flatMap((score) => score.extras);

  return {
    scored: scores.length,
    failed,
    medianAbsRoomError: median(scores.map((score) => Math.abs(score.error))),
    bias: measured === 0 ? null : (sum(scores.map((score) => score.seenCuFt)) - measured) / measured,
    truckExact: share(trucks.filter((t) => t.truth === t.seen).length),
    truckWithinOne: share(trucks.filter((t) => Math.abs(TRUCK_SIZES.indexOf(t.truth) - TRUCK_SIZES.indexOf(t.seen)) <= 1).length),
    truckUnder: share(trucks.filter((t) => TRUCK_CAPACITY[t.seen].max < TRUCK_CAPACITY[t.truth].max).length),
    volumeRecall: measured === 0 ? null : sum(scores.map((score) => score.volumeRecall * score.measuredCuFt)) / measured,
    sides:
      pairs.length === 0
        ? null
        : {
            long: median(pairs.map((pair) => pair.error.long))!,
            short: median(pairs.map((pair) => pair.error.short))!,
            height: median(pairs.map((pair) => pair.error.height))!,
          },
    medianAbsItemVolumeError: median(pairs.map((pair) => Math.abs(pair.error.volume))),
    missedItems: sum(scores.map((score) => score.missed.length)),
    extras: extras.length,
    likelyDuplicates: extras.filter((extra) => extra.duplicateOf !== null).length,
    explained: {
      sizing: sum(scores.map((score) => score.explained.sizing)),
      missed: sum(scores.map((score) => score.explained.missed)),
      extras: sum(scores.map((score) => score.explained.extras)),
    },
  };
}

/** How much one room's answers disagree with each other across repeated runs. */
export function spread(room: RoomResult): { volumes: number[]; mean: number; min: number; max: number; cv: number } | null {
  const volumes = room.attempts.flatMap((attempt) => (attempt.ok ? [attempt.score.seenCuFt] : []));
  if (volumes.length === 0) return null;
  const mean = sum(volumes) / volumes.length;
  const variance = sum(volumes.map((v) => (v - mean) ** 2)) / volumes.length;
  return { volumes, mean, min: Math.min(...volumes), max: Math.max(...volumes), cv: mean === 0 ? 0 : Math.sqrt(variance) / mean };
}

/**
 * Measured items and how many answers missed each one.
 *
 * Missed once in three is noise; missed every time is a blind spot in the prompt.
 * Items are counted by name, so the chairs of a six-chair set count together: an
 * answer that missed any of them counts once.
 */
export function missCounts(room: RoomResult): { name: string; missed: number; of: number }[] {
  const answered = room.attempts.filter((attempt) => attempt.ok);
  const counts = new Map<string, number>();
  for (const attempt of answered) {
    if (!attempt.ok) continue;
    // A set per answer: two of a pair of nightstands missed in one answer is one answer
    // that missed nightstands, not two.
    const names = new Set(attempt.score.missed.map((item) => item.name.replace(/ \(\d+ of \d+\)$/, '')));
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, missed]) => ({ name, missed, of: answered.length }))
    .sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name));
}

/**
 * The whole move per run: every room's n-th answer added together, sized as one truck.
 *
 * This is the number the product actually shows. One room rarely fills a van, so a
 * room-by-room truck comparison says little; the rooms together are the real test.
 * A run in which any room failed has no whole-move answer, as it would not in the app.
 */
export function wholeMove(rooms: readonly RoomResult[]): { measuredCuFt: number; runs: ({ seenCuFt: number; truth: TruckSize; seen: TruckSize } | null)[] } {
  const measuredCuFt = sum(rooms.map((room) => room.measuredCuFt));
  const count = Math.max(0, ...rooms.map((room) => room.attempts.length));
  const runs = Array.from({ length: count }, (_, i) => {
    let seenCuFt = 0;
    for (const room of rooms) {
      const attempt = room.attempts[i];
      if (!attempt?.ok) return null;
      seenCuFt += attempt.score.seenCuFt;
    }
    return { seenCuFt, truth: truckFor(measuredCuFt), seen: truckFor(seenCuFt) };
  });
  return { measuredCuFt, runs };
}

/* ------------------------------------------------------------ move scenarios */

/** Every combination of at least `minSize` items, smallest combinations first, in input order. */
export function combinations<T>(items: readonly T[], minSize: number): T[][] {
  const out: T[][] = [];
  for (let mask = 1; mask < 1 << items.length; mask++) {
    const picked = items.filter((_, i) => (mask >> i) & 1);
    if (picked.length >= minSize) out.push(picked);
  }
  return out.sort((a, b) => a.length - b.length);
}

/**
 * How close a raw volume's buffered load sits to the nearest truck line, as a fraction
 * of that line. A move 2% from a line changes truck on a 2% error; one 30% away does
 * not. It is what makes a wrong truck on one move forgivable and on another a failure.
 */
export function truckLineMargin(rawCuFt: number): number {
  const buffered = rawCuFt * (1 + DEFAULT_PACKING_BUFFER_PCT);
  return Math.min(...TRUCK_SIZES.map((size) => Math.abs(buffered - usableCapacityCuFt(size)) / usableCapacityCuFt(size)));
}

/** An item listed in one room that was measured in another room of the same move. */
export interface CrossRoomItem {
  name: string;
  cubicFeet: number;
  listedIn: string;
  belongsTo: string;
  /** True when its own room listed it too – counted twice in the move, not only misplaced. */
  countedTwice: boolean;
}

export interface MoveAnswer {
  seenCuFt: number;
  seen: TruckSize;
  verdict: 'exact' | 'over' | 'UNDER';
  crossRoom: CrossRoomItem[];
}

export interface MoveScenario {
  keys: string[];
  roomNames: string[];
  measuredCuFt: number;
  truth: TruckSize;
  margin: number;
  /** Every room in it is marked complete in truth.json. */
  complete: boolean;
  /** One per run; null where a room in the move had no usable answer, as in the app. */
  answers: (MoveAnswer | null)[];
}

/**
 * Items listed in one room of a move that belong to another: same kind, about the same
 * size, as an item measured in that other room. The family room's first answers counted
 * the breakfast room's hutch and console table this way; in a move of both rooms that
 * volume is on the truck twice.
 */
export function crossRoomItems(rooms: readonly RoomResult[], run: number): CrossRoomItem[] {
  const found: CrossRoomItem[] = [];
  for (const room of rooms) {
    const attempt = room.attempts[run];
    if (!attempt?.ok) continue;
    // Extras, and pairings that fit an item in another room clearly better than the item
    // they were paired with: the family room's "Narrow Console Table" was paired with one
    // of its own 14 in side tables, which hid a console table from the next room.
    const candidates = [
      ...attempt.score.extras.map((extra) => ({ seen: extra.seen, ownFit: 0 })),
      ...attempt.score.pairs.map((pair) => ({ seen: pair.seen, ownFit: sizeSimilarity(pair.measured, pair.seen) })),
    ];
    for (const { seen, ownFit } of candidates) {
      for (const other of rooms) {
        if (other === room) continue;
        const match = other.measured.find((item) => {
          const fit = sizeSimilarity(item, seen);
          return nameSimilarity(item.names, seen.name) > 0 && fit >= DUPLICATE_SIZE_SIMILARITY && fit > ownFit + BETTER_FIT_MARGIN;
        });
        if (!match) continue;
        const own = other.attempts[run];
        found.push({
          name: seen.name,
          cubicFeet: seen.cubicFeet,
          listedIn: room.roomName,
          belongsTo: other.roomName,
          countedTwice: own?.ok === true && own.score.pairs.some((pair) => pair.measured === match),
        });
        break;
      }
    }
  }
  return found;
}

/** How much better an item must fit another room's measurement to be called misplaced. */
const BETTER_FIT_MARGIN = 0.15;

/**
 * Every combination of two or more measured rooms, scored as one move from the answers
 * already saved – no further requests. Four rooms make eleven moves of different sizes,
 * so truck accuracy is tested across several truck lines, not only at whatever size one
 * house happens to be.
 *
 * The combinations share answers, so they are not independent evidence: one bad room
 * answer shows up in every move containing it. Read them for which truck lines a given
 * error crosses, not as eleven separate trials.
 */
export function moveScenarios(rooms: readonly RoomResult[], minRooms = 2): MoveScenario[] {
  return combinations(rooms, minRooms)
    .map((combo) => {
      const measuredCuFt = sum(combo.map((room) => room.measuredCuFt));
      const truth = truckFor(measuredCuFt);
      const count = Math.max(0, ...combo.map((room) => room.attempts.length));
      const answers = Array.from({ length: count }, (_, i): MoveAnswer | null => {
        let seenCuFt = 0;
        for (const room of combo) {
          const attempt = room.attempts[i];
          if (!attempt?.ok) return null;
          seenCuFt += attempt.score.seenCuFt;
        }
        const seen = truckFor(seenCuFt);
        const order = TRUCK_SIZES.indexOf(seen) - TRUCK_SIZES.indexOf(truth);
        return { seenCuFt, seen, verdict: order === 0 ? 'exact' : order > 0 ? 'over' : 'UNDER', crossRoom: crossRoomItems(combo, i) };
      });
      return {
        keys: combo.map((room) => room.key),
        roomNames: combo.map((room) => room.roomName),
        measuredCuFt,
        truth,
        margin: truckLineMargin(measuredCuFt),
        complete: combo.every((room) => room.complete),
        answers,
      };
    })
    .sort((a, b) => a.measuredCuFt - b.measuredCuFt);
}

/* -------------------------------------------------------------- simulation */

/** A small seeded generator (mulberry32), so a simulation prints the same numbers twice. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Combine = 'one answer' | 'median' | 'largest';

export interface EnsembleResult {
  k: number;
  combine: Combine;
  exact: number;
  over: number;
  under: number;
  medianAbsError: number;
  p90AbsError: number;
  /** The middle 80% of room totals this way of answering produces. */
  p10CuFt: number;
  p90CuFt: number;
}

export interface Simulation {
  answers: number;
  draws: number;
  truth: TruckSize;
  results: EnsembleResult[];
  /** The exact-truck rate as estimated from the first n real answers – where it settles. */
  convergence: { n: number; exact: number }[];
  /** Half-width of the 95% interval on the one-answer exact rate, from the real answers. */
  exactInterval: number;
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/**
 * Resamples a room's real answers into many simulated moves, to see how the truck turns
 * out when the app asks once, or asks k times and takes the median or the largest total.
 *
 * What it can show: how often one answer gives the right truck, and whether combining
 * answers would help – the only sense in which more runs make detection better, because
 * the model does not learn between requests. What it cannot show: anything the real
 * answers did not contain. Every simulated move is built from them, so with a handful
 * of real answers a thousand simulated moves repeat the same few; the interval on the
 * real answers, not the number of simulated moves, is the precision.
 *
 * Deadline ignored, and a room's total is its whole answer, as the app would sum it.
 */
export function simulateRoom(room: RoomResult, draws: number, ks: readonly number[] = [1, 2, 3, 5], seed = 1): Simulation | null {
  const totals = room.attempts.flatMap((attempt) => (attempt.ok ? [attempt.score.seenCuFt] : []));
  if (totals.length === 0) return null;
  const truth = truckFor(room.measuredCuFt);
  const random = seededRandom(seed);
  const verdict = (cuFt: number) => Math.sign(TRUCK_SIZES.indexOf(truckFor(cuFt)) - TRUCK_SIZES.indexOf(truth));

  const results: EnsembleResult[] = [];
  for (const k of ks) {
    for (const combine of k === 1 ? (['one answer'] as const) : (['median', 'largest'] as const)) {
      const simulated: number[] = [];
      for (let d = 0; d < draws; d++) {
        const picked = Array.from({ length: k }, () => totals[Math.floor(random() * totals.length)]!).sort((a, b) => a - b);
        simulated.push(combine === 'largest' ? picked[picked.length - 1]! : combine === 'median' ? median(picked)! : picked[0]!);
      }
      const verdicts = simulated.map(verdict);
      const errors = simulated.map((cuFt) => Math.abs(cuFt - room.measuredCuFt) / room.measuredCuFt).sort((a, b) => a - b);
      const sortedTotals = [...simulated].sort((a, b) => a - b);
      results.push({
        k,
        combine,
        exact: verdicts.filter((v) => v === 0).length / draws,
        over: verdicts.filter((v) => v > 0).length / draws,
        under: verdicts.filter((v) => v < 0).length / draws,
        medianAbsError: median(errors)!,
        p90AbsError: quantile(errors, 0.9),
        p10CuFt: quantile(sortedTotals, 0.1),
        p90CuFt: quantile(sortedTotals, 0.9),
      });
    }
  }

  const exactFlags = totals.map((cuFt) => (verdict(cuFt) === 0 ? 1 : 0));
  const checkpoints = [1, 2, 3, 5, 10, 20, 30, 50, 75, 100].filter((n) => n <= totals.length);
  if (checkpoints[checkpoints.length - 1] !== totals.length) checkpoints.push(totals.length);
  const p = sum(exactFlags) / totals.length;
  return {
    answers: totals.length,
    draws,
    truth,
    results,
    convergence: checkpoints.map((n) => ({ n, exact: sum(exactFlags.slice(0, n)) / n })),
    // Normal approximation, floored so a handful of identical answers is not read as certainty.
    exactInterval: Math.max(1.96 * Math.sqrt((p * (1 - p)) / totals.length), 1 / Math.sqrt(totals.length)),
  };
}

/* ---------------------------------------------------------------- helpers */

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
