import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addCompleted,
  HISTORY_LIMIT,
  isWorthArchiving,
  parseHistory,
  removeCompleted,
  summariseMove,
  type CompletedMove,
} from '../src/domain/moveHistory';
import { buildDemoMove, DEMO_SCENARIOS } from '../src/demo/scenarios';
import { buildRecommendation } from '../src/domain/truck';
import { DEFAULT_PACKING_BUFFER_PCT } from '../src/domain/volume';
import type { Move } from '../src/domain/types';

const AT = '2026-08-27T15:04:05.000Z';

function demoMove(id = 'two-bed'): Move {
  const scenario = DEMO_SCENARIOS.find((s) => s.id === id);
  assert.ok(scenario, `no scenario ${id}`);
  return buildDemoMove(scenario);
}

function emptyMove(): Move {
  return {
    id: 'move-empty',
    rooms: [],
    packingBufferPct: DEFAULT_PACKING_BUFFER_PCT,
    recommendedTruckSize: 'van',
    originZip: '',
    destinationZip: null,
    tripMiles: null,
    moveDate: null,
    status: 'inventory',
  };
}

test('a completed move records what the app said at the time', () => {
  const move = demoMove();
  const record = summariseMove(move, buildRecommendation(move).size, AT);

  assert.equal(record.truckSize, '20ft');
  assert.equal(record.roomCount, 4);
  assert.equal(record.itemCount, 41);
  assert.equal(record.completedAt, AT);
  assert.equal(record.originZip, '78704');
});

test('the stored truck size does not move when the capacity table does', () => {
  // The whole point of freezing it. If this record were re-derived on read, a
  // user told "20 ft truck" in March could open the same record in June and find
  // it now says something else — which is not a record of anything.
  const move = demoMove();
  const record = summariseMove(move, '10ft', AT);
  assert.equal(record.truckSize, '10ft');

  const roundTripped = parseHistory(JSON.stringify([record]))[0];
  assert.equal(roundTripped?.truckSize, '10ft');
});

test('the room and item names survive so a record can be looked at', () => {
  const move = demoMove();
  const record = summariseMove(move, '20ft', AT);

  assert.deepEqual(
    record.rooms.map((r) => r.name),
    ['Living Room', 'Primary Bedroom', 'Second Bedroom', 'Kitchen'],
  );
  const living = record.rooms[0];
  assert.ok(living?.items.some((i) => i.name === 'Sectional Sofa'));
});

test('summarising never reads a clock', () => {
  // Same discipline as the demo scenarios: a function that reads the time cannot
  // be asserted on, and this one is asserted on above.
  const move = demoMove();
  assert.deepEqual(summariseMove(move, '20ft', AT), summariseMove(move, '20ft', AT));
});

test('an empty move is not worth archiving', () => {
  assert.equal(isWorthArchiving(emptyMove()), false);
  assert.equal(isWorthArchiving(demoMove()), true);
});

test('history is newest first', () => {
  const older = summariseMove(demoMove('studio'), '10ft', '2026-01-01T00:00:00.000Z');
  const newer = summariseMove(demoMove('one-bed'), '15ft', '2026-06-01T00:00:00.000Z');

  const history = addCompleted(addCompleted([], older), newer);
  assert.deepEqual(
    history.map((h) => h.truckSize),
    ['15ft', '10ft'],
  );
});

test('archiving the same record twice does not duplicate the row', () => {
  const record = summariseMove(demoMove(), '20ft', AT);
  const history = addCompleted(addCompleted([], record), record);
  assert.equal(history.length, 1);
});

test('history is capped, and it is the oldest record that falls off', () => {
  let history: CompletedMove[] = [];
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
    history = addCompleted(history, {
      ...summariseMove(demoMove('studio'), '10ft', AT),
      id: `record-${i}`,
      // Encoded in the volume so the survivors are identifiable.
      rawCuFt: i,
    });
  }
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[0]?.rawCuFt, HISTORY_LIMIT + 4, 'newest should be first');
  assert.equal(history.at(-1)?.rawCuFt, 5, 'the five oldest should have fallen off');
});

test('removing a record leaves the others alone', () => {
  const a = { ...summariseMove(demoMove('studio'), '10ft', AT), id: 'a' };
  const b = { ...summariseMove(demoMove('one-bed'), '15ft', AT), id: 'b' };
  const history = addCompleted(addCompleted([], a), b);

  assert.deepEqual(
    removeCompleted(history, 'a').map((h) => h.id),
    ['b'],
  );
  // Removing something absent is not an error; the row is already gone.
  assert.equal(removeCompleted(history, 'nope').length, 2);
});

test('one unreadable record does not cost the user every other move', () => {
  // Same salvage policy as parseStoredState. Past moves cannot be recreated, so
  // all-or-nothing parsing here would be the one unrecoverable failure available.
  const good = summariseMove(demoMove('studio'), '10ft', AT);
  const raw = JSON.stringify([good, null, { id: 'no-timestamp' }, 'nonsense', good]);

  const parsed = parseHistory(raw);
  assert.equal(parsed.length, 1, 'the duplicate should also be dropped');
  assert.equal(parsed[0]?.id, good.id);
});

test('a record with an unknown truck size is dropped rather than guessed', () => {
  // Every screen indexes TRUCK_LABEL by this value. A bad one renders "undefined"
  // where the truck name goes, on the row the user came here to read.
  const good = summariseMove(demoMove('studio'), '10ft', AT);
  const raw = JSON.stringify([{ ...good, truckSize: '40ft' }]);
  assert.deepEqual(parseHistory(raw), []);
});

test('unreadable or missing history reads as no history, never as a crash', () => {
  assert.deepEqual(parseHistory(null), []);
  assert.deepEqual(parseHistory(''), []);
  assert.deepEqual(parseHistory('{ not json'), []);
  assert.deepEqual(parseHistory('{"not":"an array"}'), []);
  assert.deepEqual(parseHistory('[]'), []);
});

test('a record survives a full storage round trip unchanged', () => {
  const record = summariseMove(demoMove('three-bed-house'), '26ft', AT);
  assert.deepEqual(parseHistory(JSON.stringify([record])), [record]);
});
