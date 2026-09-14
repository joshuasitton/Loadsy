/**
 * Measures whether vision-based detection sizes the truck correctly.
 *
 * Runs outside the app – no deploy, no device, no App Store build. Point it at a
 * folder of room photos with tape-measured ground truth and it reports the numbers
 * that decide whether this product works, room by room and item by item.
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
 *   - the deadline     `UPSTREAM_TIMEOUT_MS`, with late answers counted as failures
 *
 * One departure, on purpose: the eval waits past the route's deadline instead of
 * cutting the request off, and scores the answer twice – once as a user would get it
 * (late means failed), once as the model gave it. A cut-off request costs money and
 * teaches nothing; a late one says whether the fix is speed or accuracy.
 *
 * Modes:
 *   --mock          Score the mock detector against scripts/eval/example-truth.json.
 *                   No photos, no key, no cost – proves the scoring works.
 *   --dry-run       Prepare every photo and build every request exactly as a live run
 *                   would, then send nothing. Run this first, before spending money.
 *   (neither)       Live. Needs VISION_API_KEY in the environment. Every answer is
 *                   saved to eval-results/ as it arrives.
 *   --from <file>   Score a saved run again against today's truth.json. No key, no cost.
 *
 * Options:
 *   --runs <n>        Ask the model n times per room (default 3). Answers vary; one is an anecdote.
 *   --max-photos <n>  Send only each room's first n photos – compare one angle against several.
 *   --label <text>    Name the saved run: --label e2-before.
 *   --compare <file>  Print this run beside a saved one.
 *   --every-answer    Item-by-item detail for every answer, not only each room's first.
 *   --dir <path>      Photo folder. Default ./eval-photos.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { mockDetect } from '../../src/api/mocks/detect';
import { MAX_PHOTOS } from '../../src/domain/capture';
import { ceilingForDetection, formatCeiling, normaliseCeilingHeight } from '../../src/domain/ceiling';
import {
  buildDetectBody,
  DEFAULT_VISION_MODEL,
  DETECT_MAX_TOKENS,
  SYSTEM_PROMPT,
  UPSTREAM_TIMEOUT_MS,
  type VisionRequestBody,
} from '../../src/vision/detectRequest';
import { estimateImageTokens, groupPhotosByRoom, roomKeyOf } from './photos';
import { preparePhoto, type PreparedPhoto } from './prepare';
import { compareLines, costEstimate, roomLines, summaryLines } from './report';
import {
  isSavedRun,
  readTruth,
  scoreRun,
  type Attempt,
  type SavedRoom,
  type SavedRun,
  type TruthRoom,
} from './score';

/** How long the eval waits for an answer the route would already have given up on. */
const PATIENCE_MS = 120_000;
const RESULTS_DIR = './eval-results';
const EXAMPLE_TRUTH = new URL('./example-truth.json', import.meta.url);

/* -------------------------------------------------------------- arguments */

const args = process.argv.slice(2);

function option(name: string): string | null {
  const at = args.indexOf(name);
  if (at < 0) return null;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) fail(`${name} needs a value.`);
  return value;
}

function wholeNumber(name: string, fallback: number, max: number): number {
  const raw = option(name);
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) fail(`${name} must be a whole number from 1 to ${max}.`);
  return n;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const fromFile = option('--from');
const modes = [args.includes('--mock') && 'mock', args.includes('--dry-run') && 'dry-run', fromFile && 'from'].filter(Boolean);
if (modes.length > 1) fail('Choose one of --mock, --dry-run or --from.');
const mode = (modes[0] || 'live') as 'mock' | 'dry-run' | 'from' | 'live';

const photoDir = option('--dir') ?? './eval-photos';
const runs = wholeNumber('--runs', 3, 10);
const maxPhotos = wholeNumber('--max-photos', MAX_PHOTOS, MAX_PHOTOS);
const label = option('--label') ?? (maxPhotos < MAX_PHOTOS ? `max-${maxPhotos}-photos` : 'live');
const compareFile = option('--compare');
const everyAnswer = args.includes('--every-answer');
const model = process.env.VISION_MODEL ?? DEFAULT_VISION_MODEL;

