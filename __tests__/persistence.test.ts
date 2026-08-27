import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStoredState } from '../src/state/persistence';
import { buildRecommendation } from '../src/domain/truck';
import { DEFAULT_PACKING_BUFFER_PCT } from '../src/domain/volume';

const DIMS = { lengthIn: 84, widthIn: 36, heightIn: 34, isEstimated: true };

function payload(move: unknown, packingPlan: unknown = null): string {
  return JSON.stringify({ move, packingPlan });
}

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    name: 'Sofa',
    category: 'furniture',
    roomId: 'r1',
    dimensions: DIMS,
    cubicFeet: 59.5,
    confidence: 'high',
    confidenceReason: null,
    isFragile: false,
    estimatedWeightClass: 'heavy',
    sourcePhotoId: 'p1',
    userEdited: true,
    ...overrides,
  };
}

function validMove(overrides: Record<string, unknown> = {}) {
  return {
    id: 'move-1',
    rooms: [{ id: 'r1', name: 'Living Room', photoIds: ['p1'], items: [validItem()] }],
    packingBufferPct: 0.2,
    recommendedTruckSize: 'van',
    originZip: '94110',
    destinationZip: null,
    moveDate: null,
    status: 'inventory',
    ...overrides,
  };
}

test('a valid payload round-trips with no repairs', () => {
  const parsed = parseStoredState(payload(validMove()));
  assert.ok(parsed);
  assert.deepEqual(parsed.repairs, []);
  assert.equal(parsed.move.rooms[0]?.items[0]?.cubicFeet, 59.5);
});

test('unsalvageable payloads return null instead of throwing', () => {
  // Every one of these previously threw during render, from the reducer, where no
  // try/catch in the loading effect could reach it — bricking the app on relaunch.
  for (const raw of ['', 'not json', '{', 'null', '[]', '"a string"', '{"packingPlan":null}', '{"move":null}', '{"move":42}']) {
    assert.equal(parseStoredState(raw), null, `expected null for: ${raw}`);
  }
});

test('structurally broken payloads are salvaged rather than crashing', () => {
  const cases: [string, string][] = [
    ['rooms is null', payload(validMove({ rooms: null }))],
    ['rooms contains null', payload(validMove({ rooms: [null] }))],
    ['room has no items array', payload(validMove({ rooms: [{ id: 'r1', name: 'Kitchen' }] }))],
    ['item has no dimensions', payload(validMove({ rooms: [{ id: 'r1', name: 'K', items: [{ id: 'i', name: 'Sofa', cubicFeet: 59.5 }] }] }))],
  ];
  for (const [label, raw] of cases) {
    const parsed = parseStoredState(raw);
    assert.ok(parsed, `${label}: expected salvage, got null`);
    assert.ok(parsed.repairs.length > 0, `${label}: expected a reported repair`);
    // The real invariant: whatever survives must produce usable numbers.
    const rec = buildRecommendation(parsed.move);
    assert.ok(Number.isFinite(rec.rawCuFt), `${label}: rawCuFt was ${rec.rawCuFt}`);
    assert.ok(Number.isFinite(rec.adjustedCuFt), `${label}: adjustedCuFt was ${rec.adjustedCuFt}`);
  }
});

test('a missing or non-numeric packing buffer never poisons the volume maths', () => {
  // clampBuffer only guarded NaN, so undefined produced NaN, adjustedVolumeCuFt
  // became NaN, and recommendTruckSize fell through every comparison and returned
  // '26ft' — the largest, priciest truck, for any load.
  for (const bad of [undefined, null, 'abc', {}, NaN]) {
    const parsed = parseStoredState(payload(validMove({ packingBufferPct: bad })));
    assert.ok(parsed);
    const rec = buildRecommendation(parsed.move);
    assert.ok(Number.isFinite(rec.adjustedCuFt), `buffer ${String(bad)} produced ${rec.adjustedCuFt}`);
    assert.notEqual(rec.size, '26ft', `buffer ${String(bad)} wrongly recommended the largest truck`);
  }
  const parsed = parseStoredState(payload(validMove({ packingBufferPct: undefined })));
  assert.equal(parsed?.move.packingBufferPct, DEFAULT_PACKING_BUFFER_PCT);
});

