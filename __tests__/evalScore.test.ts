import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  expandTruth,
  groupSeen,
  headline,
  median,
  missCounts,
  nameSimilarity,
  nameWords,
  readAnswer,
  readTruth,
  scoreRoom,
  scoreRun,
  sideErrors,
  spread,
  wholeMove,
  type Attempt,
  type MeasuredItem,
  type SavedRun,
  type SeenItem,
} from '../scripts/eval/score';
import { roomKeyOf } from '../scripts/eval/photos';

/*
 * The eval's item-level scoring. Its numbers will decide whether the prompt changes,
 * so the rules that turn an answer into those numbers are pinned here – above all
 * that a room's error splits into sizing, missed and extras with nothing lost, and
 * that pairing never hides a missed item behind an unrelated one.
 */

/* ------------------------------------------------------------- fixtures */

function measured(name: string, lengthIn: number, widthIn: number, heightIn: number, aka: string[] = []): MeasuredItem {
  return expandTruth({ roomName: 'Room', items: [{ name, lengthIn, widthIn, heightIn, aka }] })[0]!;
}

function seen(name: string, lengthIn: number, widthIn: number, heightIn: number): SeenItem {
  return { name, lengthIn, widthIn, heightIn, cubicFeet: Math.round(((lengthIn * widthIn * heightIn) / 1728) * 100) / 100, confidence: 'high' };
}

/** A model answer in the shape the prompt asks for. */
function answerText(items: [string, number, number, number][]): string {
  return JSON.stringify({
    items: items.map(([name, lengthIn, widthIn, heightIn]) => ({
      name,
      category: 'furniture',
      dimensions: { lengthIn, widthIn, heightIn },
      confidence: 'high',
    })),
  });
}

function attempt(text: string | null, ms = 5_000, extra: Partial<Attempt> = {}): Attempt {
  return { text, stopReason: 'end_turn', error: text === null ? 'HTTP 529' : null, ms, inputTokens: 5_000, outputTokens: 1_200, ...extra };
}

function run(rooms: SavedRun['rooms']): SavedRun {
  return { format: 'loadsy-eval-run', version: 1, label: 'test', startedAt: '2026-09-14T12:00:00.000Z', model: 'claude-opus-5', maxTokens: 4000, deadlineMs: 11_000, rooms };
}

function savedRoom(roomName: string, attempts: Attempt[]) {
  return { roomName, photoCount: 2, ceilingIn: null, photoHashes: ['a', 'b'], requestHash: 'r', attempts };
}

const LIVING = {
  roomName: 'Living Room',
  items: [
    { name: 'Sofa', lengthIn: 84, widthIn: 36, heightIn: 34 },
    { name: 'Coffee Table', lengthIn: 48, widthIn: 24, heightIn: 18 },
    { name: 'Armchair', lengthIn: 36, widthIn: 34, heightIn: 34 },
  ],
};

/* -------------------------------------------------------------- inventory */

test('a blind inventory counts identical objects together, and keeps different sizes apart', () => {
  const chair = seen('Dining Chair', 18, 20, 36);
  const hidden = { ...chair, confidence: 'low' as const, confidenceReason: 'Mostly behind the table' };
  const groups = groupSeen([seen('Bookshelf', 30, 12, 70), chair, chair, hidden, seen('dining chair', 18, 20, 36), seen('Bookshelf', 36, 12, 84)]);

  // Largest total volume first: four chairs (30 ft³), then each bookshelf by size.
  assert.deepEqual(
    groups.map((g) => [g.item.name, g.item.heightIn, g.count, g.lowCount, g.lowReason]),
    [
      ['Dining Chair', 36, 4, 1, 'Mostly behind the table'],
      ['Bookshelf', 84, 1, 0, null],
      ['Bookshelf', 70, 1, 0, null],
    ],
  );
});

/* ------------------------------------------------------------------ names */

test('names reduce to what the object is, head noun last', () => {
  assert.deepEqual(nameWords('Large Grey 3-Seat Couch'), ['sofa']);
  assert.deepEqual(nameWords('TV (55")'), ['tv']);
  assert.deepEqual(nameWords('Chest of Drawers'), ['dresser']);
  assert.deepEqual(nameWords('Queen Bed Frame'), ['bed']);
  assert.deepEqual(nameWords('Storage Boxes'), ['storage', 'box']);
  assert.deepEqual(nameWords('Side Table'), ['side', 'table']);
});

test('names pair only when they name the same kind of object', () => {
  assert.ok(nameSimilarity(['Sofa'], 'Sectional Couch') > 0);
  assert.ok(nameSimilarity(['Bookcase'], 'Tall Bookshelf') > 0);
  assert.ok(nameSimilarity(['Side Table'], 'Coffee Table') > 0);
  // Sharing a word is not enough: a lamp is not a table.
  assert.equal(nameSimilarity(['Side Table'], 'Table Lamp'), 0);
  assert.equal(nameSimilarity(['TV'], 'TV Stand'), 0);
  // A closer name wins between two candidates of the same kind.
  assert.ok(nameSimilarity(['Coffee Table'], 'Coffee Table') > nameSimilarity(['Side Table'], 'Coffee Table'));
});