/*
 * Every intermediate copy of every photo lives here, and it is deleted however the
 * run ends. These are pictures of somebody's home; the eval does not get to leave
 * copies of them in /tmp.
 */
const workDir = mkdtempSync(join(tmpdir(), 'loadsy-eval-'));
process.on('exit', () => rmSync(workDir, { recursive: true, force: true }));
process.on('SIGINT', () => process.exit(130));

/* ------------------------------------------------------------------ input */

function loadTruth(path: string | URL, required: boolean): Map<string, TruthRoom> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (!required) return new Map();
    const why = error instanceof SyntaxError ? `is not valid JSON (${error.message})` : 'could not be read';
    fail(`${String(path)} ${why}. See scripts/eval/README.md.`);
  }
  // Keys may name a room (`living-room`) or, from the older one-photo format, a
  // photo (`living-room.jpg`). Both resolve to the room.
  const { rooms, problems } = readTruth(raw, roomKeyOf);
  if (problems.length > 0) {
    // A typo in a measurement changes every number printed after it, so nothing runs
    // until truth.json is right – a dry run only warns, since it spends nothing.
    console.error(`${String(path)} needs fixing first:\n${problems.map((p) => `  ✗ ${p}`).join('\n')}\n`);
    if (mode !== 'dry-run') process.exit(1);
  }
  return rooms;
}

function readRun(path: string): SavedRun {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(`Could not read a saved run at ${path}.`);
  }
  if (!isSavedRun(raw)) fail(`${path} is not a saved eval run.`);
  return raw;
}

/** A truth room's ceiling in inches, or null when it has none or it is not a plausible height. */
function ceilingInches(room: TruthRoom | undefined): number | null {
  return typeof room?.ceilingFt === 'number' ? normaliseCeilingHeight(room.ceilingFt * 12) : null;
}

function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * The request, fingerprinted without its images. Two runs with the same fingerprint
 * and the same photos sent the model exactly the same thing.
 */
function requestHash(body: VisionRequestBody, photoHashes: readonly string[]): string {
  let image = 0;
  const content = body.messages[0]!.content.map((block) => (block.type === 'image' ? { image: photoHashes[image++] } : block));
  return sha256(JSON.stringify({ ...body, messages: [{ ...body.messages[0], content }] }));
}

/** Numbers every photo's intermediates in the work directory, so no two collide. */
let photoCounter = 0;

/** Rooms with photos in the folder, limited to what the app – and --max-photos – would send. */
function photoRooms(): Map<string, string[]> {
  let files: string[];
  try {
    files = readdirSync(photoDir);
  } catch {
    fail(`No folder at ${photoDir}.`);
  }
  const rooms = groupPhotosByRoom(files);
  if (rooms.size === 0) fail(`No photos in ${photoDir}. Name them by room: living-room-1.jpg, living-room-2.jpg, …`);
  return rooms;
}

/* --------------------------------------------------------------- the model */

async function ask(body: VisionRequestBody, apiKey: string): Promise<Attempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PATIENCE_MS);
  const started = Date.now();
  const empty = { text: null, stopReason: null, inputTokens: 0, outputTokens: 0 };
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      // The status only. An error body can echo the request, and the request is photos.
      return { ...empty, error: `HTTP ${response.status}`, ms: Date.now() - started };
    }
    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: payload.content?.find((block) => block.type === 'text')?.text ?? '',
      stopReason: payload.stop_reason ?? null,
      error: null,
      ms: Date.now() - started,
      inputTokens: payload.usage?.input_tokens ?? 0,
      outputTokens: payload.usage?.output_tokens ?? 0,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ...empty, error: aborted ? `no answer after ${PATIENCE_MS / 1000}s` : 'network error', ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ modes */

