/**
 * Measures whether vision-based detection sizes the truck correctly.
 *
 * Runs outside the app – no deploy, no device, no App Store build. Point it at a
 * folder of room photos with tape-measured ground truth and it reports the numbers
 * that decide whether this product works.
 *
 * It is only worth anything if what it measures is what ships, so every step that
 * touches the model goes through the app's own code:
 *
 *   - the request      `buildDetectBody` – the route's prompt, message and budget
 *   - the photos       `preparePhoto` – resized and re-encoded as `prepareUpload` does,
 *                      turned upright, location and all other metadata removed
 *   - the grouping     every photo of a room in ONE request, as the capture screen sends it
 *   - the answer       `parseDetectedItem` – the parser the app reads it with
 *   - the truck        `DEFAULT_PACKING_BUFFER_PCT` and `recommendTruckSize`
 *   - the deadline     `UPSTREAM_TIMEOUT_MS`, with cut-off requests counted, not hidden
 *
 * Modes:
 *   --mock       Score the mock detector. No photos read, no key, no cost – proves the
 *                scoring works.
 *   --dry-run    Prepare every photo and build every request exactly as a live run
 *                would, then send nothing. Run this first, before spending money.
 *   (neither)    Live. Needs VISION_API_KEY in the environment.
 *   --dir <path> Photo folder. Default ./eval-photos.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseDetectedItem, type DetectRequest } from '../../src/api/detect';
import { mockDetect } from '../../src/api/mocks/detect';
import { MAX_PHOTOS } from '../../src/domain/capture';
import { recommendTruckSize, TRUCK_CAPACITY } from '../../src/domain/truck';
import type { TruckSize } from '../../src/domain/types';
import { ceilingForDetection, formatCeiling, normaliseCeilingHeight } from '../../src/domain/ceiling';
import { cubicFeetFor, DEFAULT_PACKING_BUFFER_PCT } from '../../src/domain/volume';
import {
  buildDetectBody,
  DEFAULT_VISION_MODEL,
  SYSTEM_PROMPT,
  UPSTREAM_TIMEOUT_MS,
} from '../../src/vision/detectRequest';
import { estimateImageTokens, groupPhotosByRoom, roomKeyOf } from './photos';
import { preparePhoto, type PreparedPhoto } from './prepare';

interface TruthItem {
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}
interface TruthRoom {
  roomName: string;
  items: TruthItem[];
  /**
   * The room's ceiling height in feet, as measured – optional. Passed to the model
   * exactly as the app passes the answer to "Are your ceilings the standard 8ft
   * high?", so the eval measures the question too. Absent means standard.
   */
  ceilingFt?: number;
}

type Outcome =
  | { ok: true; cubicFeet: number; itemCount: number; ms: number }
  | { ok: false; reason: string; ms: number };

/** Claude Opus 5 list prices per million tokens – for the cost line only. */
const OPUS_5_PRICE = { input: 5, output: 25 };

const args = process.argv.slice(2);
const mode: 'mock' | 'dry-run' | 'live' = args.includes('--mock')
  ? 'mock'
  : args.includes('--dry-run')
    ? 'dry-run'
    : 'live';
if (args.includes('--mock') && args.includes('--dry-run')) {
  console.error('Choose one of --mock or --dry-run.');
  process.exit(1);
}
const dirArg = args.indexOf('--dir');
const photoDir = dirArg >= 0 && args[dirArg + 1] ? args[dirArg + 1]! : './eval-photos';
const model = process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL;

/*
 * Every intermediate copy of every photo lives here, and it is deleted however the
 * run ends. These are pictures of somebody's home; the eval does not get to leave
 * copies of them in /tmp.
 */
const workDir = mkdtempSync(join(tmpdir(), 'loadsy-eval-'));
const cleanUp = () => rmSync(workDir, { recursive: true, force: true });
process.on('exit', cleanUp);
process.on('SIGINT', () => process.exit(130));

const usage = { input: 0, output: 0 };

