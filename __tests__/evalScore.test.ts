import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  combinations,
  crossRoomItems,
  expandTruth,
  groupSeen,
  mergeRuns,
  moveScenarios,
  truckLineMargin,
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

test('names from the first real room pair with what was measured', () => {
  // Scoring the second family-room answer, these went unpaired: the model named the
  // parts of a sectional, the truth named what a table holds, and a map is wall art.
  assert.ok(nameSimilarity(['Sectional Sofa (77 in piece)'], 'Sectional Sofa Long Run') > 0);
  assert.ok(nameSimilarity(['Sectional Sofa (64 in piece)'], 'Sectional Chaise Section') > 0);
  assert.ok(nameSimilarity(['Wood Side Table with Drawer'], 'Wood End Table') > 0);
  assert.ok(nameSimilarity(['Framed World Map Canvas'], 'Framed World Map') > nameSimilarity(['Framed World Map Canvas'], 'Birch Forest Canvas Art'));
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

  // Same kind, very different size: another object, not a second count. (The first
  // real room: a 36 in console table flagged as a duplicate of an 18 in side table.)
  const tables = scoreRoom([measured('Side Table', 18, 18, 24)], [seen('Side Table', 18, 18, 22), seen('Console Table', 36, 16, 30)]);
  assert.equal(tables.extras[0]!.duplicateOf, null);
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

/* ---------------------------------------------------------- move scenarios */

const HUTCH = { name: 'Hutch', lengthIn: 72, widthIn: 20, heightIn: 80 };
const SOFA = { name: 'Sofa', lengthIn: 84, widthIn: 36, heightIn: 34 };

function twoRoomRun(family: Attempt[], breakfast: Attempt[]): SavedRun {
  return run({ 'family-room': savedRoom('Family Room', family), 'breakfast-room': savedRoom('Breakfast Room', breakfast) });
}

const TWO_ROOMS = new Map([
  ['family-room', { roomName: 'Family Room', complete: true, items: [SOFA] }],
  ['breakfast-room', { roomName: 'Breakfast Room', items: [HUTCH] }],
]);

test('combinations come smallest first, with every set of at least the minimum size', () => {
  assert.deepEqual(combinations(['a', 'b', 'c'], 2), [['a', 'b'], ['a', 'c'], ['b', 'c'], ['a', 'b', 'c']]);
  assert.equal(combinations([1, 2, 3, 4], 2).length, 11, 'four rooms make eleven moves');
});

test('the truck-line margin is how far the buffered load sits from the nearest line', () => {
  // 10 ft usable capacity is 341.7 ft³; 284.75 raw is 341.7 buffered – on the line.
  assert.ok(truckLineMargin(284.75) < 0.001);
  assert.ok(truckLineMargin(200) > 0.1);
});

test('an item listed in the wrong room of a move is found, and counted twice only when its own room listed it too', () => {
  const hutchAndSofa = answerText([['Sofa', 84, 36, 34], ['Hutch', 72, 20, 80]]);
  const sofaOnly = answerText([['Sofa', 84, 36, 34]]);
  const { rooms } = scoreRun(twoRoomRun([attempt(hutchAndSofa), attempt(hutchAndSofa)], [attempt(answerText([['Hutch', 70, 20, 78]])), attempt(answerText([]))]), TWO_ROOMS);

  const first = crossRoomItems(rooms, 0);
  assert.deepEqual(first.map((item) => [item.name, item.listedIn, item.belongsTo, item.countedTwice]), [['Hutch', 'Family Room', 'Breakfast Room', true]]);
  // Answer 2: the breakfast room missed its own hutch, so the move has it once – misplaced.
  assert.equal(crossRoomItems(rooms, 1)[0]!.countedTwice, false);
  // Paired with the wrong item in its own room, it is still found when it fits the other
  // room's measurement clearly better – and a hutch named "cabinet" is still a hutch.
  const truth = new Map([
    ['family-room', { roomName: 'Family Room', items: [SOFA, { name: 'Side Table', lengthIn: 14, widthIn: 14, heightIn: 22 }] }],
    ['breakfast-room', { roomName: 'Breakfast Room', items: [HUTCH, { name: 'Console Table', lengthIn: 38, widthIn: 16, heightIn: 30 }] }],
  ]);
  const hidden = scoreRun(
    twoRoomRun(
      [attempt(answerText([['Sofa', 84, 36, 34], ['Narrow Console Table', 36, 16, 32], ['Glass-Front Hutch Cabinet', 70, 20, 76]]))],
      [attempt(answerText([['Hutch', 72, 20, 80], ['Console Table', 38, 16, 30]]))],
    ),
    truth,
  ).rooms;
  assert.deepEqual(crossRoomItems(hidden, 0).map((item) => item.name).sort(), ['Glass-Front Hutch Cabinet', 'Narrow Console Table']);

  // Nothing to find when the family room lists only its own sofa.
  const clean = scoreRun(twoRoomRun([attempt(sofaOnly)], [attempt(answerText([['Hutch', 72, 20, 80]]))]), TWO_ROOMS).rooms;
  assert.deepEqual(crossRoomItems(clean, 0), []);
});

test('each move is sized from every room answer together, and a failed room leaves that answer out', () => {
  const sofa = answerText([['Sofa', 84, 36, 34]]);
  const hutch = answerText([['Hutch', 72, 20, 80]]);
  const { rooms } = scoreRun(twoRoomRun([attempt(sofa), attempt(sofa)], [attempt(hutch), attempt(null)]), TWO_ROOMS);
  const [move] = moveScenarios(rooms);

  assert.deepEqual(move!.keys, ['family-room', 'breakfast-room']);
  assert.equal(move!.answers[0]!.verdict, 'exact');
  assert.equal(move!.answers[1], null);
  // One room is not marked complete, so the move is provisional.
  assert.equal(move!.complete, false);
});

test('a room set up in truth.json but not measured is saved for later, not scored against nothing', () => {
  const truth = new Map([...TWO_ROOMS, ['kids-room', { roomName: 'Kids Room', items: [] }]]);
  const saved = run({ ...twoRoomRun([attempt(answerText([]))], [attempt(answerText([]))]).rooms, 'kids-room': savedRoom('Kids Room', [attempt(answerText([['Bed', 80, 40, 20]]))]) });
  const scored = scoreRun(saved, truth);
  assert.deepEqual(scored.unmeasured, ['kids-room']);
  assert.deepEqual(scored.rooms.map((room) => room.key).sort(), ['breakfast-room', 'family-room']);
});

test('runs made separately merge into one, and say when they used different requests', () => {
  const a = run({ 'family-room': savedRoom('Family Room', [attempt(answerText([]))]) });
  const b = { ...run({ 'kids-room': savedRoom('Kids Room', [attempt(answerText([]))]) }), maxTokens: 8000 };
  const merged = mergeRuns([a, b]);
  assert.deepEqual(Object.keys(merged.run.rooms).sort(), ['family-room', 'kids-room']);
  assert.match(merged.mismatch!, /different requests/);
  assert.equal(mergeRuns([a, a]).mismatch, null);
});

test('truth.json checks the set-up fields too', () => {
  const { rooms, problems } = readTruth({
    den: { roomName: 'Den', items: [], complete: 'yes', toMeasure: 'the sofa' },
    hall: { roomName: 'Hall', items: [], complete: true, toMeasure: ['Coat rack'] },
  });
  assert.equal(problems.length, 2, problems.join('\n'));
  assert.equal(rooms.get('hall')!.complete, true);
  assert.equal(rooms.get('den')!.complete, undefined);
});