async function live(truth: Map<string, TruthRoom>): Promise<SavedRun> {
  // Checked before anything is prepared, so a missing key fails at once.
  const apiKey = process.env.VISION_API_KEY ?? '';
  if (!apiKey) fail('VISION_API_KEY is not set. Try --dry-run first, which needs no key and sends nothing.');

  const rooms = photoRooms();
  const startedAt = new Date().toISOString();
  const run: SavedRun = {
    format: 'loadsy-eval-run',
    version: 1,
    label,
    startedAt,
    model,
    maxTokens: DETECT_MAX_TOKENS,
    deadlineMs: UPSTREAM_TIMEOUT_MS,
    rooms: {},
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  // Local time in the name, because that is the clock the person running it reads.
  const now = new Date(startedAt);
  const two = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-${two(now.getHours())}-${two(now.getMinutes())}`;
  const file = join(RESULTS_DIR, `${stamp}-${label.replace(/[^a-z0-9-]+/gi, '-')}.json`);

  // Photos are prepared once per room, not once per run: the same bytes every time,
  // so the runs differ only in what the model does.
  const requests: { key: string; body: VisionRequestBody }[] = [];
  for (const [key, photos] of rooms) {
    const room = truth.get(key);
    if (!room) {
      console.log(`  ! ${key}: no ground truth in truth.json – not sent`);
      continue;
    }
    const chosen = photos.slice(0, maxPhotos);
    let prepared: PreparedPhoto[];
    try {
      prepared = chosen.map((name) => preparePhoto(join(photoDir, name), workDir, photoCounter++));
    } catch (error) {
      console.log(`  ✗ ${key}: ${error instanceof Error ? error.message : 'could not prepare photos'} – not sent`);
      continue;
    }
    const photoHashes = chosen.map((name) => sha256(readFileSync(join(photoDir, name))));
    const ceilingIn = ceilingInches(room);
    const body = buildDetectBody(model, room.roomName, prepared.map((photo) => photo.base64), { ceilingHeightIn: ceilingIn });
    run.rooms[key] = { roomName: room.roomName, photoCount: chosen.length, ceilingIn, photoHashes, requestHash: requestHash(body, photoHashes), attempts: [] };
    requests.push({ key, body });
  }
  if (requests.length === 0) fail('Nothing to send: no room has both photos and ground truth.');

  const total = requests.length * runs;
  console.log(`LIVE · ${requests.length} room(s) × ${runs} run(s) = ${total} requests · ${model} · saving to ${file}\n`);

  let done = 0;
  for (let r = 0; r < runs; r++) {
    for (const { key, body } of requests) {
      const attempt = await ask(body, apiKey);
      run.rooms[key]!.attempts.push(attempt);
      // Written after every answer, so an interrupted run keeps what it paid for.
      writeFileSync(file, JSON.stringify(run, null, 2), { mode: 0o600 });
      done += 1;
      const outcome = attempt.error ?? `${(attempt.ms / 1000).toFixed(1)}s, ${attempt.outputTokens} tokens out`;
      console.log(`  [${done}/${total}] ${key} run ${r + 1}: ${outcome}`);
    }
  }
  console.log(`\nSaved. Score it again any time, free: npm run eval:detect -- --from ${file}\n`);
  return run;
}

/**
 * The mock detector, run through the same save format, parser and scorer as a live run.
 * Its answer is serialised to JSON and read back, so the parsing path is exercised too.
 */
function mock(truth: Map<string, TruthRoom>): SavedRun {
  const rooms: Record<string, SavedRoom> = {};
  for (const [key, room] of truth) {
    const items = mockDetect(key, room.roomName, key).map((item) => ({
      name: item.name,
      category: item.category,
      dimensions: item.dimensions,
      confidence: item.confidence,
      confidenceReason: item.confidenceReason,
    }));
    const attempt: Attempt = { text: JSON.stringify({ items }), stopReason: 'end_turn', error: null, ms: 0, inputTokens: 0, outputTokens: 0 };
    rooms[key] = { roomName: room.roomName, photoCount: 0, ceilingIn: null, photoHashes: [], requestHash: 'mock', attempts: [attempt] };
  }
  return { format: 'loadsy-eval-run', version: 1, label: 'mock', startedAt: new Date().toISOString(), model: 'mock', maxTokens: 0, deadlineMs: UPSTREAM_TIMEOUT_MS, rooms };
}

function dryRun(truth: Map<string, TruthRoom>) {
  const rooms = photoRooms();
  console.log(`DRY RUN · ${rooms.size} room(s) · nothing will be sent\n`);
  for (const key of truth.keys()) {
    if (!rooms.has(key)) console.log(`  ! "${key}" is in truth.json but no photo is named ${key}-1.jpg\n`);
  }

  let inputTokens = 0;
  let ready = 0;
  for (const [key, photos] of rooms) {
    const room = truth.get(key);
    const notes: string[] = [];
    if (!room) notes.push(`no ground truth yet – add "${key}" to truth.json`);
    if (photos.length > maxPhotos) notes.push(`${photos.length} photos; sending the first ${maxPhotos}`);
    console.log(`${room?.roomName ?? key}${notes.length ? `   ! ${notes.join('; ')}` : ''}`);

    const chosen = photos.slice(0, maxPhotos);
    let prepared: PreparedPhoto[];
    try {
      prepared = chosen.map((name) => preparePhoto(join(photoDir, name), workDir, photoCounter++));
    } catch (error) {
      console.log(`  ✗ ${error instanceof Error ? error.message : 'could not prepare photos'}\n`);
      continue;
    }

    let roomTokens = 0;
    prepared.forEach((photo, i) => {
      const turned = photo.orientation === 1 ? '' : `, turned upright (EXIF ${photo.orientation})`;
      console.log(`  ${chosen[i]}  →  ${photo.width}×${photo.height}, ${(photo.bytes / 1024).toFixed(0)} KB${turned}, metadata removed`);
      roomTokens += estimateImageTokens(photo.width, photo.height);
    });
    const ceiling = ceilingInches(room);
    if (ceilingForDetection(ceiling) !== null) console.log(`  ceiling ${formatCeiling(ceiling!)} – told to the model`);
    const body = buildDetectBody(model, room?.roomName ?? key, prepared.map((photo) => photo.base64), { ceilingHeightIn: ceiling });
    const text = body.messages[0]!.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');

    // Only rooms a live run would send – those with ground truth – are priced.
    if (room) {
      ready += 1;
      inputTokens += roomTokens + Math.ceil((SYSTEM_PROMPT.length + text.length) / 4);
    }
    console.log('');
  }

  const cost = costEstimate(inputTokens * runs, ready * runs, DETECT_MAX_TOKENS);
  console.log('— dry run: nothing was sent —');
  console.log(`rooms ready to score         ${ready} of ${rooms.size}`);
  console.log(`requests a live run sends    ${ready * runs}   (${ready} room${ready === 1 ? '' : 's'} × ${runs} run${runs === 1 ? '' : 's'})`);
  console.log(`estimated live cost          ≈ $${cost.likely.toFixed(2)}, at most $${cost.worst.toFixed(2)}   (~1,500 output tokens an answer; at most the whole ${DETECT_MAX_TOKENS.toLocaleString()}-token budget)\n`);
}

/* ------------------------------------------------------------------- main */

function report(run: SavedRun, truth: Map<string, TruthRoom>) {
  const { rooms, unscored } = scoreRun(run, truth);
  if (rooms.length === 0) fail('No room in this run has ground truth to score against.');
  for (const room of rooms) console.log(roomLines(room, run.deadlineMs, everyAnswer).join('\n'));
  console.log(summaryLines(run, rooms, unscored).join('\n'));
  console.log('');

  if (compareFile) {
    const baseline = readRun(compareFile);
    console.log(compareLines({ run, rooms }, { run: baseline, rooms: scoreRun(baseline, truth).rooms, file: basename(compareFile) }).join('\n'));
  }
}

async function main() {
  if (mode === 'mock') {
    const truth = loadTruth(EXAMPLE_TRUTH, true);
    console.log('MOCK · the mock detector scored against scripts/eval/example-truth.json – invented rooms, proves the scoring only\n');
    report(mock(truth), truth);
    return;
  }

  const truth = loadTruth(join(photoDir, 'truth.json'), mode !== 'dry-run');
  if (mode === 'dry-run') return dryRun(truth);
  if (mode === 'from') {
    const run = readRun(fromFile!);
    console.log(`SAVED RUN · ${basename(fromFile!)} · "${run.label}" · ${run.model} · scored against today's truth.json\n`);
    return report(run, truth);
  }
  report(await live(truth), truth);
}

void main();