/** The truck a load of this raw volume needs, through the app's own buffer and bands. */
function truckFor(rawCuFt: number): TruckSize {
  return recommendTruckSize(rawCuFt * (1 + DEFAULT_PACKING_BUFFER_PCT));
}

function volumeOf(items: readonly TruthItem[]): number {
  return items.reduce((sum, item) => sum + cubicFeetFor({ ...item, isEstimated: false }), 0);
}

function loadTruth(): Map<string, TruthRoom> {
  let raw: Record<string, TruthRoom>;
  try {
    raw = JSON.parse(readFileSync(join(photoDir, 'truth.json'), 'utf8')) as Record<string, TruthRoom>;
  } catch {
    if (mode === 'dry-run') return new Map();
    console.error(`No readable truth.json in ${photoDir}. See scripts/eval/README.md.`);
    process.exit(1);
  }
  // Keys may name a room (`living-room`) or, from the older one-photo format, a
  // photo (`living-room.jpg`). Both resolve to the room.
  return new Map(Object.entries(raw).map(([key, room]) => [roomKeyOf(key), room]));
}

/** A truth room's ceiling in inches, or null when it has none or it is not a plausible height. */
function ceilingInches(room: TruthRoom | undefined): number | null {
  return typeof room?.ceilingFt === 'number' ? normaliseCeilingHeight(room.ceilingFt * 12) : null;
}

/** Numbers every photo's intermediates in the work directory, so no two collide. */
let photoCounter = 0;

function prepareRoom(photos: readonly string[]): PreparedPhoto[] {
  return photos.map((name) => preparePhoto(join(photoDir, name), workDir, photoCounter++));
}