test('"aka" in truth.json corrects a pairing the name rules miss', () => {
  assert.equal(nameSimilarity(['Nightstand'], 'End Table'), 0);
  assert.ok(nameSimilarity(['Nightstand', 'end table'], 'End Table') > 0);
});

/* ---------------------------------------------------------------- pairing */

test("a room's error splits into sizing, missed and extras, and they add up exactly", () => {
  const truth = [measured('Sofa', 84, 36, 34), measured('Coffee Table', 48, 24, 18), measured('Armchair', 36, 34, 34)];
  const answer = [seen('Couch', 72, 32, 30), seen('Coffee Table', 48, 24, 18), seen('Floor Lamp', 14, 14, 60)];
  const score = scoreRoom(truth, answer);

  assert.deepEqual(score.pairs.map((p) => [p.measured.name, p.seen.name]).sort(), [['Coffee Table', 'Coffee Table'], ['Sofa', 'Couch']]);
  assert.deepEqual(score.missed.map((m) => m.name), ['Armchair']);
  assert.deepEqual(score.extras.map((e) => e.seen.name), ['Floor Lamp']);

  const { sizing, missed, extras } = score.explained;
  assert.ok(Math.abs(sizing + missed + extras - (score.seenCuFt - score.measuredCuFt)) < 1e-9);
  assert.ok(sizing < 0, 'a sofa sized short is a sizing error');
  assert.equal(missed, -truth[2]!.cubicFeet);
  assert.equal(extras, answer[2]!.cubicFeet);
  assert.ok(Math.abs(score.volumeRecall - (truth[0]!.cubicFeet + truth[1]!.cubicFeet) / score.measuredCuFt) < 1e-9);
});

test('a badly sized item still pairs with what it is – that error is the one being measured', () => {
  const score = scoreRoom([measured('Sofa', 84, 36, 34)], [seen('Sofa', 50, 20, 20)]);
  assert.equal(score.pairs.length, 1);
  assert.ok(score.pairs[0]!.error.volume < -0.7);
});

test('an unrelated object is never paired to hide a miss, even at the same size', () => {
  const score = scoreRoom([measured('Dresser', 60, 20, 34)], [seen('Cabinet', 60, 20, 34)]);
  assert.equal(score.pairs.length, 0);
  assert.equal(score.missed.length, 1);
  assert.equal(score.extras.length, 1);
});

test('the same object counted twice shows as a likely duplicate', () => {
  const score = scoreRoom([measured('Sofa', 84, 36, 34)], [seen('Sofa', 84, 36, 34), seen('Couch', 80, 34, 33)]);
  assert.equal(score.pairs.length, 1);
  assert.equal(score.pairs[0]!.seen.name, 'Sofa', 'the closer size takes the pairing');
  assert.equal(score.extras[0]!.duplicateOf, 'Sofa');
});

test('of two same-kind items, sizes decide which pairs with which', () => {
  const truth = [measured('Side Table', 20, 20, 24), measured('Dining Table', 72, 40, 30)];
  const score = scoreRoom(truth, [seen('Table', 70, 38, 30), seen('Table', 22, 20, 25)]);
  const byMeasured = Object.fromEntries(score.pairs.map((p) => [p.measured.name, p.seen.lengthIn]));
  assert.deepEqual(byMeasured, { 'Side Table': 22, 'Dining Table': 70 });
});

test('side errors ignore which way round length and width were given', () => {
  const errors = sideErrors({ lengthIn: 84, widthIn: 36, heightIn: 34 }, { lengthIn: 36, widthIn: 84, heightIn: 30 });
  assert.equal(errors.long, 0);
  assert.equal(errors.short, 0);
  assert.ok(errors.height < 0);
});

/* ------------------------------------------------------------ ground truth */

test('truth.json typos are reported, not scored', () => {
  const { problems } = readTruth({
    kitchen: {
      roomName: 'Kitchen',
      ceilingFt: 108,
      items: [
        { name: 'Table', lengthIn: 60, widthIn: 36 },
        { name: 'Chair', lengthIn: 18, widthIn: 20, heightIn: 0 },
        { name: 'Stool', lengthIn: 14, widthIn: 14, heightIn: 30, count: 2.5 },
        { lengthIn: 1, widthIn: 1, heightIn: 1 },
      ],
    },
    hall: { items: [] },
  });
  assert.equal(problems.length, 6, problems.join('\n'));
  assert.ok(problems.some((p) => /Table: heightIn/.test(p)));
  assert.ok(problems.some((p) => /Chair: heightIn/.test(p)));
  assert.ok(problems.some((p) => /Stool: "count"/.test(p)));
  assert.ok(problems.some((p) => /item 4: needs a "name"/.test(p)));
  assert.ok(problems.some((p) => /ceilingFt/.test(p)), '108 is inches typed as feet');
  assert.ok(problems.some((p) => /"hall": needs "roomName"/.test(p)));
});

test('truth.json keys resolve to rooms, including the older photo-name keys', () => {
  const { rooms, problems } = readTruth({ 'bedroom.jpg': { roomName: 'Bedroom', items: [] }, 'Living-Room': LIVING }, roomKeyOf);
  assert.deepEqual(problems, []);
  assert.deepEqual([...rooms.keys()], ['bedroom', 'living-room']);
});

