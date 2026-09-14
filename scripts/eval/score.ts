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
import { recommendTruckSize, TRUCK_CAPACITY } from '../../src/domain/truck';
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
}

export interface TruthRoom {
  roomName: string;
  items: TruthItem[];
  /** Measured ceiling height in feet; absent means standard. */
  ceilingFt?: number;
}

/** One physical object as measured – a truth item with its count expanded. */
export interface MeasuredItem {
  name: string;
  names: string[];
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  cubicFeet: number;
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
      items.push(item as unknown as TruthItem);
    });
    if (value.ceilingFt !== undefined) {
      if (typeof value.ceilingFt !== 'number' || normaliseCeilingHeight(value.ceilingFt * 12) === null) {
        problems.push(`"${rawKey}": "ceilingFt" must be a height in feet between 6 and 20`);
      }
    }
    rooms.set(key, { roomName: value.roomName, items, ...(typeof value.ceilingFt === 'number' ? { ceilingFt: value.ceilingFt } : {}) });
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
      })),
    ),
  };
}

/* ---------------------------------------------------------------- pairing */

/** Words that describe an object without saying what it is. */
const IGNORED = new Set([
  'a', 'an', 'the', 'of', 'and', 'with', 'for', 'in', 'on', 'set', 'pair', 'piece',
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
  let text = name.toLowerCase().replace(/\([^)]*\)/g, ' ');
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
      duplicateOf: pairs.find((pair) => nameSimilarity(pair.measured.names, found.name) > 0)?.measured.name ?? null,
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
  attempts: AttemptScore[];
}

export function scoreAttempt(attempt: Attempt, measured: readonly MeasuredItem[], roomName: string, deadlineMs: number): AttemptScore {
  const common = { ms: attempt.ms, outputTokens: attempt.outputTokens, stopReason: attempt.stopReason };
  if (attempt.text === null) return { ok: false, reason: attempt.error ?? 'no answer', ...common };
  const answer = readAnswer(attempt.text, attempt.stopReason, roomName);
  if (!answer.ok) return { ok: false, reason: answer.reason, ...common };
  return { ok: true, late: attempt.ms > deadlineMs, score: scoreRoom(measured, answer.items), ...common };
}

/** Every room of a saved run that has ground truth, scored against it. */
export function scoreRun(run: SavedRun, truth: ReadonlyMap<string, TruthRoom>): { rooms: RoomResult[]; unscored: string[] } {
  const rooms: RoomResult[] = [];
  const unscored: string[] = [];
  for (const [key, saved] of Object.entries(run.rooms)) {
    const room = truth.get(key);
    if (!room) {
      unscored.push(key);
      continue;
    }
    const measured = expandTruth(room);
    rooms.push({
      key,
      roomName: room.roomName,
      photoCount: saved.photoCount,
      measuredCuFt: sum(measured.map((item) => item.cubicFeet)),
      attempts: saved.attempts.map((attempt) => scoreAttempt(attempt, measured, room.roomName, run.deadlineMs)),
    });
  }
  return { rooms, unscored };
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
