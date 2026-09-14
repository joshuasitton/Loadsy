import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { MAX_PHOTOS } from '../src/domain/capture';
import { UPLOAD_LONG_EDGE, UPLOAD_QUALITY } from '../src/media/uploadSpec';
import {
  buildDetectBody,
  DETECT_MAX_TOKENS,
  SYSTEM_PROMPT,
  userTurn,
} from '../src/vision/detectRequest';

const ROOT = new URL('..', import.meta.url).pathname;

test('every photo of a room goes in one request, images before the question, each numbered', () => {
  const body = buildDetectBody('claude-opus-5', 'Living Room', ['AAA', 'BBB']);
  const content = body.messages[0]!.content;

  assert.deepEqual(
    content.map((block) => block.type),
    ['text', 'image', 'text', 'image', 'text'],
  );
  assert.equal(content[0]!.type === 'text' && content[0]!.text, 'Image 1:');
  assert.equal(content[2]!.type === 'text' && content[2]!.text, 'Image 2:');
  assert.equal(body.system, SYSTEM_PROMPT);
  assert.equal(body.max_tokens, DETECT_MAX_TOKENS);
});

test('the model is told that several images are one room only when there are several', () => {
  assert.match(userTurn('Den', 3), /The 3 images above are different views of this ONE room/);
  assert.doesNotMatch(userTurn('Den', 1), /different views/);
});

test('a request is refused with no photos or more than the route accepts', () => {
  assert.throws(() => buildDetectBody('m', 'Den', []));
  assert.throws(() => buildDetectBody('m', 'Den', Array.from({ length: MAX_PHOTOS + 1 }, () => 'x')));
  assert.doesNotThrow(() => buildDetectBody('m', 'Den', Array.from({ length: MAX_PHOTOS }, () => 'x')));
});

test('the prompt carries the multi-photo section the old eval copy was missing', () => {
  // scripts/eval/prompt.txt stopped at "## Counting" and never had this section, so
  // the eval measured a prompt that told the model nothing about several views of one
  // room – the case the capture screen recommends.
  assert.match(SYSTEM_PROMPT, /## More than one photograph/);
});

/* ------------------------------------------------------ one source of truth */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs|js|txt|md)$/.test(name) ? [path] : [];
  });
}

test('SINGLE SOURCE: the prompt exists in exactly one file', () => {
  // The bug this pins: the route and the eval each held the prompt, and they
  // drifted by 826 characters without anything noticing.
  const opening = SYSTEM_PROMPT.slice(0, 80);
  const holders = ['app', 'src', 'scripts']
    .flatMap((dir) => sourceFiles(join(ROOT, dir)))
    .filter((path) => readFileSync(path, 'utf8').includes(opening))
    .map((path) => path.slice(ROOT.length));

  assert.deepEqual(holders, ['src/vision/detectRequest.ts']);
  assert.equal(existsSync(join(ROOT, 'scripts/eval/prompt.txt')), false);
});

test('SINGLE SOURCE: the route and the eval both build the request through the shared module', () => {
  for (const file of ['app/v1/detect+api.ts', 'scripts/eval/detect.ts']) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.match(source, /import \{[^}]*\bbuildDetectBody\b[^}]*\} from '[./]+\/src\/vision\/detectRequest'/, file);
    assert.match(source, /buildDetectBody\(/, file);
  }
});

test('SINGLE SOURCE: the eval reads the app answer with the app parser and sizes with the app buffer', () => {
  const source = readFileSync(join(ROOT, 'scripts/eval/detect.ts'), 'utf8');
  assert.match(source, /\bparseDetectedItem\b/);
  assert.match(source, /\bDEFAULT_PACKING_BUFFER_PCT\b/);
  assert.doesNotMatch(source, /\*\s*1\.2\b/, 'a hard-coded 1.2 buffer is the drift this replaced');
});

test('the upload size the eval prepares to is the one the app uploads at', () => {
  const prepare = readFileSync(join(ROOT, 'src/media/prepareUpload.ts'), 'utf8');
  assert.match(prepare, /from '\.\/uploadSpec'/);
  assert.doesNotMatch(prepare, /export const UPLOAD_LONG_EDGE\s*=/, 'defined once, in uploadSpec.ts');
  assert.equal(UPLOAD_LONG_EDGE, 1568);
  assert.equal(UPLOAD_QUALITY, 0.8);
});

/* ------------------------------------------------------------- ceiling height */

// The user message exactly as it was before the ceiling question existed, captured
// from the pre-change userTurn on main. A standard or unanswered ceiling must still
// produce these byte for byte.
const BEFORE_ONE_PHOTO =
  'Room label given by the user: "Den"\n\n\nList every object in this room that will be loaded onto the moving truck.\nReturn only JSON of the form {"items":[...]}, with no prose and no markdown.';
const BEFORE_THREE_PHOTOS =
  'Room label given by the user: "Den"\n\nThe 3 images above are different views of this ONE room. Every physical object exists once and must appear exactly once in your output.\n\nList every object in this room that will be loaded onto the moving truck.\nReturn only JSON of the form {"items":[...]}, with no prose and no markdown.';

test('a standard or unanswered ceiling leaves the message exactly as it was', () => {
  for (const ceiling of [undefined, null, 96]) {
    assert.equal(userTurn('Den', 1, ceiling), BEFORE_ONE_PHOTO, `ceiling ${ceiling}`);
    assert.equal(userTurn('Den', 3, ceiling), BEFORE_THREE_PHOTOS, `ceiling ${ceiling}`);
  }
  assert.equal(
    JSON.stringify(buildDetectBody('claude-opus-5', 'Den', ['A'], { ceilingHeightIn: 96 })),
    JSON.stringify(buildDetectBody('claude-opus-5', 'Den', ['A'])),
  );
});

test('a non-standard ceiling is told to the model before the instruction to list', () => {
  const turn = userTurn('Den', 1, 108);
  assert.match(turn, /The ceilings in this home are 108 in \(9 ft\) high, as the user told us/);
  assert.match(turn, /not the typical 96 in/);
  assert.ok(turn.indexOf('108 in') < turn.indexOf('List every object'), 'the height comes before the ask');
  // The system prompt – and so its cacheable prefix – is untouched either way.
  assert.equal(
    buildDetectBody('m', 'Den', ['A'], { ceilingHeightIn: 108 }).system,
    buildDetectBody('m', 'Den', ['A']).system,
  );
});