test('a counted truth item becomes that many objects', () => {
  const items = expandTruth({ roomName: 'Dining', items: [{ name: 'Dining Chair', lengthIn: 18, widthIn: 20, heightIn: 36, count: 3 }] });
  assert.deepEqual(items.map((i) => i.name), ['Dining Chair (1 of 3)', 'Dining Chair (2 of 3)', 'Dining Chair (3 of 3)']);
});

/* ----------------------------------------------------------------- answers */

test('answers are read with the app parser, so the eval counts only what a user would see', () => {
  const text = JSON.stringify({
    items: [
      { name: 'Sofa', dimensions: { lengthIn: 84, widthIn: 36, heightIn: 34 }, confidence: 'high' },
      // No confidence: the app drops it, so the eval must not count its volume.
      { name: 'Dresser', dimensions: { lengthIn: 60, widthIn: 20, heightIn: 34 } },
    ],
  });
  const answer = readAnswer(text, 'end_turn', 'Living Room');
  assert.ok(answer.ok);
  assert.deepEqual(answer.items.map((i) => i.name), ['Sofa']);
});

test('an unreadable answer keeps its stop reason, which is the diagnosis', () => {
  assert.deepEqual(readAnswer('{"items":[{"name":"So', 'max_tokens', 'Den'), {
    ok: false,
    reason: 'unparseable answer (stop_reason: max_tokens)',
  });
});

/* -------------------------------------------------------------------- runs */

test('a late answer fails as a user would see it, and is still scored as the model gave it', () => {
  const good = answerText([['Sofa', 84, 36, 34], ['Coffee Table', 48, 24, 18], ['Armchair', 36, 34, 34]]);
  const saved = run({ 'living-room': savedRoom('Living Room', [attempt(good, 4_000), attempt(good, 14_000), attempt(null, 900)]) });
  const { rooms } = scoreRun(saved, new Map([['living-room', LIVING]]));

  const shipped = headline(rooms, true);
  const patient = headline(rooms, false);
  assert.deepEqual([shipped.scored, shipped.failed], [1, 2]);
  assert.deepEqual([patient.scored, patient.failed], [2, 1]);
  assert.equal(patient.medianAbsRoomError, 0);
  assert.equal(patient.truckUnder, 0);
});

test('rooms without ground truth are listed, not scored', () => {
  const saved = run({ garage: savedRoom('Garage', [attempt(answerText([]))]) });
  assert.deepEqual(scoreRun(saved, new Map()).unscored, ['garage']);
});

test('repeated answers report their spread, and which items are missed how often', () => {
  const withArmchair = answerText([['Sofa', 84, 36, 34], ['Coffee Table', 48, 24, 18], ['Armchair', 36, 34, 34]]);
  const without = answerText([['Sofa', 84, 36, 34], ['Coffee Table', 48, 24, 18]]);
  const saved = run({ 'living-room': savedRoom('Living Room', [attempt(withArmchair), attempt(without), attempt(without)]) });
  const room = scoreRun(saved, new Map([['living-room', LIVING]])).rooms[0]!;

  assert.deepEqual(missCounts(room), [{ name: 'Armchair', missed: 2, of: 3 }]);

  // Both of a pair missed in one answer is one answer that missed them.
  const pair = { roomName: 'Bedroom', items: [{ name: 'Nightstand', lengthIn: 22, widthIn: 18, heightIn: 26, count: 2 }] };
  const bedroom = scoreRun(run({ bedroom: savedRoom('Bedroom', [attempt(answerText([])), attempt(answerText([['Nightstand', 22, 18, 26]]))]) }), new Map([['bedroom', pair]])).rooms[0]!;
  assert.deepEqual(missCounts(bedroom), [{ name: 'Nightstand', missed: 2, of: 2 }]);
  const s = spread(room)!;
  assert.equal(s.volumes.length, 3);
  assert.ok(s.max > s.min);
  assert.ok(s.cv > 0);
});

test('the whole move adds rooms run by run, and has no answer for a run where a room failed', () => {
  const sofa = answerText([['Sofa', 84, 36, 34]]);
  const saved = run({
    'living-room': savedRoom('Living Room', [attempt(sofa), attempt(sofa)]),
    den: savedRoom('Den', [attempt(sofa), attempt(null)]),
  });
  const truth = new Map([
    ['living-room', { roomName: 'Living Room', items: [{ name: 'Sofa', lengthIn: 84, widthIn: 36, heightIn: 34 }] }],
    ['den', { roomName: 'Den', items: [{ name: 'Sofa', lengthIn: 84, widthIn: 36, heightIn: 34 }] }],
  ]);
  const move = wholeMove(scoreRun(saved, truth).rooms);
  assert.equal(move.runs.length, 2);
  const first = move.runs[0];
  assert.ok(first && Math.abs(first.seenCuFt - move.measuredCuFt) < 1e-9);
  assert.equal(move.runs[1], null);
});

test('median is the middle value, or the mean of the middle two', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});