test('cubicFeet is recomputed, never read as a string', () => {
  // '0' + '10' + '20' concatenated to '01020', reporting 30 ft³ as 1020 ft³ and
  // sizing a one-room move as a 26ft truck.
  const raw = payload(
    validMove({
      rooms: [{
        id: 'r1', name: 'Kitchen', photoIds: [], items: [
          validItem({ id: 'a', cubicFeet: '10', dimensions: { lengthIn: 12, widthIn: 12, heightIn: 12, isEstimated: true } }),
          validItem({ id: 'b', cubicFeet: '20', dimensions: { lengthIn: 24, widthIn: 12, heightIn: 12, isEstimated: true } }),
        ],
      }],
    }),
  );
  const parsed = parseStoredState(raw);
  assert.ok(parsed);
  const total = parsed.move.rooms[0]!.items.reduce((n, i) => n + i.cubicFeet, 0);
  assert.equal(Math.round(total * 100) / 100, 3, `expected 3 ft³, got ${total}`);
  assert.ok(parsed.repairs.some((r) => r.includes('recomputed')));
});

test('a packing plan without loadSteps is dropped, not persisted into a crash loop', () => {
  const parsed = parseStoredState(payload(validMove(), { id: 'p1', moveId: 'm1', truckMapSVG: null }));
  assert.ok(parsed);
  assert.equal(parsed.packingPlan, null);
  assert.ok(parsed.repairs.some((r) => r.includes('packing plan')));
});

test('an unknown status is reset so the progress tracker cannot read -1', () => {
  const parsed = parseStoredState(payload(validMove({ status: 'done' })));
  assert.ok(parsed);
  assert.equal(parsed.move.status, 'inventory');
});

test('duplicate item ids are dropped so edits cannot hit two rows at once', () => {
  const parsed = parseStoredState(payload(validMove({
    rooms: [{ id: 'r1', name: 'K', photoIds: [], items: [validItem({ id: 'dup' }), validItem({ id: 'dup' })] }],
  })));
  assert.ok(parsed);
  assert.equal(parsed.move.rooms[0]?.items.length, 1);
});

test('a low-confidence item always arrives with a reason (contract 4.1)', () => {
  const parsed = parseStoredState(payload(validMove({
    rooms: [{ id: 'r1', name: 'K', photoIds: [], items: [validItem({ confidence: 'low', confidenceReason: null })] }],
  })));
  assert.ok(parsed);
  const item = parsed.move.rooms[0]?.items[0];
  assert.equal(item?.confidence, 'low');
  assert.ok(item?.confidenceReason && item.confidenceReason.length > 0);
});

test('the save timestamp round-trips, and a missing one is not an error', () => {
  // Only ever displayed. A payload written by a build that predates the field
  // must still load — it is somebody's move, and a caption is not worth losing it for.
  const move = { id: 'm', rooms: [], packingBufferPct: 0.2, recommendedTruckSize: 'van',
    originZip: '', destinationZip: null, moveDate: null, status: 'inventory' };

  const withStamp = parseStoredState(
    JSON.stringify({ move, savedAt: '2026-08-27T15:04:05.000Z' }),
  );
  assert.equal(withStamp?.savedAt, '2026-08-27T15:04:05.000Z');

  assert.equal(parseStoredState(JSON.stringify({ move }))?.savedAt, null);
  assert.equal(parseStoredState(JSON.stringify({ move, savedAt: 42 }))?.savedAt, null);
  assert.equal(parseStoredState(JSON.stringify({ move, savedAt: '  ' }))?.savedAt, null);
});