async function detectLive(key: string, room: TruthRoom, photos: readonly string[], apiKey: string): Promise<Outcome> {

  let prepared: PreparedPhoto[];
  try {
    prepared = prepareRoom(photos);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'could not prepare photos', ms: 0 };
  }

  const body = buildDetectBody(model, room.roomName, prepared.map((photo) => photo.base64), {
    ceilingHeightIn: ceilingInches(room),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - started;
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}`, ms };

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    usage.input += payload.usage?.input_tokens ?? 0;
    usage.output += payload.usage?.output_tokens ?? 0;

    const text = payload.content?.find((block) => block.type === 'text')?.text ?? '';
    let items: unknown;
    try {
      items = (JSON.parse(text) as { items?: unknown }).items;
    } catch {
      // The stop reason is the diagnosis: `max_tokens` here means thinking used up the
      // response budget before the JSON finished – sprint item E2.
      return { ok: false, reason: `unparseable answer (stop_reason: ${payload.stop_reason ?? 'unknown'})`, ms };
    }
    if (!Array.isArray(items)) return { ok: false, reason: 'answer had no item list', ms };

    const request: DetectRequest = {
      roomId: key,
      roomName: room.roomName,
      photos: [{ photoId: `${key}-eval`, imageData: '' }],
    };
    const parsed = items.flatMap((item, index) => parseDetectedItem(item, index, request));
    return { ok: true, cubicFeet: parsed.reduce((sum, item) => sum + item.cubicFeet, 0), itemCount: parsed.length, ms };
  } catch (error) {
    const ms = Date.now() - started;
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, reason: aborted ? `timed out at ${UPSTREAM_TIMEOUT_MS / 1000}s, as the route would` : 'network error', ms };
  } finally {
    clearTimeout(timer);
  }
}

function detectMock(key: string, room: TruthRoom): Outcome {
  const items = mockDetect(key, room.roomName, key);
  return { ok: true, cubicFeet: items.reduce((sum, item) => sum + item.cubicFeet, 0), itemCount: items.length, ms: 0 };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function main() {
  // Checked before anything is printed or prepared, so a missing key fails at once
  // rather than halfway down a results table.
  const apiKey = process.env.VISION_API_KEY ?? '';
  if (mode === 'live' && !apiKey) {
    console.error('VISION_API_KEY is not set. Try --dry-run first, which needs no key and sends nothing.');
    process.exit(1);
  }

  const truth = loadTruth();
  let files: string[];
  try {
    files = readdirSync(photoDir);
  } catch {
    console.error(`No folder at ${photoDir}.`);
    process.exit(1);
  }
  const rooms = groupPhotosByRoom(files);
  if (rooms.size === 0) {
    console.error(`No photos in ${photoDir}. Name them by room: living-room-1.jpg, living-room-2.jpg, …`);
    process.exit(1);
  }

  console.log(`\n${mode.toUpperCase()} · ${rooms.size} room(s) · ${[...rooms.values()].flat().length} photo(s)\n`);

  // Problems with the folder itself, before anything is spent.
  for (const key of truth.keys()) {
    if (!rooms.has(key)) console.log(`  ! "${key}" is in truth.json but no photo is named ${key}-1.jpg (or ${key}.jpg)`);
  }

  if (mode === 'dry-run') {
    await dryRun(rooms, truth);
    return;
  }

  const errors: number[] = [];
  const latencies: number[] = [];
  const failures: string[] = [];
  let truckExact = 0;
  let truckUnder = 0;
  let totalTrue = 0;
  let totalPredicted = 0;

  console.log('room'.padEnd(18), 'photos'.padStart(6), 'measured'.padStart(10), 'predicted'.padStart(10), 'error'.padStart(7), '  truck');

  for (const [key, photos] of rooms) {
    const room = truth.get(key);
    if (!room) {
      console.log(`${key.slice(0, 17).padEnd(18)} ${String(photos.length).padStart(6)}  no ground truth – add "${key}" to truth.json`);
      continue;
    }
    if (photos.length > MAX_PHOTOS) {
      console.log(`${room.roomName.slice(0, 17).padEnd(18)} ${String(photos.length).padStart(6)}  skipped – the app sends at most ${MAX_PHOTOS} photos per room`);
      continue;
    }

    const outcome = mode === 'mock' ? detectMock(key, room) : await detectLive(key, room, photos, apiKey);
    if (outcome.ms > 0) latencies.push(outcome.ms);
    if (!outcome.ok) {
      failures.push(`${room.roomName}: ${outcome.reason}`);
      console.log(`${room.roomName.slice(0, 17).padEnd(18)} ${String(photos.length).padStart(6)}  FAILED – ${outcome.reason}`);
      continue;
    }

    const measured = volumeOf(room.items);
    const predicted = outcome.cubicFeet;
    totalTrue += measured;
    totalPredicted += predicted;
    const error = measured === 0 ? 0 : (predicted - measured) / measured;
    errors.push(Math.abs(error));

    const truckTrue = truckFor(measured);
    const truckPredicted = truckFor(predicted);
    if (truckTrue === truckPredicted) truckExact += 1;
    // Under-sizing strands belongings on the driveway, so it is counted on its own.
    const under = TRUCK_CAPACITY[truckPredicted].max < TRUCK_CAPACITY[truckTrue].max;
    if (under) truckUnder += 1;

    console.log(
      room.roomName.slice(0, 17).padEnd(18),
      String(photos.length).padStart(6),
      `${measured.toFixed(1)} ft³`.padStart(10),
      `${predicted.toFixed(1)} ft³`.padStart(10),
      `${(error * 100).toFixed(0)}%`.padStart(7),
      ` ${truckTrue} → ${truckPredicted}${under ? '  UNDER-SIZED' : ''}${outcome.ms ? `  ${(outcome.ms / 1000).toFixed(1)}s` : ''}`,
    );
  }

  const scored = errors.length;
  const median = percentile([...errors].sort((a, b) => a - b), 50);
  const bias = totalTrue === 0 ? 0 : (totalPredicted - totalTrue) / totalTrue;
  const pct = (n: number) => (scored === 0 ? '–' : `${((n / scored) * 100).toFixed(0)}%`);

  console.log('\n— results —');
  console.log(`rooms scored                 ${scored}${failures.length ? `   (${failures.length} failed – not scored, listed below)` : ''}`);
  console.log(`median absolute room error   ${(median * 100).toFixed(1)}%   (pass ≤ 15%)`);
  console.log(`whole-move volume bias       ${(bias * 100).toFixed(1)}%   (bias hurts far more than spread)`);
  console.log(`truck size exact             ${pct(truckExact)}   (pass ≥ 85%)`);
  console.log(`truck UNDER-sized            ${pct(truckUnder)}   (pass ≤ 5% – the binding one)`);
  if (latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    console.log(`latency p50 / p95            ${(percentile(sorted, 50) / 1000).toFixed(1)}s / ${(percentile(sorted, 95) / 1000).toFixed(1)}s   (route gives up at ${UPSTREAM_TIMEOUT_MS / 1000}s)`);
  }
  if (mode === 'live') {
    const cost = (usage.input * OPUS_5_PRICE.input + usage.output * OPUS_5_PRICE.output) / 1e6;
    console.log(
      `tokens in / out              ${usage.input.toLocaleString()} / ${usage.output.toLocaleString()}` +
        (model === DEFAULT_VISION_MODEL ? `   ≈ $${cost.toFixed(2)} at Opus 5 list prices` : ''),
    );
  }
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  console.log('');
}

async function dryRun(rooms: Map<string, string[]>, truth: Map<string, TruthRoom>) {
  let imageTokens = 0;
  let textTokens = 0;
  let ready = 0;

  for (const [key, photos] of rooms) {
    const room = truth.get(key);
    const label = room?.roomName ?? key;
    const notes: string[] = [];
    if (!room) notes.push(`no ground truth yet – add "${key}" to truth.json`);
    if (photos.length > MAX_PHOTOS) notes.push(`${photos.length} photos; the app sends at most ${MAX_PHOTOS}`);

    console.log(`${label}${notes.length ? `   ! ${notes.join('; ')}` : ''}`);
    let prepared: PreparedPhoto[];
    try {
      prepared = prepareRoom(photos.slice(0, MAX_PHOTOS));
    } catch (error) {
      console.log(`  ✗ ${error instanceof Error ? error.message : 'could not prepare photos'}\n`);
      continue;
    }

    let roomImageTokens = 0;
    prepared.forEach((photo, i) => {
      const turned = photo.orientation === 1 ? '' : `, turned upright (EXIF ${photo.orientation})`;
      console.log(`  ${photos[i]}  →  ${photo.width}×${photo.height}, ${(photo.bytes / 1024).toFixed(0)} KB${turned}, metadata removed`);
      roomImageTokens += estimateImageTokens(photo.width, photo.height);
    });

    const ceiling = ceilingInches(room);
    if (ceilingForDetection(ceiling) !== null) console.log(`  ceiling ${formatCeiling(ceiling!)} – told to the model`);
    const body = buildDetectBody(model, label, prepared.map((photo) => photo.base64), { ceilingHeightIn: ceiling });
    const text = body.messages[0]!.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    // Only rooms a live run would actually send – ground truth present, within the
    // photo limit – count towards the estimate, so it prices the run you'd really do.
    if (room && photos.length <= MAX_PHOTOS) {
      ready += 1;
      imageTokens += roomImageTokens;
      textTokens += Math.ceil((SYSTEM_PROMPT.length + text.length) / 4);
    }
    console.log('');
  }

  const inputCost = ((imageTokens + textTokens) * OPUS_5_PRICE.input) / 1e6;
  const outputCost = (ready * 1500 * OPUS_5_PRICE.output) / 1e6;
  console.log('— dry run: nothing was sent —');
  console.log(`rooms ready to score         ${ready} of ${rooms.size}`);
  console.log(`estimated input tokens       ≈ ${(imageTokens + textTokens).toLocaleString()}   (ready rooms only)`);
  console.log(`estimated live cost          ≈ $${(inputCost + outputCost).toFixed(2)}   (assumes ~1,500 output tokens a room; the live run reports the real figure)\n`);
}

void main();
